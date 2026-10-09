'use client';

import { useCallback, useEffect, useRef } from 'react';

import styles from './map.module.css';

import type { ResolvedAmapConfig } from '@/lib/amap-config';
import type {
  AMapMapInstance,
  AMapMarkerInstance,
  AMapNamespace,
  AMapPosition,
} from '@/lib/amap-sdk';
import type { MapBBox, ViewportBounds } from '@/lib/map-geo';

import { loadAmap } from '@/lib/amap-loader';
import { gcj02ToWgs84, wgs84ToGcj02 } from '@/lib/map-coords';
import { accuracyLabel, markerItems, markerPosition, type MapPlaceItem } from '@/lib/map-data';
import { bboxFromBounds, bboxCenter, validateBBox } from '@/lib/map-geo';
import {
  BASEMAP_LOAD_DEADLINE_MS,
  MAP_MOVE_DEBOUNCE_MS,
  basemapStatus,
  createDebouncer,
  escapeHtml,
  mapSurfaceState,
  type MapSurfaceState,
} from '@/lib/map-state';

/**
 * 交互地图（高德地图 JS API 2.0）。
 *
 * 必须由 `MapExplorer` 用 `next/dynamic({ ssr: false })` 载入：
 * 高德脚本走 `<script>` 注入，只有浏览器里才有 `document` 可插；
 * 而 §9.2 要求"首屏先渲染列表"——地图块是增强，不是前提。
 *
 * 三条硬约束（技术方案 §9.2）：
 * 1. 脚本 / 底图不可用 → 上报 `basemap_failed`，列表照常；
 * 2. `moveend` 去抖后才把新 bbox 抛给上层取数；
 * 3. `hasPoint=false` / 精度不足的地点不产生 marker，只在列表里给区域说明。
 *
 * ## 坐标系（本文件最容易出错的地方）
 *
 * 数据库存 **WGS-84**，高德吃 **GCJ-02**，两者在南京相差约 300 米。
 * 本文件的坐标流向是**严格单向**的：
 *
 * ```
 * API/DB  ──wgs84ToGcj02──▶  高德地图（marker 坐标、中心点）
 * 高德地图 ──gcj02ToWgs84──▶  bbox 查询参数
 * ```
 *
 * 任何"从 marker 里读回坐标再转一次"的写法都会偏移两次（≈600 米）。
 * 因此 GCJ-02 坐标单独存进 `gcjPositionsRef`，不回读 marker 再转换。
 */
export interface MapCanvasProps {
  readonly items: readonly MapPlaceItem[];
  readonly selected: string | null;
  readonly initialBBox: MapBBox;
  /**
   * 高德接入配置；`null` 表示未配置 Key 或安全密钥。
   * 此时**不加载脚本**，直接显示纯列表降级提示。
   */
  readonly amap: ResolvedAmapConfig | null;
  /** 地图移动停止（去抖后）后回调，参数是新的请求 bbox。 */
  readonly onViewportChange: (bbox: MapBBox) => void;
  /** marker 被点选（鼠标或键盘）。 */
  readonly onSelect: (slug: string) => void;
  readonly onSurfaceState: (state: MapSurfaceState) => void;
  readonly reducedMotion: boolean;
}

/** 地图初始缩放级（南京主城尺度）。 */
const INITIAL_ZOOM = 12;

/** 缩放范围。高德矢量底图 3~19 之外没有数据，锁住避免出现空白画面。 */
const ZOOM_RANGE: readonly [number, number] = [3, 19];

/** marker 属性名：同时用于事件委托与焦点定位。 */
const SLUG_ATTR = 'data-map-slug';

/**
 * CSS Module 取值。
 *
 * Next 生成的 `*.module.css` 类型是索引签名，在 `noUncheckedIndexedAccess` 下
 * 取值是 `string | undefined`；这里收口成 `string`，缺失时退回类名本身，
 * 宁可样式退化也不让 marker 渲染中断。
 */
function css(name: string): string {
  return styles[name] ?? name;
}

/**
 * marker 的自定义 HTML。
 *
 * 用原生 `<button>` 而不是 Leaflet `divIcon` 那套：原生按钮**自带**
 * Enter / Space 键盘激活、焦点可见样式、读屏可读名称，不需要手工补
 * `role` / `tabIndex` / `keypress`（少一层就少一处可访问性回归）。
 *
 * 交互走容器上的**事件委托**（见下方 effect），不去摸高德 marker 的内部 DOM。
 * `title` 与 `slug` 来自 API，必须 `escapeHtml`；类名来自本项目的 CSS Module，
 * 是可信字面量，不转义（转义反而会让类名永远匹配不上）。
 */
function markerContentHtml(title: string, slug: string, selected: boolean): string {
  const shapeClass = selected
    ? `${css('mapMarkerShape')} ${css('mapMarkerShape')}--selected`
    : css('mapMarkerShape');
  return (
    `<button type="button" class="${css('mapMarker')}" ${SLUG_ATTR}="${escapeHtml(slug)}" ` +
    `aria-pressed="${selected ? 'true' : 'false'}">` +
    `<svg class="${css('mapMarkerPin')}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<path class="${shapeClass}" d="M12 2.5c-3.6 0-6.5 2.8-6.5 6.3 0 4.5 5.4 11.3 5.6 11.5.3.3.8.3 1.1 0 .2-.2 5.6-7 5.6-11.5 0-3.5-2.5-6.3-5.8-6.3z"/>` +
    '<circle cx="12" cy="8.6" r="2.2" fill="#fff"/>' +
    '</svg>' +
    `<span class="${css('visuallyHidden')}">${escapeHtml(title)}</span>` +
    '</button>'
  );
}

export default function MapCanvas({
  items,
  selected,
  initialBBox,
  amap,
  onViewportChange,
  onSelect,
  onSurfaceState,
  reducedMotion,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMapInstance | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const markersRef = useRef<Map<string, AMapMarkerInstance>>(new Map());
  /** marker 的 GCJ-02 落点：选中平移时直接用，避免"回读再转换"造成双重偏移。 */
  const gcjPositionsRef = useRef<Map<string, AMapPosition>>(new Map());
  /** 底图健康度：高德没有逐瓦片失败事件，只能靠 `complete` 是否在期限内到达。 */
  const basemapRef = useRef({ ready: false, failed: false });
  /** SDK 是否就绪（脚本 + Map 实例都建好）。 */
  const readyRef = useRef(false);
  /** 去抖器：生命周期跟随地图实例，卸载时必须 cancel。 */
  const debouncerRef = useRef<ReturnType<typeof createDebouncer> | null>(null);

  // 回调放进 ref：地图只在挂载时创建一次，不应因父组件重渲染而重建。
  const onViewportChangeRef = useRef(onViewportChange);
  const onSelectRef = useRef(onSelect);
  const onSurfaceStateRef = useRef(onSurfaceState);
  onViewportChangeRef.current = onViewportChange;
  onSelectRef.current = onSelect;
  onSurfaceStateRef.current = onSurfaceState;

  const reportSurface = useCallback((): void => {
    const status = basemapStatus(basemapRef.current);
    onSurfaceStateRef.current(
      mapSurfaceState({
        loaded: readyRef.current,
        // 还在期限内等待 ≠ 失败；只有显式 failed 才降级提示。
        basemapFailed: status === 'failed',
      }),
    );
  }, []);

  // 挂载：加载高德脚本 → 建地图。卸载时务必销毁，否则动态切换页面会留下幽灵容器。
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;

    // fail-closed：没配置 Key / 安全密钥就不碰网络，直接走纯列表降级。
    if (amap === null) {
      readyRef.current = false;
      basemapRef.current = { ready: false, failed: false };
      // 报 `unavailable` 而不是 `loading`：没有 Key 时地图**永远不会**开始加载，
      // 留在 loading 会让用户一直等一个不会来的东西，还和下面那句
      //「未配置 Key」的说明自相矛盾。
      onSurfaceStateRef.current('unavailable');
      return undefined;
    }

    let disposed = false;
    let map: AMapMapInstance | null = null;
    let deadlineTimer: number | null = null;
    let detachMoveEnd: (() => void) | null = null;

    const clearDeadline = (): void => {
      if (deadlineTimer !== null) {
        window.clearTimeout(deadlineTimer);
        deadlineTimer = null;
      }
    };

    // 初始中心也要转 GCJ-02 —— 否则首屏地图中心与所有 marker 差 300 米。
    const centerGcj = wgs84ToGcj02(bboxCenter(initialBBox));

    void loadAmap(amap)
      .then((AMap) => {
        if (disposed) return;

        map = new AMap.Map(container, {
          center: [centerGcj.lon, centerGcj.lat],
          zoom: INITIAL_ZOOM,
          viewMode: '2D',
          // 滚轮留给页面滚动：地图缩放走缩放控件与双指缩放。
          scrollWheel: false,
          zooms: ZOOM_RANGE,
          resizeEnable: true,
        });
        mapRef.current = map;
        amapRef.current = AMap;
        readyRef.current = true;

        // ① 底图就绪：地图资源加载完成。
        map.on('complete', () => {
          if (disposed) return;
          clearDeadline();
          basemapRef.current = { ready: true, failed: false };
          reportSurface();
        });

        // ② 移动停止（去抖后）才回抛 bbox。
        const debouncer = createDebouncer(MAP_MOVE_DEBOUNCE_MS);
        debouncerRef.current = debouncer;
        const handleMoveEnd = (): void => {
          if (map === null) return;
          const bounds = map.getBounds();
          debouncer.schedule(() => {
            // 高德返回 GCJ-02，必须转回 WGS-84 才能和接口的 bbox 对齐；
            // 否则每次平移都会带进约 300 米的窗口错位，marker 会被漏在窗口外。
            const next = bboxFromBounds(gcj02BoundsToWgs84(bounds));
            if (!validateBBox(next).ok) return; // 非法窗口不外抛，交给列表继续显示
            onViewportChangeRef.current(next);
          });
        };
        map.on('moveend', handleMoveEnd);
        detachMoveEnd = () => {
          debouncer.cancel();
          map?.off('moveend', handleMoveEnd);
        };

        // ③ 底图就绪期限：高德不提供逐瓦片失败事件，只能用超时兜底。
        deadlineTimer = window.setTimeout(() => {
          if (disposed || basemapRef.current.ready) return;
          basemapRef.current = { ready: false, failed: true };
          reportSurface();
        }, BASEMAP_LOAD_DEADLINE_MS);

        reportSurface();
      })
      .catch(() => {
        // 脚本加载失败：Key 无效 / 域名白名单不匹配 / CSP 拦截 / 断网。
        if (disposed) return;
        readyRef.current = false;
        basemapRef.current = { ready: false, failed: true };
        reportSurface();
      });

    return () => {
      disposed = true;
      clearDeadline();
      detachMoveEnd?.();
      detachMoveEnd = null;
      debouncerRef.current = null;
      map?.destroy();
      mapRef.current = null;
      amapRef.current = null;
      markersRef.current.clear();
      gcjPositionsRef.current.clear();
      readyRef.current = false;
      basemapRef.current = { ready: false, failed: false };
    };
    // `amap` 是来自服务端 props 的一次性配置对象，按引用稳定；
    // 刻意不依赖 `items`/`selected`，否则每来一次取数就重建整张地图。
    // deps 由这里显式列出：hooks 插件未启用 exhaustive-deps，依赖关系靠人工守。
  }, [amap, initialBBox, reportSurface]);

  // items / selected 变化 → 同步 marker。hasPoint=false 的条目不进入 markerItems。
  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (map === null || AMap === null) return undefined;

    const nextMarkers = new Map<string, AMapMarkerInstance>();
    const nextPositions = new Map<string, AMapPosition>();

    for (const item of markerItems(items)) {
      const position = markerPosition(item);
      if (position === null) continue; // 防御：markerItems 已过滤，这里是幂等收口
      const isSelected = item.slug === selected;

      // WGS-84 → GCJ-02：高德只认 GCJ-02。
      const gcj = wgs84ToGcj02(position);
      const gcjPosition: AMapPosition = [gcj.lon, gcj.lat];
      const marker = new AMap.Marker({
        position: gcjPosition,
        content: markerContentHtml(item.title, item.slug, isSelected),
        title: `${item.title}（${accuracyLabel(item.accuracy)}）`,
        // 高德 marker 默认锚点是底部中心，正好对齐 SVG 的针尖，无需 offset。
        zIndex: isSelected ? 120 : 110,
        cursor: 'pointer',
      });
      map.add(marker);
      nextMarkers.set(item.slug, marker);
      nextPositions.set(item.slug, gcjPosition);
    }

    markersRef.current = nextMarkers;
    gcjPositionsRef.current = nextPositions;

    return () => {
      for (const marker of nextMarkers.values()) {
        map.remove(marker);
        marker.destroy();
      }
    };
  }, [items, selected]);

  // 容器事件委托：marker 的 <button data-map-slug> 被点击（含键盘激活）。
  // 不给每个 marker 单独挂监听 —— 事件冒泡一次就够，也不用依赖高德内部 DOM。
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const handler = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest(`button[${SLUG_ATTR}]`);
      if (button === null) return;
      const slug = button.getAttribute(SLUG_ATTR);
      if (slug !== null && slug !== '') onSelectRef.current(slug);
    };
    container.addEventListener('click', handler);
    return () => container.removeEventListener('click', handler);
  }, []);

  // 选中项（由列表发起）→ 地图平移；由键盘选中时还要把焦点交给 marker（§9.2 第 3 条）。
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || selected === null) return;
    const position = gcjPositionsRef.current.get(selected);
    if (position === undefined) return; // 无精确点：列表已显示区域说明，地图不动

    map.panTo(position, { duration: reducedMotion ? 0 : 300 });

    // 只在**键盘**操作卡片时把焦点交给 marker：鼠标点击后抢焦点会打断
    // 用户的 Tab 路径，键盘用户才需要"选中卡片 → 焦点落到 marker"（§9.2 第 3 条）。
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.dataset.mapSelect === 'true') {
      focusMarkerButton(containerRef.current, selected);
    }
  }, [selected, reducedMotion]);

  return (
    <div ref={containerRef} className={css('mapCanvas')} data-testid="map-canvas">
      {amap === null ? (
        <p className={css('mapNotice')} role="status">
          未配置高德地图 Key，交互地图暂不可用；下方地点列表与筛选不受影响。
        </p>
      ) : null}
    </div>
  );
}

/**
 * 高德 `getBounds()`（GCJ-02）→ 请求用视窗边界（WGS-84）。
 *
 * 只转四个角即可：bbox 是轴对齐矩形，区域内任一点的偏移量在几百米尺度上
 * 可视为常数，逐点反演既昂贵也没有额外精度收益。
 */
function gcj02BoundsToWgs84(bounds: {
  readonly getSouthWest: () => { readonly lng: number; readonly lat: number };
  readonly getNorthEast: () => { readonly lng: number; readonly lat: number };
}): ViewportBounds {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const west = gcj02ToWgs84({ lon: sw.lng, lat: sw.lat });
  const north = gcj02ToWgs84({ lon: ne.lng, lat: ne.lat });
  return {
    west: west.lon,
    south: west.lat,
    east: north.lon,
    north: north.lat,
  };
}

/**
 * 把焦点移到某个 marker 的按钮上。
 *
 * 遍历比对 `getAttribute` 而不是拼 `CSS.escape` 选择器：slug 来自 API，
 * 可能含引号 / 方括号，交给 `CSS.escape` 之外的任何拼接都会变成注入点。
 */
function focusMarkerButton(container: HTMLElement | null, slug: string): void {
  if (container === null) return;
  for (const node of container.querySelectorAll<HTMLElement>(`button[${SLUG_ATTR}]`)) {
    if (node.getAttribute(SLUG_ATTR) === slug) {
      node.focus({ preventScroll: true });
      return;
    }
  }
}
