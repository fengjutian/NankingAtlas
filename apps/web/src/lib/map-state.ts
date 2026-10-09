/**
 * 地图交互的纯逻辑（P3-03 / P3-04 / P3-07）。
 *
 * 之所以把去抖、取消、selection 归约、降级判定全部抽到这里：
 * - 组件只负责渲染与副作用，"什么时候发请求、什么时候丢弃响应"必须有单测钉死；
 * - 技术方案 §9.2 的四条降级规则都能在这个文件里被穷举验证。
 *
 * 本文件不 import React、DOM 或 leaflet，因此可直接被 Vitest（node 环境）覆盖。
 */

import { markerPosition } from './map-data';

import type { ApiFailure, ApiFailureReason } from './api';
import type { MapPlaceItem } from './map-data';
import type { LonLat } from './map-geo';

// ---------------------------------------------------------------------------
// 去抖（技术方案 §9.2「移动结束后去抖请求」）
// ---------------------------------------------------------------------------

/** 地图移动后的去抖窗口。Leaflet 的 `moveend` 在惯性滚动时会连续触发。 */
export const MAP_MOVE_DEBOUNCE_MS = 450;

export interface Debouncer {
  /** 覆盖式注册回调：连续调用只会保留最后一次。 */
  schedule(callback: () => void): void;
  cancel(): void;
  /** 立即执行挂起的回调（组件卸载/手动刷新时用）。 */
  flush(): void;
  readonly pending: boolean;
}

export interface DebouncerOptions {
  readonly setTimer?: (handler: () => void, timeout: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

/**
 * 单槽去抖器。
 *
 * `schedule` 每次都会取消上一个定时器，因此"拖动地图 → moveend 连续触发"
 * 最终只会发出一次请求（§9.2 第 4 条）。
 */
export function createDebouncer(
  delayMs: number = MAP_MOVE_DEBOUNCE_MS,
  options: DebouncerOptions = {},
): Debouncer {
  const setTimer = options.setTimer ?? ((handler, timeout) => setTimeout(handler, timeout));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as number));
  let handle: unknown = null;
  let callback: (() => void) | null = null;

  return {
    schedule(next) {
      if (handle !== null) clearTimer(handle);
      callback = next;
      handle = setTimer(() => {
        handle = null;
        const run = callback;
        callback = null;
        if (run !== null) run();
      }, delayMs);
    },
    cancel() {
      if (handle !== null) clearTimer(handle);
      handle = null;
      callback = null;
    },
    flush() {
      if (handle === null) return;
      clearTimer(handle);
      handle = null;
      const run = callback;
      callback = null;
      if (run !== null) run();
    },
    get pending() {
      return handle !== null;
    },
  };
}

// ---------------------------------------------------------------------------
// 过期请求取消（技术方案 §9.2「取消过期请求」）
// ---------------------------------------------------------------------------

export interface LatestRequest {
  /** 开始一个新请求：先中止上一个，再返回本请求的 signal。 */
  begin(): AbortSignal;
  /** 该响应是否仍属于"最后一次请求"。false 表示已过期，必须丢弃。 */
  isCurrent(signal: AbortSignal): boolean;
  /** 结束当前请求（success / failure 都调用），之后 `begin` 会中止一个已结束的 signal。 */
  settle(signal: AbortSignal): void;
  /** 组件卸载：中止一切在途请求。 */
  dispose(): void;
  readonly inFlight: boolean;
}

export function createLatestRequest(): LatestRequest {
  let current: AbortController | null = null;

  return {
    begin() {
      if (current !== null) current.abort();
      current = new AbortController();
      return current.signal;
    },
    isCurrent(signal) {
      return current !== null && current.signal === signal && !signal.aborted;
    },
    settle(signal) {
      if (current !== null && current.signal === signal) current = null;
    },
    dispose() {
      if (current !== null) current.abort();
      current = null;
    },
    get inFlight() {
      return current !== null;
    },
  };
}

// ---------------------------------------------------------------------------
// selection state（技术方案 §9.2 第 3 条：marker 与卡片共享 selection）
// ---------------------------------------------------------------------------

export type SelectionAction =
  | { readonly kind: 'select'; readonly slug: string }
  | { readonly kind: 'clear' }
  /** 结果集变化后调用：选中的条目若已不在结果里，必须清空，否则高亮悬空。 */
  | { readonly kind: 'reconcile'; readonly slugs: readonly string[] };

/** 再次点击同一张卡片 = 取消选中（键盘与鼠标语义一致）。 */
export function reduceSelection(current: string | null, action: SelectionAction): string | null {
  switch (action.kind) {
    case 'select':
      return action.slug === '' ? null : action.slug;
    case 'clear':
      return null;
    case 'reconcile':
      return current !== null && action.slugs.includes(current) ? current : null;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** 点击卡片 / marker 时的意图：同一条再次点击 → 取消选中。 */
export function toggleSelection(current: string | null, slug: string): string | null {
  return reduceSelection(current, { kind: 'select', slug: current === slug ? '' : slug });
}

export type SelectionTarget =
  | { readonly kind: 'marker'; readonly slug: string; readonly position: LonLat }
  /** 选中的条目没有精确点：地图无法 pan，只在列表里高亮并显示区域说明。 */
  | { readonly kind: 'area-only'; readonly slug: string; readonly note: string };

/**
 * selection → 地图该做什么。
 *
 * 没有精确点时返回 `area-only` 而不是编一个坐标 —— 这是 AGENTS.md §3.5
 * 在交互层的落点。
 */
export function resolveSelectionTarget(
  items: readonly MapPlaceItem[],
  selectedSlug: string | null,
  noteOf: (item: MapPlaceItem) => string,
): SelectionTarget | null {
  if (selectedSlug === null) return null;
  const item = items.find((entry) => entry.slug === selectedSlug);
  if (item === undefined) return null;
  const position = markerPosition(item);
  if (position === null) {
    return { kind: 'area-only', slug: selectedSlug, note: noteOf(item) };
  }
  return { kind: 'marker', slug: selectedSlug, position };
}

/** 列表中当前选中的下标；键盘 "上下键移动焦点" 与"滚动定位"都依赖它。 */
export function selectedIndex(items: readonly MapPlaceItem[], selectedSlug: string | null): number {
  if (selectedSlug === null) return -1;
  return items.findIndex((item) => item.slug === selectedSlug);
}

// ---------------------------------------------------------------------------
// 降级判定（技术方案 §9.2 第 2 条：不隐藏列表 + 明确提示）
// ---------------------------------------------------------------------------

/** 地图区域自身的可用性。与列表内容是否为空完全解耦。 */
export type MapSurfaceState =
  | 'loading'
  | 'ready'
  /** Leaflet 脚本 / 地图容器不可用（SSR、动态 import 失败、浏览器不支持）。 */
  | 'unavailable'
  /** 底图瓦片加载失败（列表照常可用）。 */
  | 'basemap_failed';

export type RegionState =
  /** 正在按当前 bbox 取数。 */
  | 'idle'
  | 'loading'
  | 'ready'
  /** 接口未配置 / 断网 / 5xx。 */
  | 'service_unavailable'
  /** bbox 非法（反向 / 越界 / 过大）。 */
  | 'invalid_bbox'
  /** 端点尚未上线或返回 4xx：与"确实没有地点"区分开，不能都显示空态。 */
  | 'not_ready';

/**
 * 失败原因 → 区域状态。
 *
 * - HTTP 400 → `invalid_bbox`：接口明确判定范围非法（反向 / 越界 / 过大），
 *   提示必须是"缩小范围"，不能笼统说"网络故障"。
 * - `unconfigured` / `network` / `http_error` → `service_unavailable`。
 * - 其余（`not_found` / `forbidden` / `invalid_payload`）→ `not_ready`：
 *   地图端点还没上线时 `/places` 可能整体不存在，提示"接口未就绪"而不是
 *   "网络故障"，避免误导访客与运维。
 */
export function regionStateFromFailure(failure: ApiFailure): RegionState {
  if (failure.status === 400) return 'invalid_bbox';
  const reason: ApiFailureReason = failure.reason;
  if (reason === 'network' || reason === 'unconfigured' || reason === 'http_error') {
    return 'service_unavailable';
  }
  return 'not_ready';
}

const REGION_MESSAGES: Readonly<Record<RegionState, string>> = {
  idle: '',
  loading: '正在读取当前地图范围内的地点…',
  ready: '',
  service_unavailable: '',
  invalid_bbox: '当前地图范围无法用于查询，请缩小范围或缩放地图后再试。',
  not_ready: '地图地点接口尚未就绪，列表与筛选仍可正常使用。',
};

/** 每种"服务不可用"原因对应的可执行建议。 */
const UNAVAILABLE_HINTS: Readonly<Record<string, string>> = {
  unconfigured: '站点尚未配置内容接口地址，请稍后再试或先浏览下方列表。',
  network: '请检查网络连接后重试；下方地点列表可能仍可使用。',
  http_error: '地点接口返回了错误状态，请稍后重试。',
};

/** 区域状态 → 面向访客的说明。空字符串表示"不需要额外提示"。 */
export function regionMessage(state: RegionState, failure: ApiFailure | null = null): string {
  if (state === 'service_unavailable') {
    if (failure !== null) {
      const hint = UNAVAILABLE_HINTS[failure.reason];
      return `地点数据暂时无法读取：${hint ?? '请稍后重试；下方地点列表不受影响。'}`;
    }
    return '地点数据暂时无法读取，请稍后重试；下方地点列表不受影响。';
  }
  return REGION_MESSAGES[state];
}

/** 区域是否应该显示为错误块（而不是普通加载态）。 */
export function isRegionError(state: RegionState): boolean {
  return state === 'service_unavailable' || state === 'invalid_bbox' || state === 'not_ready';
}

/**
 * 地图表面的可用性判定（纯函数，便于穷举验证 §9.2 第 2 条）。
 *
 * `loaded=false`（SSR / 动态 import 未完成 / 抛错）→ `unavailable`；
 * `loaded=true` 但瓦片失败 → `basemap_failed`。两者都**不影响列表渲染**。
 */
export function mapSurfaceState(input: {
  readonly loaded: boolean;
  readonly tileErrors: number;
  readonly tileLoaded: boolean;
}): MapSurfaceState {
  if (!input.loaded) return 'loading';
  if (input.tileErrors > 0 && input.tileLoaded) return 'basemap_failed';
  return 'ready';
}

/** 底图失败阈值：单张瓦片 404 属于常态噪声，累计到阈值才判定为底图不可用。 */
export const BASEMAP_ERROR_THRESHOLD = 3;

export function tileFailureState(
  tileErrors: number,
  tileLoaded: boolean,
): 'pending' | 'ok' | 'failed' {
  if (tileErrors >= BASEMAP_ERROR_THRESHOLD) return 'failed';
  return tileLoaded ? 'ok' : 'pending';
}

/** 是否需要跳到"纯列表"降级（无 window / 无地图容器 / 动态 import 失败）。 */
export function shouldDegradeToList(input: {
  readonly hasDom: boolean;
  readonly mapFailed: boolean;
}): boolean {
  return !input.hasDom || input.mapFailed;
}

const BASEMAP_MESSAGES: Readonly<Record<MapSurfaceState, string>> = {
  loading: '地图正在加载，地点列表可先行浏览。',
  ready: '',
  unavailable: '当前环境无法加载交互地图，下方地点列表仍可完整使用。',
  basemap_failed: '底图加载失败（可能是网络受限或瓦片服务不可用）。下方地点列表与筛选不受影响。',
};

/** 地图表面状态 → 提示文案。列表区不因此隐藏（§9.2 第 2 条）。 */
export function mapSurfaceMessage(state: MapSurfaceState): string {
  return BASEMAP_MESSAGES[state];
}

/** 尊重 `prefers-reduced-motion`：地图动画是纯装饰性增强。 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * HTML 文本转义（marker 的 divIcon 内联 SVG/可访问文本经 innerHTML 注入）。
 *
 * 只用于本文件内我们自己拼装、且所有动态值都过这里的标记；
 * 任何来自 API 的文本都不得未经本函数直接进入 innerHTML。
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
