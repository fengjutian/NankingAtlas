/**
 * 高德 JS API 2.0 的最小类型面（`apps/web/src/lib/amap-sdk.ts`）。
 *
 * ## 为什么不装 `@amap/amap-jsapi-loader` / `@amap/amap-jsapi-locales`
 *
 * 官方 loader 做的事情就是"插一个 script 标签并缓存 Promise"（约 40 行），
 * 而我们自己写反而更好控：
 * - `_AMapSecurityConfig` **必须在插 script 之前**注入，官方 loader 把它封在
 *   内部，失败时（key 无效、域名不匹配）只会 reject 一个没有信息的错误；
 * - 需要严格遵守本页面的 CSP（外链脚本没有 nonce，只能靠 `script-src` 白名单）；
 * - 需要在同一页面被动态重建（`MapErrorBoundary` 的 retry）时正确复用同一个实例。
 *
 * 高德没有官方发布的 TypeScript 类型，因此这里**手写最小声明**，
 * 只覆盖本项目真正调用的成员。这样 `strict` 依然全程开启，不需要 `any`，
 * 也不会因为上游类型变动而整片飘红。
 *
 * 坐标系：高德使用 **GCJ-02**。文档明确要求 WGS-84 数据"请先进行坐标转换"，
 * 见 `map-coords.ts`。
 */

/** 高德内部使用 `[lng, lat]` 数组；`getCenter()` 等返回对象形式。 */
export type AMapPosition = readonly [number, number];

export interface AMapLngLat {
  readonly lng: number;
  readonly lat: number;
}

export interface AMapBounds {
  getSouthWest(): AMapLngLat;
  getNorthEast(): AMapLngLat;
}

export interface AMapMapOptions {
  readonly zoom?: number;
  readonly center?: AMapPosition;
  /** `2D` / `3D`。 */
  readonly viewMode?: '2D' | '3D';
  /** 关闭滚轮缩放：与交互习惯一致，也避免抢走页面滚动。 */
  readonly scrollWheel?: boolean;
  readonly zooms?: readonly [number, number];
  readonly resizeEnable?: boolean;
}

export interface AMapMarkerOptions {
  readonly position: AMapPosition;
  /** 自定义 HTML；高德会把它包进 marker 容器里渲染。 */
  readonly content?: string;
  /**
   * 像素偏移。必须是 `AMap.Pixel` 实例，不是坐标数组 ——
   * `AMap.Marker` 会把整个 content 容器的左上角钉在 `position` 上，
   * 想让图钉**针尖**落在坐标点就得用这里手动补偿。
   */
  readonly offset?: AMapPixelPosition;
  readonly zIndex?: number;
  readonly cursor?: string;
  readonly title?: string;
  readonly anchor?: 'bottom-center';
  readonly clickable?: boolean;
}

export interface AMapPixelPosition {
  readonly x: number;
  readonly y: number;
}

export interface AMapMarkerInstance {
  setPosition(position: AMapPosition): void;
  getPosition(): AMapLngLat;
  setContent(content: string): void;
  setzIndex(zIndex: number): void;
  setOffset(offset: AMapPixelPosition): void;
  /** 高德 2.0 中 `setFitView` 需要 Overlays[]，单元素要包一层。 */
  setFitView(overlays?: unknown, opts?: { readonly immediately?: boolean }): void;
  on(type: string, handler: () => void): void;
  off(type: string, handler?: () => void): void;
  destroy(): void;
}

export interface AMapMoveEvent {
  readonly type: string;
}

export interface AMapMapInstance {
  on(type: string, handler: (event: AMapMoveEvent) => void): void;
  off(type: string, handler?: (event: AMapMoveEvent) => void): void;
  getBounds(): AMapBounds;
  getCenter(): AMapLngLat;
  getZoom(): number;
  setZoomAndCenter(zoom: number, center: AMapPosition, opts?: { readonly animate?: boolean }): void;
  panTo(position: AMapPosition, opts?: { readonly duration?: number }): void;
  add(overlay: AMapMarkerInstance): void;
  remove(overlay: AMapMarkerInstance): void;
  /** 显式触发容器尺寸重算（面板展开/折叠后必须调用）。 */
  resize?(): void;
  destroy(): void;
}

/**
 * 高德地理编码器（ADR-0003：改造后高德只提供数据，不做渲染）。
 */
export interface AMapGeocoderInstance {
  /**
   * 发起地理编码。
   *
   * ⚠️ 高���用 `status` 字符串表达结果而非抛异常：只有 `'complete'` 才带 pois，
   * 其余（`'no_data'` / `'invalid_user_key'` / `'error'`）都要当失败处理。
   */
  search(
    address: string,
    options: { city?: string | undefined },
    callback: (
      status: string,
      result: { pois?: readonly AMapPoi[] | undefined } | undefined,
    ) => void,
  ): void;
}

/** 地理编码结果中的 POI 最小形状。 */
export interface AMapPoi {
  /** 坐标形状与 Leaflet 不同：高德是 `{ lng, lat }`。 */
  readonly location?: { readonly lng: unknown; readonly lat: unknown } | undefined;
  readonly address?: unknown;
}

export interface AMapNamespace {
  Map: new (container: HTMLElement, options?: AMapMapOptions) => AMapMapInstance;
  Marker: new (options: AMapMarkerOptions) => AMapMarkerInstance;
  Pixel: new (x: number, y: number) => AMapPixelPosition;
  /** 地理编码插件实例化入口。 */
  Geocoder: new () => AMapGeocoderInstance;
}

declare global {
  interface Window {
    /** 高德 2.0 安全校验配置。必须在加载脚本**之前**赋值。 */
    _AMapSecurityConfig?: { securityJsCode?: string };
    /** 高德脚本加载后挂载的全局命名空间。 */
    AMap?: AMapNamespace;
  }
}

/** 从 `window` 取出已加载的高德命名空间；未加载返回 null。 */
export function readAmapGlobal(): AMapNamespace | null {
  if (typeof window === 'undefined') return null;
  const amap = window.AMap;
  return amap ?? null;
}
