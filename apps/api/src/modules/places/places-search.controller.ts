import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';

import { CONTENT_TYPES } from '@nanking-atlas/database';

import {
  MAX_PLACE_RESULTS,
  PlacesQueryService,
  bboxCenter,
  pointDisplay,
  validateBbox,
} from './places-query.service.js';
import { RoutesService } from './routes.service.js';
import { searchPublicContent } from './search.service.js';
import { Public, RequireRoles } from '../../common/auth/roles.decorator.js';

/**
 * 地图与搜索公开接口（P3-02 / P3-03 / P3-05）。
 *
 * 技术方案 §7.2：
 *   GET /places?bbox=&type=&q=&cursor=&limit=
 *   GET /search?q=&type=&cursor=&limit=
 */

const bboxQuerySchema = z.object({
  bbox: z.string().min(1),
  type: z.enum(CONTENT_TYPES).optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PLACE_RESULTS).default(100),
});

const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  type: z.enum(CONTENT_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export class RouteNotFoundError extends Error {
  constructor(slug: string) {
    super(`route not found: ${slug}`);
    this.name = 'RouteNotFoundError';
  }
}

export class QueryValidationError extends Error {
  constructor(public readonly issues: { field: string; message: string }[]) {
    super('invalid query parameters');
    this.name = 'QueryValidationError';
  }
}

/**
 * 解析 `bbox=minLon,minLat,maxLon,maxLat`。
 *
 * 技术方案 §7.2：「地图查询要求合法 bbox」。解析失败一律 400，
 * 不用"尽量解析" —— 静默接受非法 bbox 会让地图漂移到错误区域。
 */
export function parseBboxParam(raw: string): {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
} {
  const parts = raw.split(',').map((part) => part.trim());
  if (parts.length !== 4) {
    throw new QueryValidationError([
      { field: 'bbox', message: 'bbox 必须是 minLon,minLat,maxLon,maxLat 四个数字' },
    ]);
  }
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((value) => !Number.isFinite(value))) {
    throw new QueryValidationError([{ field: 'bbox', message: 'bbox 的每一项都必须是数字' }]);
  }
  const [minLon, minLat, maxLon, maxLat] = numbers as [number, number, number, number];
  return { minLon, minLat, maxLon, maxLat };
}

@Controller()
export class PlacesSearchController {
  /** 显式 @Inject：见 auth.controller.ts 的同款说明（vitest 不产出 paramtypes）。 */
  constructor(
    @Inject(PlacesQueryService) private readonly places: PlacesQueryService,
    @Inject(RoutesService) private readonly routes: RoutesService,
  ) {}

  /** GET /places?bbox= —— 视口范围内的地点。 */
  @Public()
  @Get('places')
  async listPlaces(@Query() rawQuery: unknown): Promise<{ data: unknown }> {
    const query = bboxQuerySchema.parse(rawQuery);
    const parsed = parseBboxParam(query.bbox);
    const validation = validateBbox(parsed);
    if (!validation.ok) {
      throw new QueryValidationError(validation.errors);
    }

    const rows = await this.places.findInBbox({
      bbox: validation.bbox,
      ...(query.type !== undefined ? { type: query.type } : {}),
      limit: query.limit,
    });

    // 坐标不可信的地点仍然返回（列表可用），但不给出精确点 ——
    // 技术方案 §9.2「未核实或仅区域级位置不画精确点，可显示区域说明」。
    return {
      data: {
        bbox: validation.bbox,
        center: bboxCenter(validation.bbox),
        total: rows.length,
        truncated: rows.length >= query.limit,
        items: rows.map((row) => {
          const display = pointDisplay(row);
          return {
            slug: row.slug,
            title: row.title,
            summary: row.summary,
            type: row.type,
            // 不可信时置 null，前端据此不画 marker
            lon: display.hasPoint ? row.lon : null,
            lat: display.hasPoint ? row.lat : null,
            hasPoint: display.hasPoint,
            note: display.note,
            accuracy: row.accuracy,
            verificationStatus: row.verificationStatus,
          };
        }),
      },
    };
  }

  /** GET /search?q= —— 关键词检索。 */
  @Public()
  @Get('search')
  async search(@Query() rawQuery: unknown): Promise<{ data: unknown }> {
    const query = searchQuerySchema.parse(rawQuery);
    const result = await searchPublicContent({
      q: query.q,
      ...(query.type !== undefined ? { type: query.type } : {}),
      limit: query.limit,
    });
    return { data: result };
  }

  /** GET /routes/:slug —— 路线与有序站点（P3-06）。 */
  @Public()
  @Get('routes/:slug')
  async getRoute(@Param('slug') slug: string): Promise<{ data: unknown }> {
    const route = await this.routes.getPublicRoute(slug);
    if (route === null) {
      // 与其它公开端点一致：不泄露"存在但未发布"
      throw new RouteNotFoundError(slug);
    }
    return { data: route };
  }

  /**
   * POST /admin/places/reindex —— 重建空间索引。
   *
   * R*Tree 是虚表，触发器不能直接写（SQLite 限制），
   * 所以坐标变更后需要显式 refresh。挂成管理端点而不是每次查询时重建：
   * 重建是 O(n) 全表操作，不能挂在读路径上。
   */
  @Post('admin/places/reindex')
  @RequireRoles('ADMIN')
  async reindex(): Promise<{ data: { ok: true } }> {
    await this.places.rebuildIndex();
    return { data: { ok: true } };
  }
}

/** 供 seed / 测试使用：直接重建索引。 */
export async function rebuildPlaceIndexForAdmin(): Promise<void> {
  const service = new PlacesQueryService();
  await service.rebuildIndex();
}
