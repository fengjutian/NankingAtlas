/**
 * 底图瓦片配置与健康判定（ADR-0003）。
 *
 * ## 为什么单独成文件
 *
 * 判定逻辑是**纯函数**，必须可被单测直接覆盖；而 Leaflet 的导入只在浏览器里成立，
 * 两者混在一个文件里就没法在 node 环境测。参见 `map-state.ts` 的同类做法。
 */

/** 瓦片来源。OpenStreetMap 标准瓦片，坐标系 WGS-84。 */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * 归属信息。
 *
 * OSM Tile 使用政策**强制要求**显示署名，且必须可点击回源站。
 * 缺了它不只是不礼貌，是明确的许可违规。
 */
export const OSM_ATTRIBUTION =
  '地图数据 <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> 贡献者';

/** 缩放范围。OSM 标准瓦片最高 19 级，再高没有数据。 */
export const LEAFLET_ZOOM_RANGE: Readonly<{ min: number; max: number }> = Object.freeze({
  min: 3,
  max: 19,
});

/** 底图初始缩放级（南京主城尺度）。 */
export const INITIAL_ZOOM = 12;

/**
 * 瓦片失败判定阈值。
 *
 * Leaflet 有 `tileerror` / `load` 事件，可以**逐片**统计 —— 这是它比旧的高德方案
 * 强的地方（高德没有逐瓦片失败事件，只能靠超时猜）。因此不再需要
 * `BASEMAP_LOAD_DEADLINE_MS` 那种"到点就当失败"的做法。
 *
 * 阈值取"连续失败超过此数即判失败"：单片失败可能是网络抖动，判定整张图不可用
 * 过早会误伤；一直失败则说明瓦片源不通（如被墙、被 CSP 拦、域名被限流）。
 */
export const MAX_TILE_ERRORS_BEFORE_FAILED = 12;

/** 一次渲染视窗内的合理瓦片数量级，用于识别"整片都没加载"而不是个别失败。 */
export const MIN_TILES_FOR_HEALTHY = 4;

export type BasemapHealth = 'loading' | 'ready' | 'failed';

export interface TileHealthState {
  readonly loaded: number;
  readonly errored: number;
}

/**
 * 由瓦片计数判定底图健康度。
 *
 * @param loaded  已成功加载的瓦片数
 * @param errored 加载失败的瓦片数
 */
export function tileHealth(loaded: number, errored: number): BasemapHealth {
  if (errored >= MAX_TILE_ERRORS_BEFORE_FAILED) return 'failed';
  // 有失败但还没到阈值：继续等，不判失败 —— 地图仍可能可用。
  if (loaded > 0 && loaded >= MIN_TILES_FOR_HEALTHY) return 'ready';
  if (errored === 0) return 'loading';
  // 失败数未到阈值且成功数不足：仍在加载中，让 `load`/`tileerror` 继续推动。
  return 'loading';
}

/**
 * 经度 → 瓦片 X（Web 墨卡托，标准公式）。
 *
 * 抽成纯函数是为了能单测边界；实际渲染由 Leaflet 内部完成，这里仅用于文档与调试。
 */
export function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}

/**
 * 纬度 → 瓦片 Y（Web 墨卡托）。
 *
 * ⚠️ 纬度必须夹到 ±85.05112878：超出后 `log(tan(...))` 会得到 NaN。
 * Leaflet 自己会处理，但任何自己算瓦片范围的地方都必须夹。
 */
export function latToTileY(lat: number, zoom: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}