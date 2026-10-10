/**
 * 地图几何与 bbox 校验（P3-02 / P3-04）。
 *
 * 事实依据：技术方案 §9.2「只加载当前视口 bbox 数据」。
 *
 * 三条硬约束：
 * 1. **这里不存放任何内容坐标**。本文件只有"视窗"（bbox）——即查询范围，
 *    不是某条内容的经纬度。内容坐标只能来自 API，禁止在此编造（AGENTS.md §3.5）。
 * 2. bbox 必须先过 `validateBBox` 再发请求：反向、NaN、超出世界范围、
 *    跨度过大的窗口都要在客户端就拒掉，避免打出注定 400 的请求。
 * 3. 所有解析都返回 `null`/错误码，不抛异常 —— 地图是增强功能，
 *    参数问题不能让页面崩溃。
 */

// `map-coords` 反过来用 `import type` 引用本文件的 `LonLat`（编译期擦除），
// 因此这条运行时依赖不会成环。

export interface LonLat {
  readonly lon: number;
  readonly lat: number;
}

/** 与 `GET /api/v1/places?bbox=minLon,minLat,maxLon,maxLat` 同序。 */
export interface MapBBox {
  readonly minLon: number;
  readonly minLat: number;
  readonly maxLon: number;
  readonly maxLat: number;
}

/** 地图 SDK 视窗边界的最小结构（避免在纯逻辑里依赖高德的 `AMap.Bounds` 类型）。 */
export interface ViewportBounds {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

/**
 * 初始视窗：南京主城及其近郊的**查询范围**。
 *
 * 取值与 `GET /api/v1/places` 契约示例的 bbox 一致
 * （`118.7,32.0,118.9,32.2`），仅作为首屏默认窗口，不表示任何一条内容的坐标。
 * 用户可以用 `?bbox=` 覆盖；覆盖值同样要过 `validateBBox`。
 */
export const DEFAULT_MAP_BBOX: Readonly<MapBBox> = Object.freeze({
  minLon: 118.7,
  minLat: 32.0,
  maxLon: 118.9,
  maxLat: 32.2,
});

/** 首屏地图中心与缩放级别：只描述视口，不描述内容。 */
export const DEFAULT_MAP_VIEWPORT: Readonly<{ readonly center: LonLat; readonly zoom: number }> =
  Object.freeze({ center: { lon: 118.8, lat: 32.1 }, zoom: 11 });

/** bbox 单次查询的最大跨度（度）。超过即判定为"范围过大"。 */
export const MAX_BBOX_SPAN_DEG = 1.5;

/** bbox 跨度过小（度）。小于此值说明窗口退化，多半是误输入。 */
export const MIN_BBOX_SPAN_DEG = 0.005;

export const MAP_RESULT_LIMIT = 200;

/** 地图一次查询最多允许占用的长宽跨度；与 API 侧的面积上限保持一致的保守取值。 */
export const MAX_BBOX_AREA_SQ_DEG = MAX_BBOX_SPAN_DEG * MAX_BBOX_SPAN_DEG;

export type BBoxErrorCode = 'malformed' | 'reversed' | 'out_of_range' | 'too_large';

export interface BBoxCheckOk {
  readonly ok: true;
  readonly bbox: MapBBox;
}

export interface BBoxCheckError {
  readonly ok: false;
  readonly code: BBoxErrorCode;
}

export type BBoxCheck = BBoxCheckOk | BBoxCheckError;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 校验 bbox。
 *
 * 判定顺序刻意固定：先 `malformed`（不是数字），再 `out_of_range`（超出经纬度上限），
 * 再 `reversed`（min > max），最后 `too_large`。顺序变了提示语会跟着错，
 * 所以这个顺序本身是被单测钉住的契约。
 */
export function validateBBox(bbox: unknown): BBoxCheck {
  if (typeof bbox !== 'object' || bbox === null) {
    return { ok: false, code: 'malformed' };
  }
  const candidate = bbox as Partial<Record<keyof MapBBox, unknown>>;
  const { minLon, minLat, maxLon, maxLat } = candidate;
  if (
    !isFiniteNumber(minLon) ||
    !isFiniteNumber(minLat) ||
    !isFiniteNumber(maxLon) ||
    !isFiniteNumber(maxLat)
  ) {
    return { ok: false, code: 'malformed' };
  }

  if (
    minLon < -180 ||
    minLon > 180 ||
    maxLon < -180 ||
    maxLon > 180 ||
    minLat < -90 ||
    minLat > 90 ||
    maxLat < -90 ||
    maxLat > 90
  ) {
    return { ok: false, code: 'out_of_range' };
  }

  if (minLon >= maxLon || minLat >= maxLat) {
    return { ok: false, code: 'reversed' };
  }

  const spanLon = maxLon - minLon;
  const spanLat = maxLat - minLat;
  if (spanLon > MAX_BBOX_SPAN_DEG || spanLat > MAX_BBOX_SPAN_DEG) {
    return { ok: false, code: 'too_large' };
  }

  return { ok: true, bbox: { minLon, minLat, maxLon, maxLat } };
}

/**
 * 解析 `minLon,minLat,maxLon,maxLat`。
 *
 * 只做"能不能解析成四个数"，跨度与方向校验交给 `validateBBox`，
 * 这样调用方可以给出更精确的错误分类。
 */
export function parseBBox(raw: string): MapBBox | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parts = trimmed.split(',');
  if (parts.length !== 4) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    const token = part.trim();
    // 只接受十进制数字（可带负号 / 小数 / 指数），拒绝 ""、"Infinity"、"NaN"
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(token)) return null;
    const value = Number.parseFloat(token);
    if (!Number.isFinite(value)) return null;
    numbers.push(value);
  }
  const [minLon, minLat, maxLon, maxLat] = numbers;
  if (
    minLon === undefined ||
    minLat === undefined ||
    maxLon === undefined ||
    maxLat === undefined
  ) {
    return null;
  }
  return { minLon, minLat, maxLon, maxLat };
}

/** 解析并校验，返回带错误码的结果（UI 用它给出"缩小范围"之类的提示）。 */
export function parseAndValidateBBox(raw: string): BBoxCheck {
  const parsed = parseBBox(raw);
  if (parsed === null) return { ok: false, code: 'malformed' };
  return validateBBox(parsed);
}

/** 序列化为 API 契约要求的顺序：固定小数位，避免浮点尾数抖动打出不同 URL。 */
export function formatBBox(bbox: MapBBox, precision = 4): string {
  const round = (value: number): string => value.toFixed(precision);
  return [round(bbox.minLon), round(bbox.minLat), round(bbox.maxLon), round(bbox.maxLat)].join(',');
}

/** 地图移动 → 请求 bbox。跨 180° 经线时 SDK 可能给出 west > east，这里不吞异常，交由校验拒绝。 */
export function bboxFromBounds(bounds: ViewportBounds): MapBBox {
  return {
    minLon: Math.min(bounds.west, bounds.east),
    minLat: Math.min(bounds.south, bounds.north),
    maxLon: Math.max(bounds.west, bounds.east),
    maxLat: Math.max(bounds.south, bounds.north),
  };
}

export function bboxCenter(bbox: MapBBox): LonLat {
  // 6 位小数：低于地图可视精度，又足以消掉 (118.7+118.9)/2 的浮点尾数，
  // 否则同一个视口会算出两个不同的 center。
  return {
    lon: Number(((bbox.minLon + bbox.maxLon) / 2).toFixed(6)),
    lat: Number(((bbox.minLat + bbox.maxLat) / 2).toFixed(6)),
  };
}


/** bbox 签名：用于"视口没真的动就别重复请求"。 */
export function bboxSignature(bbox: MapBBox, precision = 4): string {
  return formatBBox(bbox, precision);
}

/**
 * 让 bbox 四周留一点余量。
 *
 * 只用于"选中某条地点后把它收进当前查询窗口"这类场景；
 * 留出的余量仍受 `MAX_BBOX_SPAN_DEG` 约束，调用方需重新校验。
 */
export function padBBox(bbox: MapBBox, ratio = 0.25): MapBBox {
  const spanLon = bbox.maxLon - bbox.minLon;
  const spanLat = bbox.maxLat - bbox.minLat;
  const padLon = spanLon * ratio;
  const padLat = spanLat * ratio;
  return {
    minLon: bbox.minLon - padLon,
    minLat: bbox.minLat - padLat,
    maxLon: bbox.maxLon + padLon,
    maxLat: bbox.maxLat + padLat,
  };
}

const BBOX_MESSAGES: Readonly<Record<BBoxErrorCode, string>> = {
  malformed: '范围参数格式不正确，应为「最小经度,最小纬度,最大经度,最大纬度」四个数字。',
  reversed: '范围的最小值必须小于最大值。',
  out_of_range: '范围超出可用的经纬度上限。',
  too_large: '当前范围过大，请缩小地图范围或缩放后再试。',
};

/** bbox 错误码 → 面向访客的中文提示（§9.2「不隐藏列表」，提示必须具体可执行）。 */
export function bboxErrorMessage(code: BBoxErrorCode): string {
  return BBOX_MESSAGES[code];
}