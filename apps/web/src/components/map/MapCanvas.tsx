'use client';

// Leaflet 自带样式（瓦片缩放、弹窗、marker 默认图标定位）。
// 必须在组件里 import：它决定 `.leaflet-*` 类的定位，缺失会导致瓦片错位。
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';

// `./marker` 是 `map.module.css` 的唯一所有者并导出 `css()`：
// marker 与本组件必须拿到**同一次编译**产出的同一份类名，
// 各自 import 会引入两个解析入口，混用时样式直接匹配不上。
import {
  MARKER_HEIGHT,
  MARKER_WIDTH,
  SLUG_ATTR,
  css,
  focusMarkerButton,
  markerContentHtml,
} from './marker';

import type { MapBBox } from '@/lib/map-geo';

import {
  INITIAL_ZOOM,
  LEAFLET_ZOOM_RANGE,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  tileHealth,
  type TileHealthState,
} from '@/lib/leaflet-config';
import { accuracyLabel, markerItems, markerPosition, type MapPlaceItem } from '@/lib/map-data';
import { bboxCenter, bboxFromBounds, validateBBox } from '@/lib/map-geo';
import {
  MAP_MOVE_DEBOUNCE_MS,
  createDebouncer,
  mapSurfaceState,
  type MapSurfaceState,
} from '@/lib/map-state';

/**
 * 交互地图（Leaflet 渲染 + 高德提供数据，ADR-0003）。
 *
 * 必须由 `MapExplorer` 用 `next/dynamic({ ssr: false })` 载入：
 * Leaflet 直接读 `window`/`document`，且 §9.2 要求"首屏先渲染列表"——
 * 地图块是增强，不是前提。
 *
 * 三条硬约束（技术方案 §9.2）：
 * 1. 底图不可用 → 上报 `basemap_failed`，列表照常；
 * 2. `moveend` 去抖后才把新 bbox 抛给上层取数；
 * 3. `hasPoint=false` / 精度不足的地点不产生 marker，只在列表里给区域说明。
 *
 * ## 坐标系：本文件现在**没有**坐标转换
 *
 * 底图是 OSM 标准瓦片（WGS-84），与数据库权威坐标一致，因此
 * marker 落点与视窗 bbox 都是**原样传递**，不再有 WGS-84 ⇄ GCJ-02 的来回换算。
 * 少一层转换就少一个静默偏移源（详见 ADR-0003 §3）。
 *
 * 唯一仍需转换的地方是**高德地理编码的返回值**（GCJ-02 → WGS-84），
 * 但那不发生在本文件，见 `lib/geocode.ts`。
 *
 * ⚠️ **坐标顺序**：Leaflet 一律 `[lat, lng]`，与高德的 `[lng, lat]` 相反。
 * 本项目对外统一 `lon`/`lat`，所以传给 Leaflet 时必须写成 `[lat, lon]`。
 * 写反了不会报错，只会让所有点位南北颠倒。
 */
export interface MapCanvasProps {
  readonly items: readonly MapPlaceItem[];
  readonly selected: string | null;
  readonly initialBBox: MapBBox;
  /**
   * 地图是否可用。`false` 时**不初始化 Leaflet**，直接显示纯列表降级提示。
   *
   * 改造后底图只依赖 OSM 瓦片，不再需要高德 Key —— 因此这个开关
   * 表示的是"瓦片源是否被允许使用"，而不是"有没有高德 Key"。
   */
  readonly enabled: boolean;
  /** 未启用的原因（面向访客的一句话说明，不是维护者文案）。 */
  readonly disabledReason?: string | null;
  /** 地图移动停止（去抖后）后回调，参数是新的请求 bbox。 */
  readonly onViewportChange: (bbox: MapBBox) => void;
  /** marker 被点选（鼠标或键盘）。 */
  readonly onSelect: (slug: string) => void;
  readonly onSurfaceState: (state: MapSurfaceState) => void;
  readonly reducedMotion: boolean;
}

export default function MapCanvas({
  items,
  selected,
  initialBBox,
  enabled,
  disabledReason = null,
  onViewportChange,
  onSelect,
  onSurfaceState,
  reducedMotion,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const tilesRef = useRef<TileHealthState>({ loaded: 0, errored: 0 });
  const readyRef = useRef(false);
  const debouncerRef = useRef<ReturnType<typeof createDebouncer> | null>(null);

  /**
   * 地图是否已创建。
   *
   * ⚠️ 不是冗余状态：Leaflet 实例在 `useEffect` 里异步创建，而 marker 的 effect
   * 只在依赖变化时重跑。mount 那一刻 `mapRef.current` 还是 `null`，
   * 等实例建好后若只记 ref，**没有任何东西触发重跑**，marker 永远是空的。
   */
  const [mapReady, setMapReady] = useState(false);

  const onViewportChangeRef = useRef(onViewportChange);
  const onSelectRef = useRef(onSelect);
  const onSurfaceStateRef = useRef(onSurfaceState);
  onViewportChangeRef.current = onViewportChange;
  onSelectRef.current = onSelect;
  onSurfaceStateRef.current = onSurfaceState;

  const reportSurface = useCallback((): void => {
    const health = tileHealth(tilesRef.current.loaded, tilesRef.current.errored);
    onSurfaceStateRef.current(
      mapSurfaceState({
        loaded: readyRef.current,
        basemapFailed: health === 'failed',
      }),
    );
  }, []);

  /**
   * 地图实例只认**值**，不认对象身份。
   *
   * `initialBBox` 是服务端组件每次渲染新建的对象：点一下 marker →
   * `router.replace` 写选中态 → 服务端重渲染 → prop 引用全变（值却一样）。
   * 若把它直接放进 `useEffect` 依赖，整张地图会在**每次选中/取消选中时**被销毁重建。
   */
  const bboxKey = `${initialBBox.minLon}|${initialBBox.minLat}|${initialBBox.maxLon}|${initialBBox.maxLat}`;
  const initialBBoxRef = useRef(initialBBox);
  initialBBoxRef.current = initialBBox;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;

    if (!enabled) {
      readyRef.current = false;
      tilesRef.current = { loaded: 0, errored: 0 };
      onSurfaceStateRef.current('unavailable');
      return undefined;
    }

    const center = bboxCenter(initialBBoxRef.current);
    const map = L.map(container, {
      // Leaflet 用 [lat, lng]，与本项目对外的 lon/lat 相反。
      center: [center.lat, center.lon],
      zoom: INITIAL_ZOOM,
      minZoom: LEAFLET_ZOOM_RANGE.min,
      maxZoom: LEAFLET_ZOOM_RANGE.max,
      // 滚轮留给页面滚动：地图缩放走缩放控件与双指缩放（与改造前一致）。
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    const tiles = L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: LEAFLET_ZOOM_RANGE.max,
      // 底图失败可判定：Leaflet 有逐瓦片事件，不必再靠超时兜底。
      errorTileUrl: '',
    });

    // ① 底图健康度：逐瓦片计数。
    const bump = (field: 'loaded' | 'errored'): void => {
      tilesRef.current = {
        ...tilesRef.current,
        [field]: tilesRef.current[field] + 1,
      };
      reportSurface();
    };
    tiles.on('load', () => {
      bump('loaded');
      readyRef.current = true;
      setMapReady(true);
    });
    tiles.on('tileerror', () => bump('errored'));

    tiles.addTo(map);

    // ② 移动停止（去抖后）才回抛 bbox。
    const debouncer = createDebouncer(MAP_MOVE_DEBOUNCE_MS);
    debouncerRef.current = debouncer;
    // Leaflet 在 `L.map({center, zoom})` 内部会调一次 setView，**建图当场就触发
    // 一次 moveend**（高德当年不会）。那次视窗就是 initialBBox，回抛它是纯冗余：
    // 上层会拿着与首屏相同的 bbox 再取一次数、再 router.replace 一次，
    // 服务端重渲染 → initialBBox 引用变化 → 地图重建 → 又触发 moveend → 死循环。
    // 实测表现为地图在「加载中」占位与已渲染之间反复横跳。
    let firstMoveEnd = true;
    const handleMoveEnd = (): void => {
      if (firstMoveEnd) {
        firstMoveEnd = false;
        return;
      }
      const bounds = map.getBounds();
      debouncer.schedule(() => {
        // OSM 瓦片就是 WGS-84，视窗 bbox 与接口参数同坐标系，**无需转换**。
        const next = bboxFromBounds({
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        });
        if (!validateBBox(next).ok) return; // 非法窗口不外抛，交给列表继续显示
        onViewportChangeRef.current(next);
      });
    };
    map.on('moveend', handleMoveEnd);

    reportSurface();

    return () => {
      debouncer.cancel();
      debouncerRef.current = null;
      map.off('moveend', handleMoveEnd);
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      tilesRef.current = { loaded: 0, errored: 0 };
      readyRef.current = false;
      // 必须在 `mapRef.current = null` **之后**再降级：marker effect 重跑时
      // 靠 `mapRef.current === null` 就能立刻退出，不必等 React 的状态更新。
      setMapReady(false);
    };
    // 只依赖**值**（enabled / bboxKey）与稳定的 reportSurface 回调；
    // 刻意不依赖 `items`/`selected`，否则每来一次取数就重建整张地图。
  }, [enabled, bboxKey, reportSurface]);

  // items / selected 变化 → 同步 marker。hasPoint=false 的条目不进入 markerItems。
  useEffect(() => {
    const map = mapRef.current;
    // mapReady 在 deps 里：实例就绪前这里直接退出，到位后自动补建。
    if (!mapReady || map === null) return undefined;

    const nextMarkers = new Map<string, L.Marker>();

    for (const item of markerItems(items)) {
      const position = markerPosition(item);
      if (position === null) continue; // 防御：markerItems 已过滤，这里是幂等收口
      const isSelected = item.slug === selected;

      // WGS-84 原样传入 —— OSM 瓦片与数据库同坐标系（ADR-0003 §3）。
      // 注意 [lat, lon] 的顺序。
      const marker = L.marker([position.lat, position.lon], {
        icon: L.divIcon({
          className: '',
          html: markerContentHtml(item.title, item.slug, isSelected),
          // divIcon 的锚点是**图标中心点**；我们的图钉是「圆 + 下方三角」，
          // 锚点取底部尖端才能让针尖落在坐标上。
          iconSize: [MARKER_WIDTH, MARKER_HEIGHT],
          iconAnchor: [MARKER_WIDTH / 2, MARKER_HEIGHT],
        }),
        title: `${item.title}（${accuracyLabel(item.accuracy)}）`,
        zIndexOffset: isSelected ? 120 : 0,
        keyboard: true,
        riseOnHover: !isSelected,
      });

      // 单个 marker 失败**不许拖垮整张地图**：容器尚未就绪时 Leaflet 换算像素会抛
      // NaN 相关错误，冒泡到 MapErrorBoundary 会让地图整块降级、而地点其实都在列表里。
      try {
        marker.addTo(map);
      } catch {
        continue;
      }
      nextMarkers.set(item.slug, marker);
    }

    markersRef.current = nextMarkers;

    return () => {
      for (const marker of nextMarkers.values()) {
        marker.remove();
      }
    };
  }, [items, selected, mapReady]);

  // 容器事件委托：marker 的 <button data-map-slug> 被点击（含键盘激活）。
  // 不给每个 marker 单独挂监听 —— 事件冒泡一次就够。
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
    const marker = markersRef.current.get(selected);
    if (marker === undefined) return; // 无精确点：列表已显示区域说明，地图不动

    const position = marker.getLatLng();
    try {
      map.setView(position, map.getZoom(), {
        animate: !reducedMotion,
        duration: 0.3,
      });
    } catch {
      return; // 平移失败不能冒泡到错误边界（那会把整张地图降级掉）
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
      {enabled ? null : (
        <p className={css('mapNotice')} role="status">
          {disabledReason ?? '交互地图暂不可用；下方地点列表与筛选不受影响。'}
        </p>
      )}
    </div>
  );
}
