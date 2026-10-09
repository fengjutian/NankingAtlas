import { Injectable } from '@nestjs/common';

import { prisma } from '../../lib/prisma.js';

/**
 * 地点空间查询（P3-01）。
 *
 * 技术方案 §7.2：`GET /places?bbox=&type=&q=&cursor=&limit=`
 * §9.2：「只加载当前视口 bbox 数据，移动结束后去抖请求；取消过期请求」
 *       「未核实或仅区域级位置不画精确点」
 *
 * 数据层是 SQLite（无 PostGIS），用 R*Tree 虚表做粗筛 + 浮点精确判定。
 */

/** 经纬度放大因子（R*Tree 只支持整数）。约 11 m 精度。 */
const COORD_SCALE = 10_000;

/** bbox 查询的面积上限（平方度）。防止一次拉取全球数据。 */
export const MAX_BBOX_AREA = 4; // 约 2°×2°，覆盖南京都会区

/** 单次返回上限。 */
export const MAX_PLACE_RESULTS = 200;

export interface BboxQuery {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface BboxValidationError {
  field: string;
  message: string;
}

/**
 * 校验 bbox。
 *
 * 明确拒绝：反向矩形（minLon > maxLon）、超出经纬度范围、面积超限。
 */
export function validateBbox(input: {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}): { ok: true; bbox: BboxQuery } | { ok: false; errors: BboxValidationError[] } {
  const errors: BboxValidationError[] = [];
  const { minLon, minLat, maxLon, maxLat } = input;

  for (const [name, value] of [
    ['minLon', minLon],
    ['minLat', minLat],
    ['maxLon', maxLon],
    ['maxLat', maxLat],
  ] as const) {
    if (!Number.isFinite(value)) {
      errors.push({ field: name, message: '必须是有限数字' });
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (minLon < -180 || maxLon > 180) {
    errors.push({ field: 'bbox', message: '经度必须在 -180 ~ 180 之间' });
  }
  if (minLat < -90 || maxLat > 90) {
    errors.push({ field: 'bbox', message: '纬度必须在 -90 ~ 90 之间' });
  }
  if (minLon >= maxLon) {
    errors.push({ field: 'bbox', message: 'minLon 必须小于 maxLon' });
  }
  if (minLat >= maxLat) {
    errors.push({ field: 'bbox', message: 'minLat 必须小于 maxLat' });
  }

  const area = (maxLon - minLon) * (maxLat - minLat);
  if (area > MAX_BBOX_AREA) {
    errors.push({
      field: 'bbox',
      message: `查询区域过大（${area.toFixed(2)} 平方度，上限 ${String(MAX_BBOX_AREA)}），请缩小范围`,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, bbox: { minLon, minLat, maxLon, maxLat } };
}

/** bbox 中心点（用于地图初始定位）。 */
export function bboxCenter(bbox: BboxQuery): { lon: number; lat: number } {
  return {
    lon: (bbox.minLon + bbox.maxLon) / 2,
    lat: (bbox.minLat + bbox.maxLat) / 2,
  };
}

export interface PlaceRow {
  contentId: string;
  slug: string;
  title: string;
  summary: string | null;
  type: string;
  lon: number | null;
  lat: number | null;
  accuracy: string;
  verificationStatus: string;
}

export interface PointLike {
  accuracy: string;
  verificationStatus: string;
  lon: number | null;
  lat: number | null;
}

/**
 * 坐标是否可用于地图精确点。
 *
 * AGENTS.md §3.5「未确认坐标不得猜测精确点」：
 * 只有 `EXACT` + `VERIFIED` 才返回精确经纬度。
 */
export function hasTrustedPoint(row: PointLike): boolean {
  return (
    row.accuracy === 'EXACT' &&
    row.verificationStatus === 'VERIFIED' &&
    row.lon !== null &&
    row.lat !== null
  );
}

/** 坐标不可信时的说明文案（前端地图标注用）。 */
export function pointDisplay(row: PointLike): { hasPoint: boolean; note: string | null } {
  if (hasTrustedPoint(row)) {
    return { hasPoint: true, note: null };
  }
  if (row.lon === null || row.lat === null) {
    return { hasPoint: false, note: '坐标未核验，仅展示文字说明' };
  }
  switch (row.accuracy) {
    case 'AREA_ONLY':
      return { hasPoint: false, note: '仅有区域级位置，不展示精确点' };
    case 'APPROXIMATE':
      return { hasPoint: false, note: '坐标为近似值，未完成核验' };
    case 'UNKNOWN':
      return { hasPoint: false, note: '坐标未核验，不展示精确点' };
    default:
      return { hasPoint: false, note: '坐标状态未确认' };
  }
}

interface RawPlaceRow {
  content_id: string;
  slug: string;
  title: string;
  summary: string | null;
  type: string;
  lon: number | null;
  lat: number | null;
  accuracy: string;
  verification_status: string;
}

/**
 * 地点空间查询。
 *
 * 用 `lib/prisma.js` 的**共享单例**而不是注入 PrismaClient：
 * 单例里已处理热重载泄漏，而 Nest 注入会在测试环境丢 paramtypes
 * （vitest 用 esbuild，不产出装饰器元数据），表现为运行时 `undefined`。
 */
@Injectable()
export class PlacesQueryService {
  /** 内部查询句柄；抽成字段便于测试注入与重建索引。 */
  private readonly db = prisma;

  /**
   * bbox 范围查询。
   *
   * 两段式：R*Tree 粗筛 → 浮点精确判定。
   * 不用 `lon BETWEEN ? AND ?` 直查是因为那会全表扫描；
   * R*Tree 先把候选集压到几十条再精确判定。
   *
   * R*Tree 存的是放大取整坐标，粗筛会**多**返回少量边界点，
   * 由第二段浮点比较剔除 —— 宁可多查一次，不可漏掉边界上的地点。
   */
  async findInBbox(input: {
    bbox: BboxQuery;
    type?: string | undefined;
    limit: number;
  }): Promise<PlaceRow[]> {
    const { bbox } = input;
    const scale = COORD_SCALE;
    const pad = 1 / scale;
    const typeFilter = input.type;

    // Prisma 的 $queryRaw 不支持在参数里放标识符，但**值**可以参数化。
    // type 用 `IS NULL OR type = ?` 形式避免拼接。
    const rows = await this.db.$queryRaw<RawPlaceRow[]>`
      SELECT p.content_id            AS content_id,
             c.slug                  AS slug,
             c.title                 AS title,
             c.summary               AS summary,
             c.type                  AS type,
             p.lon                   AS lon,
             p.lat                   AS lat,
             p.accuracy              AS accuracy,
             p.verification_status   AS verification_status
        FROM places_rtree r
        JOIN place_rtree_ids m ON m.rid = r.id
        JOIN places p ON p.content_id = m.content_id
        JOIN contents c ON c.id = p.content_id
       WHERE r.max_lon >= ${(bbox.minLon - pad) * scale}
         AND r.min_lon <= ${(bbox.maxLon + pad) * scale}
         AND r.max_lat >= ${(bbox.minLat - pad) * scale}
         AND r.min_lat <= ${(bbox.maxLat + pad) * scale}
         AND c.status = 'PUBLISHED'
         AND c.archived_at IS NULL
         AND (${typeFilter ?? null} IS NULL OR c.type = ${typeFilter ?? null})
       LIMIT ${input.limit * 3}
    `;

    // 精确判定：R*Tree 粗筛用整数，放大取整可能带进 bbox 外 ±11 m 的点
    return rows
      .filter(
        (row) =>
          row.lon !== null &&
          row.lat !== null &&
          row.lon >= bbox.minLon &&
          row.lon <= bbox.maxLon &&
          row.lat >= bbox.minLat &&
          row.lat <= bbox.maxLat,
      )
      .slice(0, input.limit)
      .map((row) => ({
        contentId: row.content_id,
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        type: row.type,
        lon: row.lon,
        lat: row.lat,
        accuracy: row.accuracy,
        verificationStatus: row.verification_status,
      }));
  }

  /** 重建 R*Tree 内容。写入地点坐标后调用（虚表不能由触发器直接写）。 */
  async rebuildIndex(): Promise<void> {
    await this.db.$executeRawUnsafe('DELETE FROM places_rtree');
    await this.db.$executeRawUnsafe(
      `INSERT INTO places_rtree(id, min_lon, max_lon, min_lat, max_lat)
       SELECT rid,
              CAST(ROUND(lon * ${String(COORD_SCALE)}) AS INTEGER),
              CAST(ROUND(lon * ${String(COORD_SCALE)}) AS INTEGER),
              CAST(ROUND(lat * ${String(COORD_SCALE)}) AS INTEGER),
              CAST(ROUND(lat * ${String(COORD_SCALE)}) AS INTEGER)
         FROM place_rtree_ids
        WHERE lon IS NOT NULL AND lat IS NOT NULL`,
    );
  }
}
