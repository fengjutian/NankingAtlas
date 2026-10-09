/**
 * `/map` 的 URL 状态（P3-03）。
 *
 * 技术方案 §9.1 要求「URL 可分享的筛选与分页」，§9.2 要求 marker 与卡片共享
 * selection。这里把 `type` / `q` / `selected` / `bbox` 全部写进 URL：
 * 刷新、复制地址、前进后退都能还原同一个视图，marker 选中态也可分享。
 *
 * 约定：`parseMapQuery(serializeMapQuery(q)) === q`（省略默认值），
 * 往返一致性由单测钉死。
 */

import { DEFAULT_MAP_BBOX, formatBBox, parseAndValidateBBox, validateBBox } from './map-geo';
import { CONTENT_TYPES, type ContentType } from './types';

import type { BBoxErrorCode, MapBBox } from './map-geo';

/**
 * 关键词长度上限，与 `lib/api.ts` 的 `MAX_QUERY_LENGTH` 同值。
 * 这里不 import `lib/api.ts`：它依赖 `node:crypto`，会被打进客户端 bundle。
 */
export const MAP_QUERY_MAX_LENGTH = 100;

export interface MapQuery {
  readonly type: ContentType | null;
  readonly q: string;
  /** 当前选中的地点 slug（marker / 卡片共享）。 */
  readonly selected: string | null;
  /** 首屏与分享用的初始 bbox（已通过校验的 `minLon,minLat,maxLon,maxLat`）。 */
  readonly bbox: string | null;
}

export const DEFAULT_MAP_QUERY: MapQuery = {
  type: null,
  q: '',
  selected: null,
  bbox: null,
};

/** `/map` 允许的类型筛选：地图只画地点，其余类型不出现在地图列表。 */
export const MAP_TYPES: readonly ContentType[] = ['PLACE'];

/** 取第一个原始参数值（不校验）。`parseMapQuery` 用它做容错解析。 */
export function firstMapParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

function firstValue(value: string | string[] | undefined): string | null {
  return firstMapParam(value);
}

/**
 * 解析 `searchParams`。
 *
 * 全部非法值静默回落到默认值（与 `lib/api.ts` 的 `parseListQuery` 一致）：
 * 分享出去的链接可能过期或被手改，不能因为一个参数让页面 500。
 */
export function parseMapQuery(
  params: Readonly<Record<string, string | string[] | undefined>>,
): MapQuery {
  const rawType = firstValue(params.type);
  const type =
    rawType !== null && (MAP_TYPES as readonly string[]).includes(rawType)
      ? (rawType as ContentType)
      : null;

  const q = (firstValue(params.q) ?? '').trim().slice(0, MAP_QUERY_MAX_LENGTH);

  const rawSelected = firstValue(params.selected);
  const selected = rawSelected?.trim() ? rawSelected.trim() : null;

  const rawBBox = firstValue(params.bbox);
  const bboxCheck = rawBBox === null ? null : parseAndValidateBBox(rawBBox);
  const bbox = bboxCheck?.ok === true ? formatBBox(bboxCheck.bbox) : null;

  return { type, q, selected, bbox };
}

/** 序列化为稳定顺序的查询串（省略默认值）。 */
export function serializeMapQuery(query: MapQuery): string {
  const search = new URLSearchParams();
  if (query.type !== null) search.set('type', query.type);
  if (query.q !== '') search.set('q', query.q);
  if (query.selected !== null) search.set('selected', query.selected);
  if (query.bbox !== null) search.set('bbox', query.bbox);
  return search.toString();
}

export function withMapQuery(path: string, query: MapQuery): string {
  const serialized = serializeMapQuery(query);
  return serialized === '' ? path : `${path}?${serialized}`;
}

/** 切换类型筛选；地图只支持 `PLACE`，因此等价于"显示 / 不显示全部"。 */
export function toggleMapType(current: MapQuery, type: ContentType): MapQuery {
  return { ...current, type: current.type === type ? null : type };
}

export function setMapKeyword(current: MapQuery, q: string): MapQuery {
  return { ...current, q: q.trim().slice(0, MAP_QUERY_MAX_LENGTH) };
}

export function setMapSelection(current: MapQuery, selected: string | null): MapQuery {
  return { ...current, selected: selected !== null && selected.trim() !== '' ? selected : null };
}

export function clearMapQuery(): MapQuery {
  return DEFAULT_MAP_QUERY;
}

export interface ResolvedBBox {
  readonly bbox: MapBBox;
  /** URL 里的 `bbox` 非法时保留错误码，页面据此提示"缩小范围"。 */
  readonly errorCode: BBoxErrorCode | null;
}

/**
 * 首屏 bbox：URL 覆盖优先，否则用默认视窗。
 *
 * 非法值不抛错，回落到默认窗口并把错误码带给页面 —— 地图是增强功能，
 * 一个坏参数不能让整个列表消失。
 */
export function resolveInitialBBox(raw: string | null): ResolvedBBox {
  if (raw === null || raw.trim() === '') {
    return { bbox: DEFAULT_MAP_BBOX, errorCode: null };
  }
  const check = parseAndValidateBBox(raw);
  if (!check.ok) {
    return { bbox: DEFAULT_MAP_BBOX, errorCode: check.code };
  }
  return { bbox: check.bbox, errorCode: null };
}

/** 便捷断言：结果是否真的可用于请求（调用方可据此提前给出提示）。 */
export function isUsableBBox(bbox: MapBBox): boolean {
  return validateBBox(bbox).ok;
}

/** 地图类型筛选的可选项，供工具栏渲染。 */
export function allowedMapTypes(): readonly ContentType[] {
  return CONTENT_TYPES.filter((type) => MAP_TYPES.includes(type));
}
