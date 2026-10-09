import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BASEMAP_ERROR_THRESHOLD,
  MAP_MOVE_DEBOUNCE_MS,
  createDebouncer,
  createLatestRequest,
  escapeHtml,
  isRegionError,
  mapSurfaceMessage,
  mapSurfaceState,
  prefersReducedMotion,
  reduceSelection,
  regionMessage,
  regionStateFromFailure,
  resolveSelectionTarget,
  selectedIndex,
  shouldDegradeToList,
  tileFailureState,
  toggleSelection,
} from './map-state';

import type { ApiFailure, ApiFailureReason } from './api';
import type { MapPlaceItem } from './map-data';

function item(overrides: Partial<MapPlaceItem> = {}): MapPlaceItem {
  return {
    slug: 'place-a',
    title: '示例地点',
    summary: null,
    type: 'PLACE',
    lon: 118.78,
    lat: 32.06,
    hasPoint: true,
    note: null,
    accuracy: 'EXACT',
    verificationStatus: 'VERIFIED',
    ...overrides,
  };
}

function failure(reason: ApiFailureReason, status: number | null = null): ApiFailure {
  return { ok: false, reason, message: reason, status, requestId: null };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// §9.2 第 4 条：移动结束后去抖
// ---------------------------------------------------------------------------

describe('地图移动去抖（§9.2 第 4 条）', () => {
  it('连续 moveend 只触发一次请求', () => {
    const debouncer = createDebouncer(MAP_MOVE_DEBOUNCE_MS);
    const spy = vi.fn();

    debouncer.schedule(spy);
    vi.advanceTimersByTime(100);
    debouncer.schedule(spy);
    vi.advanceTimersByTime(100);
    debouncer.schedule(spy);

    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MAP_MOVE_DEBOUNCE_MS);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('去抖窗口 ≥ 400ms（验收要求）', () => {
    expect(MAP_MOVE_DEBOUNCE_MS).toBeGreaterThanOrEqual(400);
  });

  it('窗口过后再排一次会再次触发', () => {
    const debouncer = createDebouncer(MAP_MOVE_DEBOUNCE_MS);
    const spy = vi.fn();
    debouncer.schedule(spy);
    vi.advanceTimersByTime(MAP_MOVE_DEBOUNCE_MS);
    debouncer.schedule(spy);
    vi.advanceTimersByTime(MAP_MOVE_DEBOUNCE_MS);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('cancel 丢弃挂起的请求（组件卸载不漏发）', () => {
    const debouncer = createDebouncer(MAP_MOVE_DEBOUNCE_MS);
    const spy = vi.fn();
    debouncer.schedule(spy);
    expect(debouncer.pending).toBe(true);
    debouncer.cancel();
    expect(debouncer.pending).toBe(false);
    vi.advanceTimersByTime(MAP_MOVE_DEBOUNCE_MS * 3);
    expect(spy).not.toHaveBeenCalled();
  });

  it('flush 立即执行挂起的回调', () => {
    const debouncer = createDebouncer(MAP_MOVE_DEBOUNCE_MS);
    const spy = vi.fn();
    debouncer.schedule(spy);
    debouncer.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(debouncer.pending).toBe(false);
  });

  it('flush 在没有挂起回调时是空操作', () => {
    const debouncer = createDebouncer(MAP_MOVE_DEBOUNCE_MS);
    expect(() => debouncer.flush()).not.toThrow();
  });

  it('回调只保留最后一次（不会把每个视口都发出去）', () => {
    const debouncer = createDebouncer(MAP_MOVE_DEBOUNCE_MS);
    const seen: number[] = [];
    debouncer.schedule(() => seen.push(1));
    debouncer.schedule(() => seen.push(2));
    debouncer.schedule(() => seen.push(3));
    vi.advanceTimersByTime(MAP_MOVE_DEBOUNCE_MS);
    expect(seen).toEqual([3]);
  });
});

// ---------------------------------------------------------------------------
// §9.2 第 4 条：取消过期请求
// ---------------------------------------------------------------------------

describe('过期请求取消（§9.2 第 4 条）', () => {
  it('新请求会中止上一个请求的 signal', () => {
    const latest = createLatestRequest();
    const first = latest.begin();
    const second = latest.begin();
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it('只采用最后一次响应：过期 signal 的 isCurrent 为 false', () => {
    const latest = createLatestRequest();
    const stale = latest.begin();
    const fresh = latest.begin();
    expect(latest.isCurrent(stale)).toBe(false);
    expect(latest.isCurrent(fresh)).toBe(true);
  });

  it('dispose 中止在途请求并让 isCurrent 全部失效', () => {
    const latest = createLatestRequest();
    const signal = latest.begin();
    expect(latest.inFlight).toBe(true);
    latest.dispose();
    expect(signal.aborted).toBe(true);
    expect(latest.inFlight).toBe(false);
    expect(latest.isCurrent(signal)).toBe(false);
  });

  it('settle 后不再有在途请求，但仍能开始下一次', () => {
    const latest = createLatestRequest();
    const signal = latest.begin();
    latest.settle(signal);
    expect(latest.inFlight).toBe(false);
    expect(latest.isCurrent(signal)).toBe(false);
    expect(latest.begin().aborted).toBe(false);
  });

  it('settle 传入非当前 signal 时不影响在途请求', () => {
    const latest = createLatestRequest();
    const stale = latest.begin();
    const fresh = latest.begin();
    latest.settle(stale);
    expect(latest.inFlight).toBe(true);
    expect(latest.isCurrent(fresh)).toBe(true);
  });

  it('isCurrent 拒绝来自别的实例的 signal（防止组件串用 signal）', () => {
    const mine = createLatestRequest();
    const other = createLatestRequest();
    mine.begin();
    const foreign = other.begin();
    expect(mine.isCurrent(foreign)).toBe(false);
    expect(other.isCurrent(foreign)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §9.2 第 3 条：marker 与卡片共享 selection
// ---------------------------------------------------------------------------

describe('selection state 双向联动（§9.2 第 3 条）', () => {
  it('选中 → 取消 → 再选中', () => {
    let selected: string | null = null;
    selected = toggleSelection(selected, 'a');
    expect(selected).toBe('a');
    selected = toggleSelection(selected, 'a');
    expect(selected).toBeNull();
    selected = toggleSelection(selected, 'a');
    expect(selected).toBe('a');
  });

  it('切换到另一条时替换选中项', () => {
    expect(toggleSelection('a', 'b')).toBe('b');
  });

  it('空 slug 视为取消选中（键盘与 marker 的通用出口）', () => {
    expect(toggleSelection('a', '')).toBeNull();
    expect(reduceSelection('a', { kind: 'select', slug: '' })).toBeNull();
  });

  it('clear 总是回到 null', () => {
    expect(reduceSelection('a', { kind: 'clear' })).toBeNull();
  });

  it('reconcile：条目仍在结果里则保留选中', () => {
    expect(reduceSelection('a', { kind: 'reconcile', slugs: ['a', 'b'] })).toBe('a');
  });

  it('reconcile：条目已移出结果集则清空（避免高亮悬空）', () => {
    expect(reduceSelection('a', { kind: 'reconcile', slugs: ['b', 'c'] })).toBeNull();
  });

  it('selectedIndex 定位当前选中项；未选中为 -1', () => {
    const items = [item({ slug: 'a' }), item({ slug: 'b' })];
    expect(selectedIndex(items, 'b')).toBe(1);
    expect(selectedIndex(items, null)).toBe(-1);
    expect(selectedIndex(items, 'missing')).toBe(-1);
  });
});

describe('selection → 地图动作（无坐标时不得编造点位）', () => {
  const note = (): string => '仅有区域级位置，不展示精确点。';

  it('有精确点时给出 panTo 目标', () => {
    const items = [item({ slug: 'a', lon: 118.78, lat: 32.06 })];
    expect(resolveSelectionTarget(items, 'a', note)).toEqual({
      kind: 'marker',
      slug: 'a',
      position: { lon: 118.78, lat: 32.06 },
    });
  });

  it('hasPoint=false 时只给区域说明，不给坐标', () => {
    const items = [item({ slug: 'a', hasPoint: false })];
    expect(resolveSelectionTarget(items, 'a', note)).toEqual({
      kind: 'area-only',
      slug: 'a',
      note: '仅有区域级位置，不展示精确点。',
    });
  });

  it('AREA_ONLY 精度即使给了坐标也不画点', () => {
    const items = [item({ slug: 'a', accuracy: 'AREA_ONLY', hasPoint: true })];
    expect(resolveSelectionTarget(items, 'a', note)?.kind).toBe('area-only');
  });

  it('坐标缺失时给 area-only', () => {
    const items = [item({ slug: 'a', lon: null, lat: null })];
    expect(resolveSelectionTarget(items, 'a', note)?.kind).toBe('area-only');
  });

  it('未选中或 slug 不存在时无动作', () => {
    const items = [item({ slug: 'a' })];
    expect(resolveSelectionTarget(items, null, note)).toBeNull();
    expect(resolveSelectionTarget(items, 'zzz', note)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §9.2 第 2 条：降级
// ---------------------------------------------------------------------------

describe('API 失败原因 → 区域降级状态', () => {
  it('unconfigured / network / http_error 归为服务不可用', () => {
    expect(regionStateFromFailure(failure('unconfigured'))).toBe('service_unavailable');
    expect(regionStateFromFailure(failure('network'))).toBe('service_unavailable');
    expect(regionStateFromFailure(failure('http_error', 500))).toBe('service_unavailable');
  });

  it('not_found / forbidden 归为接口未就绪（而不是"网络故障"）', () => {
    expect(regionStateFromFailure(failure('not_found', 404))).toBe('not_ready');
    expect(regionStateFromFailure(failure('forbidden', 403))).toBe('not_ready');
  });

  it('invalid_payload 归为接口未就绪', () => {
    expect(regionStateFromFailure(failure('invalid_payload', 200))).toBe('not_ready');
  });

  it('HTTP 400 归为 invalid_bbox（提示"缩小范围"，不是"网络故障"）', () => {
    expect(regionStateFromFailure(failure('http_error', 400))).toBe('invalid_bbox');
  });

  it('每种失败原因都有非空、可执行的中文提示', () => {
    const reasons: ApiFailureReason[] = [
      'unconfigured',
      'network',
      'not_found',
      'forbidden',
      'http_error',
      'invalid_payload',
    ];
    for (const reason of reasons) {
      const message = regionMessage(regionStateFromFailure(failure(reason)));
      expect(message).not.toBe('');
    }
  });

  it('unconfigured 的提示指向站点配置而不是访客', () => {
    const message = regionMessage('service_unavailable', failure('unconfigured'));
    expect(message).toContain('站点尚未配置');
  });

  it('network 的提示指向访客可执行的动作', () => {
    const message = regionMessage('service_unavailable', failure('network'));
    expect(message).toContain('网络');
  });

  it('service_unavailable 缺少 failure 时仍有兜底文案', () => {
    expect(regionMessage('service_unavailable', null)).toContain('请稍后重试');
  });

  it('ready / loading 不产生错误文案', () => {
    expect(regionMessage('ready')).toBe('');
    expect(regionMessage('loading')).not.toBe('');
  });

  it('invalid_bbox 明确要求缩小范围', () => {
    expect(regionMessage('invalid_bbox')).toContain('缩小');
  });

  it('isRegionError 区分错误态与加载态', () => {
    expect(isRegionError('service_unavailable')).toBe(true);
    expect(isRegionError('invalid_bbox')).toBe(true);
    expect(isRegionError('not_ready')).toBe(true);
    expect(isRegionError('ready')).toBe(false);
    expect(isRegionError('loading')).toBe(false);
    expect(isRegionError('idle')).toBe(false);
  });
});

describe('地图表面降级（底图 / 脚本失败不隐藏列表）', () => {
  it('地图未加载完 → loading', () => {
    expect(mapSurfaceState({ loaded: false, tileErrors: 0, tileLoaded: false })).toBe('loading');
  });

  it('底图有失败瓦片 → basemap_failed', () => {
    expect(mapSurfaceState({ loaded: true, tileErrors: 4, tileLoaded: true })).toBe(
      'basemap_failed',
    );
  });

  it('瓦片正常 → ready', () => {
    expect(mapSurfaceState({ loaded: true, tileErrors: 0, tileLoaded: true })).toBe('ready');
  });

  it('累计错误达到阈值即判定底图失败（单张 404 属于常态噪声）', () => {
    expect(tileFailureState(BASEMAP_ERROR_THRESHOLD - 1, true)).toBe('ok');
    expect(tileFailureState(BASEMAP_ERROR_THRESHOLD, false)).toBe('failed');
  });

  it('未加载完成且没有错误 → pending', () => {
    expect(tileFailureState(0, false)).toBe('pending');
  });

  it('每种地图状态都有对应提示，且都不要求隐藏列表', () => {
    const states = ['loading', 'ready', 'unavailable', 'basemap_failed'] as const;
    expect(mapSurfaceMessage('ready')).toBe('');
    for (const state of states) {
      if (state === 'ready') continue;
      expect(mapSurfaceMessage(state).length).toBeGreaterThan(0);
    }
    expect(mapSurfaceMessage('unavailable')).toContain('列表');
    expect(mapSurfaceMessage('basemap_failed')).toContain('列表');
  });

  it('无 DOM 或动态 import 失败时降级为纯列表', () => {
    expect(shouldDegradeToList({ hasDom: false, mapFailed: false })).toBe(true);
    expect(shouldDegradeToList({ hasDom: true, mapFailed: true })).toBe(true);
    expect(shouldDegradeToList({ hasDom: true, mapFailed: false })).toBe(false);
  });

  it('SSR（无 window）时不认为用户偏好减少动画', () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('marker 文本转义（innerHTML 安全）', () => {
  it('转义全部危险字符', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("O'Brien & Co")).toBe('O&#39;Brien &amp; Co');
  });

  it('普通中文标题不受影响', () => {
    expect(escapeHtml('秦淮')).toBe('秦淮');
  });
});
