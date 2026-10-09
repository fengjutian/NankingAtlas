'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useRef } from 'react';

import styles from './map.module.css';

import type { MapBBox } from '@/lib/map-geo';

import { accuracyLabel, markerItems, markerPosition, type MapPlaceItem } from '@/lib/map-data';
import { bboxFromBounds, bboxCenter, validateBBox } from '@/lib/map-geo';
import {
  MAP_MOVE_DEBOUNCE_MS,
  createDebouncer,
  escapeHtml,
  mapSurfaceState,
  tileFailureState,
  type MapSurfaceState,
} from '@/lib/map-state';
import { resolveTileConfig } from '@/lib/map-tile';

/**
 * 交互地图（Leaflet）。
 *
 * 必须由 `MapExplorer` 用 `next/dynamic({ ssr: false })` 载入：
 * Leaflet 在模块求值期就访问 `window`，SSR 阶段会直接崩，
 * 而 §9.2 要求"首屏先渲染列表"——地图块是增强，不是前提。
 *
 * 三条硬约束（技术方案 §9.2）：
 * 1. 底图瓦片 `tileerror` 累计到阈值 → 上报 `basemap_failed`，列表照常；
 * 2. `moveend` 去抖后才把新 bbox 抛给上层取数；
 * 3. `hasPoint=false` / 精度不足的地点不产生 marker，只在列表里给区域说明。
 */
export interface MapCanvasProps {
  readonly items: readonly MapPlaceItem[];
  readonly selected: string | null;
  readonly initialBBox: MapBBox;
  /** 地图移动停止（去抖后）后回调，参数是新的请求 bbox。 */
  readonly onViewportChange: (bbox: MapBBox) => void;
  /** marker 被点选（鼠标或键盘）。 */
  readonly onSelect: (slug: string) => void;
  readonly onSurfaceState: (state: MapSurfaceState) => void;
  readonly reducedMotion: boolean;
}

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

/** divIcon 的内联 SVG：不用默认图标文件（Next 下易 404），不用 emoji（无可访问文本）。 */
function markerIconHtml(title: string, selected: boolean): string {
  const shapeClass = selected
    ? `${css('mapMarkerShape')} ${css('mapMarkerShape')}--selected`
    : css('mapMarkerShape');
  const svg =
    '<svg class="' +
    escapeHtml(css('mapMarkerPin')) +
    '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path class="' +
    escapeHtml(shapeClass) +
    '" d="M12 2.5c-3.6 0-6.5 2.8-6.5 6.3 0 4.5 5.4 11.3 5.6 11.5.3.3.8.3 1.1 0 .2-.2 5.6-7 5.6-11.5 0-3.5-2.5-6.3-5.8-6.3z"/>' +
    '<circle cx="12" cy="8.6" r="2.2" fill="#fff"/>' +
    '</svg>';
  // 视觉隐藏的可访问文本：marker 元素没有它就只是"一个无名按钮"。
  return (
    svg + '<span class="' + escapeHtml(css('mapMarkerLabel')) + '">' + escapeHtml(title) + '</span>'
  );
}

export default function MapCanvas({
  items,
  selected,
  initialBBox,
  onViewportChange,
  onSelect,
  onSurfaceState,
  reducedMotion,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const tileRef = useRef<{ errors: number; loaded: boolean }>({ errors: 0, loaded: false });
  const debouncerRef = useRef<ReturnType<typeof createDebouncer> | null>(null);

  // 回调放进 ref：地图只在挂载时创建一次，不应因父组件重渲染而重建。
  const onViewportChangeRef = useRef(onViewportChange);
  const onSelectRef = useRef(onSelect);
  const onSurfaceStateRef = useRef(onSurfaceState);
  onViewportChangeRef.current = onViewportChange;
  onSelectRef.current = onSelect;
  onSurfaceStateRef.current = onSurfaceState;

  const reportSurface = useCallback(() => {
    const state = mapSurfaceState({
      loaded: true,
      tileErrors: tileRef.current.errors,
      tileLoaded: tileRef.current.loaded,
    });
    onSurfaceStateRef.current(state);
  }, []);

  // 挂载：建地图 + 底图。卸载时务必销毁，动态切换页面会留下幽灵容器。
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;

    const center = bboxCenter(initialBBox);
    const zoom = 12;
    const map = L.map(container, {
      center: [center.lat, center.lon],
      zoom,
      scrollWheelZoom: false,
      // 尊重"减少动画"：关闭缩放/平移动画，不改变任何功能。
      zoomAnimation: !reducedMotion,
      fadeAnimation: !reducedMotion,
      markerZoomAnimation: !reducedMotion,
    });
    mapRef.current = map;

    const tile = resolveTileConfig();
    const layer = L.tileLayer(tile.urlTemplate, {
      maxZoom: tile.maxZoom,
      attribution: tile.attribution,
    });

    // Leaflet 的瓦片失败事件是 `tileerror`（`error` 只属于 DOM 层）。
    // 单张 404 属常态噪声，累计到阈值才判定底图整体不可用。
    layer.on('tileerror', () => {
      tileRef.current.errors += 1;
      if (tileFailureState(tileRef.current.errors, tileRef.current.loaded) === 'failed') {
        reportSurface();
      }
    });
    layer.on('load', () => {
      tileRef.current.loaded = true;
      reportSurface();
    });
    layer.addTo(map);

    const debouncer = createDebouncer(MAP_MOVE_DEBOUNCE_MS);
    debouncerRef.current = debouncer;
    const handleMoveEnd = (): void => {
      if (!mapRef.current) return;
      const bounds = mapRef.current.getBounds();
      debouncer.schedule(() => {
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

    return () => {
      debouncer.cancel();
      debouncerRef.current = null;
      map.off('moveend', handleMoveEnd);
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, [initialBBox, reducedMotion, reportSurface]);

  // items 变化 → 同步 marker。hasPoint=false / 精度不足的条目天然不进入 markerItems。
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;

    const nextMarkers = new Map<string, L.Marker>();
    for (const item of markerItems(items)) {
      const position = markerPosition(item);
      if (position === null) continue; // 防御：markerItems 已过滤，这里是幂等收口
      const isSelected = item.slug === selected;
      const marker = L.marker([position.lat, position.lon], {
        icon: L.divIcon({
          className: css('mapMarker'),
          html: markerIconHtml(item.title, isSelected),
          iconSize: [24, 24],
          iconAnchor: [12, 24],
        }),
        title: item.title,
        alt: `${item.title}（${accuracyLabel(item.accuracy)}）`,
        keyboard: true,
        riseOnHover: true,
        riseOffset: reducedMotion ? 0 : 250,
      });
      marker.on('click', () => onSelectRef.current(item.slug));
      // @types/leaflet 的 `keypress` 回调签名是 `LeafletEvent`，未声明 `originalEvent`；
      // 这里显式收窄到带 `originalEvent` 的结构，不用 any。
      marker.on('keypress', (event: L.LeafletEvent) => {
        const original = (event as unknown as { readonly originalEvent?: KeyboardEvent })
          .originalEvent;
        if (original === undefined) return;
        if (original.key === 'Enter' || original.key === ' ' || original.key === 'Spacebar') {
          original.preventDefault();
          onSelectRef.current(item.slug);
        }
      });
      marker.addTo(map);
      const element = marker.getElement();
      if (element !== undefined && element.parentElement !== null) {
        // Leaflet 只设 tabIndex；显式补 role/aria-pressed，读屏才不会读到"无名按钮"。
        element.setAttribute('role', 'button');
        element.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      }
      nextMarkers.set(item.slug, marker);
    }

    markersRef.current = nextMarkers;
    return () => {
      for (const marker of nextMarkers.values()) marker.remove();
    };
  }, [items, selected, reducedMotion]);

  // 选中项（由列表发起）→ 地图平移；由键盘选中时还要把焦点交给 marker（§9.2 第 3 条）。
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || selected === null) return;
    const marker = markersRef.current.get(selected);
    if (marker === undefined) return; // 无精确点：列表已显示区域说明，地图不动

    const position = marker.getLatLng();
    map.panTo([position.lat, position.lng], { animate: !reducedMotion });

    // 只在**键盘**操作卡片时把焦点交给 marker：鼠标点击后抢焦点会打断
    // 用户的 Tab 路径，键盘用户才需要"选中卡片 → 焦点落到 marker"（§9.2 第 3 条）。
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.dataset.mapSelect === 'true') {
      marker.getElement()?.focus({ preventScroll: true });
    }
  }, [selected, reducedMotion]);

  return <div ref={containerRef} className={css('mapCanvas')} data-testid="map-canvas" />;
}
