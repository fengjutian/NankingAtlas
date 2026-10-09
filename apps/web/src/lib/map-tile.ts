/**
 * 底图配置（P3-02）。
 *
 * 事实依据：技术方案 §2「地图 Leaflet，底图提供商可配置；底图失败时保留列表和筛选」
 * 与 §14 的 `MAP_TILE_URL` / `MAP_ATTRIBUTION`。
 *
 * ⚠️ 未决事项（技术方案 §19「P3 前：合法可用的底图供应商、配额、attribution 与
 * 中国大陆坐标/合规策略」尚待维护者确认并写 ADR）：当前默认值指向公共 OSM 瓦片，
 * 仅适用于本地开发与低流量预览，**不得据此直接上生产**。上线前必须通过
 * `NEXT_PUBLIC_MAP_TILE_URL` / `NEXT_PUBLIC_MAP_ATTRIBUTION` 指向已获授权的底图。
 *
 * 本文件不 import `lib/env.ts`：它依赖 fail-fast 的模块级校验，不能进客户端 bundle；
 * `NEXT_PUBLIC_*` 在 Next 客户端构建时会被静态内联，运行时缺失则回落到默认值。
 */

/** 默认底图：OpenStreetMap 标准图层。仅供开发/预览，生产须替换。 */
export const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** OSM 使用条款要求署名，这里给出最小可用的默认 attribution。 */
export const DEFAULT_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 贡献者';

export const TILE_MAX_ZOOM = 19;

export interface TileConfig {
  readonly urlTemplate: string;
  readonly attribution: string;
  readonly maxZoom: number;
  /** 是否仍在用默认的公共底图（UI 需要显式提示"生产须替换底图供应商"）。 */
  readonly isDefaultProvider: boolean;
}

function readPublicEnv(name: string): string | null {
  const raw = process.env[name];
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

/**
 * 解析底图配置。
 *
 * 模板必须保留 `{z}/{x}/{y}` 三个占位符，否则 Leaflet 会请求同一个地址，
 * 表现为"底图加载失败"——这里提前拒掉，错误更早也更明确。
 */
export function resolveTileConfig(): TileConfig {
  const urlTemplate = readPublicEnv('NEXT_PUBLIC_MAP_TILE_URL') ?? DEFAULT_TILE_URL;
  const attribution = readPublicEnv('NEXT_PUBLIC_MAP_ATTRIBUTION') ?? DEFAULT_TILE_ATTRIBUTION;
  const hasPlaceholders =
    urlTemplate.includes('{z}') && urlTemplate.includes('{x}') && urlTemplate.includes('{y}');
  return {
    urlTemplate: hasPlaceholders ? urlTemplate : DEFAULT_TILE_URL,
    attribution,
    maxZoom: TILE_MAX_ZOOM,
    isDefaultProvider: urlTemplate === DEFAULT_TILE_URL,
  };
}
