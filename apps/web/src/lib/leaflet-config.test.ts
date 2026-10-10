import { describe, expect, it } from 'vitest';

import {
  INITIAL_ZOOM,
  LEAFLET_ZOOM_RANGE,
  MAX_TILE_ERRORS_BEFORE_FAILED,
  MIN_TILES_FOR_HEALTHY,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  latToTileY,
  lonToTileX,
  tileHealth,
} from './leaflet-config';

describe('底图配置', () => {
  it('瓦片 URL 含 {z}/{x}/{y} 占位符（Leaflet tileLayer 的标准模板）', () => {
    expect(OSM_TILE_URL).toContain('{z}');
    expect(OSM_TILE_URL).toContain('{x}');
    expect(OSM_TILE_URL).toContain('{y}');
  });

  it('归属信息可点击回 OSM —— 这是 OSM Tile 使用政策的硬性要求', () => {
    // 缺署名不是"不够友好"，是明确的许可违规。
    expect(OSM_ATTRIBUTION).toContain('openstreetmap.org');
    expect(OSM_ATTRIBUTION).toContain('<a ');
  });

  it('缩放上限不超过 OSM 瓦片的实际最高层级', () => {
    // OSM 标准瓦片只到 19 级；再高请求会 404，表现为大片空白。
    expect(LEAFLET_ZOOM_RANGE.max).toBe(19);
    expect(LEAFLET_ZOOM_RANGE.min).toBeLessThan(INITIAL_ZOOM);
  });
});

describe('底图健康判定（逐瓦片计数）', () => {
  it('尚无任何瓦片返回时是 loading，不能误判为失败', () => {
    expect(tileHealth(0, 0)).toBe('loading');
  });

  it('成功片数达标即 ready', () => {
    expect(tileHealth(MIN_TILES_FOR_HEALTHY, 0)).toBe('ready');
  });

  it('少量失败不判失败（单片抖动不该让整张图降级）', () => {
    expect(tileHealth(8, 2)).toBe('ready');
  });

  it('失败片数达阈值即 failed', () => {
    expect(tileHealth(0, MAX_TILE_ERRORS_BEFORE_FAILED)).toBe('failed');
    // 成功片很多也救不回来：失败够多说明瓦片源整体不通。
    expect(tileHealth(30, MAX_TILE_ERRORS_BEFORE_FAILED)).toBe('failed');
  });

  it('失败未达阈值时保持 loading，等后续事件推进', () => {
    expect(tileHealth(1, MAX_TILE_ERRORS_BEFORE_FAILED - 1)).toBe('loading');
  });
});

describe('瓦片坐标换算（Web 墨卡托）', () => {
  it('经度 0° 落在瓦片列的中点', () => {
    // lon=0 → (0+180)/360 * 2^z = 2^z / 2
    expect(lonToTileX(0, 1)).toBe(1);
  });

  it('经度 -180 是第 0 列，+180 是最后一列', () => {
    expect(lonToTileX(-180, 2)).toBe(0);
    expect(lonToTileX(180, 2)).toBe(4);
  });

  it('纬度 0° 落在瓦片行的中点', () => {
    expect(latToTileY(0, 1)).toBeCloseTo(1, 6);
  });

  it('纬度超出墨卡托范围时被夹住，不产生 NaN', () => {
    // ⚠️ 不夹的话 log(tan(π/2)) = log(Infinity) → NaN，地图直接空白。
    expect(Number.isNaN(latToTileY(90, 2))).toBe(false);
    expect(Number.isNaN(latToTileY(-90, 2))).toBe(false);
    expect(Number.isFinite(latToTileY(90, 2))).toBe(true);
  });

  it('南京主城经纬度落在合理的瓦片范围内（不是 0 也不是 NaN）', () => {
    // (118.7969+180)/360 * 2^12 = 3399.64；lat 32.0603 对应约 1663。
    const x = lonToTileX(118.7969, 12);
    const y = latToTileY(32.0603, 12);
    expect(x).toBeGreaterThan(3395);
    expect(x).toBeLessThan(3405);
    expect(y).toBeGreaterThan(1655);
    expect(y).toBeLessThan(1670);
  });
});
