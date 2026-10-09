/**
 * 地图端点客户端（P3-02 / P3-04）。
 *
 * 复用 `lib/api.ts` 的既有模式，不另起一套 fetch 封装：
 * - `ApiResult` / `ApiFailure` / `ApiFailureReason` 用 `import type` 直接引用
 *   `lib/api.ts`（类型在编译期被擦除，不会进客户端 bundle）；
 * - 成功/失败语义、错误信封解析、失败不抛异常，与 `lib/api.ts` 同一套约定。
 *
 * **为什么运行时值要在这里重写一遍**：`lib/api.ts` 依赖 `node:crypto`（签名
 * revalidation）与 `./env` 的 fail-fast 模块级校验，一旦被客户端组件引用，
 * Next 会在打包 `node:crypto` 时失败。地图的 bbox 请求发生在浏览器里，因此
 * 下面这几个极小的运行时常量在本文件本地给出，并由单测钉住；`API_PREFIX` 的
 * 真值仍以 `lib/api.ts` 为准。
 *
 * 用户可见的降级文案不放在这里 —— 统一由 `map-state.ts` 的 `regionMessage`
 * 产出，避免两处各写一套提示。
 */

import { z } from 'zod';

import { formatBBox } from './map-geo';
import {
  LOCATION_ACCURACIES,
  VERIFICATION_STATUSES,
  canShowExactCoordinates,
  type ContentType,
  type LocationAccuracy,
  type VerificationStatus,
} from './types';

import type { ApiFailure, ApiFailureReason, ApiResult } from './api';
import type { MapBBox, LonLat } from './map-geo';

/** 与 `lib/api.ts` 的 `API_PREFIX` 同值。 */
const API_PREFIX = '/api/v1';

/** HTTP 状态码 → 降级原因。与 `lib/api.ts` 的 `reasonForStatus` 同规则。 */
function reasonForStatus(status: number): ApiFailureReason {
  if (status === 404) return 'not_found';
  if (status === 401 || status === 403) return 'forbidden';
  return 'http_error';
}

// ---------------------------------------------------------------------------
// 响应 schema（未知键由 zod 剥离，API 内部字段不会外泄到页面）
// ---------------------------------------------------------------------------

const lonLatSchema = z.object({ lon: z.number(), lat: z.number() });

export const mapPlaceItemSchema = z.object({
  slug: z.string().min(1),
  title: z.string(),
  summary: z.string().nullable(),
  type: z.literal('PLACE'),
  lon: z.number().nullable(),
  lat: z.number().nullable(),
  hasPoint: z.boolean(),
  note: z.string().nullable(),
  accuracy: z.enum(LOCATION_ACCURACIES).nullable(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).nullable(),
});

export type MapPlaceItem = z.infer<typeof mapPlaceItemSchema>;

export const mapPlaceResultSchema = z.object({
  bbox: z.object({
    minLon: z.number(),
    minLat: z.number(),
    maxLon: z.number(),
    maxLat: z.number(),
  }),
  center: lonLatSchema,
  total: z.number(),
  truncated: z.boolean(),
  items: z.array(mapPlaceItemSchema),
});

export type MapPlaceResult = z.infer<typeof mapPlaceResultSchema>;

export const mapSearchResultSchema = z.object({
  query: z.string(),
  total: z.number(),
  backend: z.string(),
  items: z.array(
    z.object({
      slug: z.string().min(1),
      type: z.literal('PLACE'),
      title: z.string(),
      summary: z.string().nullable(),
      matchedOn: z.string().nullable(),
    }),
  ),
  suggestions: z.array(z.string()),
});

export type MapSearchResult = z.infer<typeof mapSearchResultSchema>;

// ---------------------------------------------------------------------------
// 请求
// ---------------------------------------------------------------------------

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().nullable().optional(),
  }),
});

/**
 * 传输层的简短原因说明（不是面向访客的文案）。
 * 访客看到的提示统一由 `map-state.ts` 的 `regionMessage` 产出。
 */
const TRANSPORT_MESSAGES: Readonly<Record<ApiFailureReason, string>> = {
  unconfigured: '未配置公开站 API 地址',
  network: '无法连接地点接口',
  not_found: '地点接口不存在',
  forbidden: '地点接口拒绝访问',
  http_error: '地点接口返回错误状态',
  invalid_payload: '地点接口返回结构不符合公开契约',
};

function fail(reason: ApiFailureReason, status: number | null = null): ApiFailure {
  return { ok: false, reason, message: TRANSPORT_MESSAGES[reason], status, requestId: null };
}

export interface MapRequestBase {
  /** 由 `app/map/page.tsx` 从 `env.API_BASE_URL` 注入；null 时不发起请求，直接 `unconfigured`。 */
  readonly baseUrl: string | null;
  readonly signal?: AbortSignal | undefined;
}

export interface PlacesRequest extends MapRequestBase {
  readonly bbox: MapBBox;
  readonly type?: ContentType | undefined;
  readonly q?: string | undefined;
  readonly limit?: number | undefined;
}

export interface MapSearchRequest extends MapRequestBase {
  readonly q: string;
  readonly type?: ContentType | undefined;
  readonly limit?: number | undefined;
}

/**
 * 查询串构造。
 *
 * 不直接用 `URLSearchParams`：它会把 `bbox` 的分隔符编码成 `%2C`。
 * 契约写的是字面量 `minLon,minLat,maxLon,maxLat`，这里显式保留逗号，
 * 便于抓包与排障时与接口文档逐字符对照。
 */
class MapQueryBuilder {
  private readonly parts: string[] = [];

  set(key: string, value: string): this {
    this.parts.push(`${encodeURIComponent(key)}=${MapQueryBuilder.encode(value)}`);
    return this;
  }

  /** `bbox` 的逗号保持字面量。 */
  private static encode(value: string): string {
    return encodeURIComponent(value).replace(/%2C/g, ',');
  }

  toString(): string {
    return this.parts.join('&');
  }
}

function buildUrl(baseUrl: string | null, path: string, query: MapQueryBuilder): string | null {
  if (baseUrl === null || baseUrl === '') return null;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const queryString = query.toString();
  return `${baseUrl.replace(/\/+$/, '')}${API_PREFIX}${normalized}${queryString === '' ? '' : `?${queryString}`}`;
}

function parseBody(text: string): unknown {
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * 地图端点专用的请求执行。
 *
 * 与 `lib/api.ts` 的 `request` 行为一致：成功返回 `data` 原文，失败转 `ApiFailure`。
 * 取消（AbortError）也走 `network` 分支 —— 是否算"过期响应"由调用方用
 * `createLatestRequest` 判定并丢弃，这里不替它做决定。
 */
async function requestMap(
  baseUrl: string | null,
  path: string,
  query: MapQueryBuilder,
  signal: AbortSignal | undefined,
): Promise<ApiResult<unknown>> {
  const url = buildUrl(baseUrl, path, query);
  if (url === null) return fail('unconfigured');

  const init: RequestInit = { headers: { accept: 'application/json' } };
  if (signal !== undefined) init.signal = signal;

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return fail('network');
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    return fail('network', response.status);
  }

  if (!response.ok) {
    const reason = reasonForStatus(response.status);
    const envelope = errorEnvelopeSchema.safeParse(parseBody(text));
    return {
      ok: false,
      reason,
      message: envelope.success
        ? TRANSPORT_MESSAGES[reason]
        : `${TRANSPORT_MESSAGES[reason]}（HTTP ${response.status}）`,
      status: response.status,
      requestId: envelope.success ? (envelope.data.error.requestId ?? null) : null,
    };
  }

  const parsed = parseBody(text);
  if (parsed === undefined) return fail('invalid_payload', response.status);
  return { ok: true, data: parsed };
}

async function requestEnvelope<T>(
  baseUrl: string | null,
  path: string,
  query: MapQueryBuilder,
  schema: z.ZodType<T, z.ZodTypeDef, T>,
  signal: AbortSignal | undefined,
): Promise<ApiResult<T>> {
  const raw = await requestMap(baseUrl, path, query, signal);
  if (!raw.ok) return raw;
  const envelope = z.object({ data: schema }).safeParse(raw.data);
  if (!envelope.success) return fail('invalid_payload');
  return { ok: true, data: envelope.data.data as NonNullable<typeof envelope.data.data> };
}

/** `GET /api/v1/places?bbox=…&type=&q=&limit=` */
export async function requestPlacesInBBox(
  input: PlacesRequest,
): Promise<ApiResult<MapPlaceResult>> {
  const query = new MapQueryBuilder();
  query.set('bbox', formatBBox(input.bbox));
  if (input.type !== undefined) query.set('type', input.type);
  if (input.q !== undefined && input.q !== '') query.set('q', input.q);
  if (input.limit !== undefined) query.set('limit', String(input.limit));
  return requestEnvelope(input.baseUrl, '/places', query, mapPlaceResultSchema, input.signal);
}

/** `GET /api/v1/search?q=&type=&limit=` */
export async function requestMapSearch(
  input: MapSearchRequest,
): Promise<ApiResult<MapSearchResult>> {
  const query = new MapQueryBuilder();
  query.set('q', input.q);
  if (input.type !== undefined) query.set('type', input.type);
  if (input.limit !== undefined) query.set('limit', String(input.limit));
  return requestEnvelope(input.baseUrl, '/search', query, mapSearchResultSchema, input.signal);
}

// ---------------------------------------------------------------------------
// marker 可绘制性（技术方案 §9.2 末条 / AGENTS.md §3.5）
// ---------------------------------------------------------------------------

/**
 * 是否可以画精确点。
 *
 * 三个条件都要满足，缺一不可：
 * 1. API 明确给出 `hasPoint`（服务端已经按核验流程判定过）；
 * 2. 坐标是有限数且落在经纬度合法区间内（不信上游的空 / 字符串 / 越界值）；
 * 3. 精度不是 `AREA_ONLY` / `UNKNOWN`（对应 `canShowExactCoordinates`）。
 *
 * 任一不满足 → 不产生 marker，只在列表里展示区域说明。
 */
export function canRenderMarker(item: MapPlaceItem): boolean {
  return (
    hasUsableCoordinates(item) &&
    item.hasPoint &&
    canShowExactCoordinates(item.accuracy, item.verificationStatus)
  );
}
export function hasUsableCoordinates(
  item: MapPlaceItem,
): item is MapPlaceItem & { readonly lon: number; readonly lat: number } {
  const { lon, lat } = item;
  if (typeof lon !== 'number' || typeof lat !== 'number') return false;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return false;
  return true;
}

/** marker 的落点；不可绘制时返回 null（调用方不得编造替代坐标）。 */
export function markerPosition(item: MapPlaceItem): LonLat | null {
  if (!canRenderMarker(item) || !hasUsableCoordinates(item)) return null;
  return { lon: item.lon, lat: item.lat };
}

/** 只保留可绘制项的坐标，供地图层建立 marker。 */
export function markerPositions(items: readonly MapPlaceItem[]): Map<string, LonLat> {
  const out = new Map<string, LonLat>();
  for (const item of items) {
    const position = markerPosition(item);
    if (position !== null) out.set(item.slug, position);
  }
  return out;
}

/** 只保留可绘制项 —— 测试与渲染都直接用它，结构上杜绝"漏网 marker"。 */
export function markerItems(items: readonly MapPlaceItem[]): readonly MapPlaceItem[] {
  return items.filter(canRenderMarker);
}

/**
 * 无法绘制精确点时的区域说明。
 *
 * 优先用 API 提供的 `note`（由编辑/审核流程写入），否则按精度生成中性说明。
 * **任何情况下都不在此编造地址或坐标。**
 */
export function areaOnlyNote(item: MapPlaceItem): string {
  if (typeof item.note === 'string' && item.note.trim() !== '') return item.note.trim();
  switch (item.accuracy) {
    case 'AREA_ONLY':
      return '仅有区域级位置，不展示精确点。';
    case 'UNKNOWN':
      return '坐标尚未核验，不展示精确点。';
    case 'APPROXIMATE':
    case 'EXACT':
      return '缺少可用的经纬度，不展示精确点。';
    case null:
      return '位置精度未标明，不展示精确点。';
    default: {
      const exhaustive: never = item.accuracy;
      return exhaustive;
    }
  }
}

/** 地图搜索命中项 → 地图列表项的最小投影（搜索结果本身不含坐标，不用于画点）。 */
export type SearchSuggestion = z.infer<typeof mapSearchResultSchema>['items'][number];

export function accuracyLabel(accuracy: LocationAccuracy | null): string {
  if (accuracy === null) return '位置精度未标明';
  switch (accuracy) {
    case 'EXACT':
      return '精确点位';
    case 'APPROXIMATE':
      return '近似点位';
    case 'AREA_ONLY':
      return '仅区域级';
    case 'UNKNOWN':
      return '坐标未核验';
    default: {
      const exhaustive: never = accuracy;
      return exhaustive;
    }
  }
}

export function verificationLabel(status: VerificationStatus | null): string {
  if (status === null) return '核验状态未标明';
  switch (status) {
    case 'VERIFIED':
      return '已核验';
    case 'PARTIAL':
      return '部分核验';
    case 'UNVERIFIED':
      return '未核验';
    case 'DISPUTED':
      return '存在争议';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
