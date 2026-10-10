'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

/**
 * marker 尺寸（px），必须与 `map.module.css` 里 `.mapMarkerPin` 的 1.5rem × 2.25rem 一致。
 *
 * 之所以写死常量而不是读 DOM：高德在 `add()` 时就据此算 offset，
 * 那时元素还没被测量，读 `getBoundingClientRect()` 只会拿到 0。
 */
const MARKER_WIDTH = 24;
const MARKER_HEIGHT = 36;

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
 *
 * ⚠️ 图钉**必须用纯 CSS 画，不能用内联 SVG**：实测高德 2.0 在渲染 marker
 * `content` 时会剥掉 `<svg>`（同一个 content 里的 `<span>` 能存活）。
 * 结果就是 `<svg>` 整块消失、只剩可访问文本，视觉上退化成高德默认图钉 ——
 * 品牌色和选中态样式全部失效。用 CSS 画则 100% 存活且完全可控。
 *
 * `title` 与 `slug` 来自 API，必须 `escapeHtml`；类名来自本项目的 CSS Module，
 * 是可信字面量，不转义（转义反而会让类名永远匹配不上）。
 */
function markerContentHtml(title: string, slug: string, selected: boolean): string {
  return (
    `<button type="button" class="${css('mapMarker')}" ${SLUG_ATTR}="${escapeHtml(slug)}" ` +
    `aria-pressed="${selected ? 'true' : 'false'}">` +
    `<span class="${css('mapMarkerPin')}" aria-hidden="true"></span>` +
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

  /**
   * SDK 是否已就绪（脚本加载完 + Map 实例建好）。
   *
   * ⚠️ 这不是可有可无的冗余状态，而是**必需**的：高德脚本走 `<script>` 注入，
   * 必然异步。而 `useEffect` 只在依赖变化时重跑 —— mount 那一刻 `mapRef.current`
   * 还是 `null`，建 marker 的 effect 会直接 return；等脚本 resolve 后如果只用
   * ref 记录就绪状态，**没有任何东西触发重跑**，marker 永远是空的。
   * 实测踩过：底图正常渲染、`amap-markers` 容器却是空的，且所有单测全绿
   *（单测只覆盖纯函数，覆盖不到组件接线）。
   */
  const [mapReady, setMapReady] = useState(false);

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
  /**
 * 地图实例只认**值**，不认对象身份。
 *
 * `initialBBox` 与 `amap` 都是服务端组件在每次渲染里新建的对象：点一下 marker
 * → `router.replace` 写选中态 → 服务端重渲染 → 两个 prop 引用全变（值却一样）。
 * 若把它们直接放进 `useEffect` 依赖，整张地图会在**每次选中/取消选中时**被
 * 销毁重建：用户刚点中就眼看着底图闪一下，高德还会因为在 destroy 期间仍有
 * 排版任务在跑而抛 `LngLat(NaN, NaN)` / `Pixel(NaN, NaN)`（实测）。
 *
 * 因此 deps 只放**原始值**组成的 key，值本身经 ref 读取 ——
 * hooks 插件未启用 exhaustive-deps，依赖关系靠这里人工守。
 */
const bboxKey = `${initialBBox.minLon}|${initialBBox.minLat}|${initialBBox.maxLon}|${initialBBox.maxLat}`;
const amapKey = amap === null ? '' : amap.key;
const initialBBoxRef = useRef(initialBBox);
const configRef = useRef(amap);
initialBBoxRef.current = initialBBox;
configRef.current = amap;

useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;

    const config = configRef.current;

    // fail-closed：没配置 Key / 安全密钥就不碰网络，直接走纯列表降级。
    if (config === null) {
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
    const centerGcj = wgs84ToGcj02(bboxCenter(initialBBoxRef.current));

    void loadAmap(config)
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

        // ① 底图就绪 = 地图资源加载完成。
        //
        // ⚠️ `mapReady` **必须等到这里**才能置位，不能在 `new AMap.Map()` 之后立刻置。
        // 高德的视窗在 `complete` 之前还没有尺寸，`lngLatToContainer()` 会返回
        // `Pixel(NaN, NaN)`，紧接着 `map.add(marker)` 抛异常，被 MapErrorBoundary
        // 接住 → 整张地图降级成纯列表（实测踩过：首屏正常，点一次 marker 就挂）。
        map.on('complete', () => {
          if (disposed) return;
          clearDeadline();
          basemapRef.current = { ready: true, failed: false };
          readyRef.current = true;
          setMapReady(true);
          reportSurface();
        });

        // ② 移动停止（去抖后）才回抛 bbox。
        const debouncer = createDebouncer(MAP_MOVE_DEBOUNCE_MS);
        debouncerRef.current = debouncer;
        const handleMoveEnd = (): void => {
          if (map === null) return;
          // 视窗尚未就绪时 getBounds() 会抛 NaN 相关的错；这里吞掉即可 ——
          // 移动事件本来就允许丢失（下次移动还会再触发），不值得为此降级整块地图。
          let bounds: ReturnType<AMapMapInstance['getBounds']>;
          try {
            bounds = map.getBounds();
          } catch {
            return;
          }
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
      // 必须在 `mapRef.current = null` **之后**再降级：marker effect 重跑时
      // 靠 `mapRef.current === null` 就能立刻退出，不必等 React 的状态更新。
      setMapReady(false);
    };
    // 只依赖**值**（bboxKey / amapKey）与稳定的 reportSurface 回调；
    // 刻意不依赖 `items`/`selected`，否则每来一次取数就重建整张地图。
    // 详见上方 bboxKey 处的说明。
  }, [amapKey, bboxKey, reportSurface]);

  // items / selected 变化 → 同步 marker。hasPoint=false 的条目不进入 markerItems。
  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    // mapReady 在 deps 里：SDK 到位前这里直接退出，到位后自动补建。
    if (!mapReady || map === null || AMap === null) return undefined;

    const nextMarkers = new Map<string, AMapMarkerInstance>();
    const nextPositions = new Map<string, AMapPosition>();

    for (const item of markerItems(items)) {
      const position = markerPosition(item);
      if (position === null) continue; // 防御：markerItems 已过滤，这里是幂等收口
      const isSelected = item.slug === selected;

      // WGS-84 → GCJ-02：高德只认 GCJ-02。
      //
      // 实测（A/B，真实浏览器）：去掉这一步，marker 在 zoom 12 下会左移 15.1px、
      // 上移 7.1px，与"经度 +0.0052°、纬度 −0.0020°"的换算预测值（14.8 / 6.9px）
      // 吻合到 2% 以内。**别再删这一行** —— 它不会报错，只会让点位静默偏 300 米。
      const gcj = wgs84ToGcj02(position);
      const gcjPosition: AMapPosition = [gcj.lon, gcj.lat];
      const marker = new AMap.Marker({
        position: gcjPosition,
        content: markerContentHtml(item.title, item.slug, isSelected),
        title: `${item.title}（${accuracyLabel(item.accuracy)}）`,
        // 针尖对齐：高德把 marker 容器的**左上角**钉在坐标点上
        // （实测：按"左上角 = 地理像素"反算与理论值亚像素吻合）。
        // 不给 offset 的话针尖会落在坐标点以南 36px ≈ 1.1 公里处 ——
        // 对一个"点位地图"来说这是实打实的指错位置。
        offset: new AMap.Pixel(-MARKER_WIDTH / 2, -MARKER_HEIGHT),
        zIndex: isSelected ? 120 : 110,
        cursor: 'pointer',
      });

      // 单个 marker 失败**不许拖垮整张地图**：`map.add()` 会经
      // `lngLatToContainer()` 把地理坐标换算成像素，若此刻视窗尚未就绪就抛
      // `Pixel(NaN, NaN)`，冒泡到 MapErrorBoundary 会让地图整块降级、
      // 而地点其实全都在列表里。宁可不画这个点，也不能让用户连地图一起失去。
      try {
        map.add(marker);
      } catch {
        continue;
      }
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
  }, [items, selected, mapReady]);

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
    if (!mapReady || map === null || selected === null) return;
    const position = gcjPositionsRef.current.get(selected);
    if (position === undefined) return; // 无精确点：列表已显示区域说明，地图不动

    // 同 add：平移失败不能冒泡到错误边界（那会把整张地图降级掉）。
    try {
      map.panTo(position, { duration: reducedMotion ? 0 : 300 });
    } catch {
      return;
    }

    // 只在**键盘**操作卡片时把焦点交给 marker：鼠标点击后抢焦点会打断
    // 用户的 Tab 路径，键盘用户才需要"选中卡片 → 焦点落到 marker"（§9.2 第 3 条）。
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.dataset.mapSelect === 'true') {
      focusMarkerButton(containerRef.current, selected);
    }
  }, [selected, reducedMotion, mapReady]);

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
