/**
 * 高德数据能力（ADR-0003）。
 *
 * ## 职责边界
 *
 * 改造后高德**只提供数据**，不参与渲染：
 *   - 地理编码：地址文本 → 坐标（本文件）
 *   - POI 检索：可选，后续按需扩展
 *
 * 渲染由 Leaflet 负责（`components/map/MapCanvas.tsx`）。
 *
 * ## 为什么这里必须转换坐标
 *
 * 高德返回 **GCJ-02**，而本项目权威坐标是 **WGS-84**（数据库、R\*Tree 索引、
 * 来源标注、JSON-LD 全部用它）。直接落库会让点位系统性偏移约 300 米。
 * 因此写回业务层前一律 `gcj02ToWgs84`（`lib/map-coords.ts`）。
 *
 * ## 为什么是可选能力
 *
 * 地理编码是高德 Key 才能用的。缺 Key 时**地图与列表照常工作**，
 * 只是"输入地址查地点"不可用 —— 不能因为一个增强功能缺失就让整块地图降级。
 */

import { resolveAmapConfig } from './amap-config';
import { loadAmap } from './amap-loader';
import { gcj02ToWgs84, isValidLngLat } from './map-coords';

import type { AMapPoi } from './amap-sdk';
import type { LonLat } from './map-geo';

export type GeocodeFailure = 'unavailable' | 'not_found' | 'invalid';

export type GeocodeResult =
  | { readonly ok: true; readonly point: LonLat; readonly address: string | null }
  | { readonly ok: false; readonly reason: GeocodeFailure; readonly message: string };

function readLocation(location: unknown): LonLat | null {
  if (typeof location !== 'object' || location === null) return null;
  const rec = location as { lng?: unknown; lat?: unknown };
  const candidate = { lon: rec.lng, lat: rec.lat };
  return isValidLngLat(candidate) ? candidate : null;
}

const AMAP_FAILURE_MESSAGES: Readonly<Record<GeocodeFailure, string>> = {
  unavailable: '地址检索需要配置高德地图 Key，当前不可用。',
  not_found: '未找到匹配的地址，请换个说法再试。',
  invalid: '高德返回了无法解析的坐标。',
};

/**
 * 地址 → WGS-84 坐标。
 *
 * @param address 地址文本（用户输入）
 * @param city    限定城市，避免"南京"外的同名地点被误选
 */
export async function geocodeAddress(
  address: string,
  city: string,
): Promise<GeocodeResult> {
  const trimmed = address.trim();
  if (trimmed === '') {
    return { ok: false, reason: 'not_found', message: AMAP_FAILURE_MESSAGES.not_found };
  }

  const config = resolveAmapConfig();
  if (!config.ok) {
    return { ok: false, reason: 'unavailable', message: AMAP_FAILURE_MESSAGES.unavailable };
  }

  let AMap: Awaited<ReturnType<typeof loadAmap>>;
  try {
    AMap = await loadAmap(config);
  } catch {
    return { ok: false, reason: 'unavailable', message: AMAP_FAILURE_MESSAGES.unavailable };
  }

  const geo = new AMap.Geocoder();
  const results: readonly AMapPoi[] = await new Promise((resolve) => {
    geo.search(
      trimmed,
      { city },
      (status: string, result: { pois?: readonly AMapPoi[] | undefined } | undefined) => {
        // 高德用 status 字符串而非异常表示失败；只有 complete 才有意义的结果。
        if (status !== 'complete') {
          resolve([]);
          return;
        }
        resolve(result?.pois ?? []);
      },
    );
  });

  for (const poi of results) {
    const raw = readLocation(poi.location);
    if (raw === null) continue;
    // GCJ-02 → WGS-84：这一行不能删，删了所有检索结果会偏约 300 米且不报错。
    const point = gcj02ToWgs84(raw);
    const addressText = typeof poi.address === 'string' && poi.address !== '' ? poi.address : null;
    return { ok: true, point, address: addressText };
  }

  return { ok: false, reason: 'not_found', message: AMAP_FAILURE_MESSAGES.not_found };
}