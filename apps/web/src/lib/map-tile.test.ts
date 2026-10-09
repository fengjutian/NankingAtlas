import { describe, expect, it } from 'vitest';

import { DEFAULT_TILE_ATTRIBUTION, DEFAULT_TILE_URL, resolveTileConfig } from './map-tile';

describe('底图配置', () => {
  it('未配置时回落到公共 OSM 底图并标记为默认供应商', () => {
    const config = resolveTileConfig();
    expect(config.urlTemplate).toBe(DEFAULT_TILE_URL);
    expect(config.attribution).toBe(DEFAULT_TILE_ATTRIBUTION);
    expect(config.isDefaultProvider).toBe(true);
  });

  it('OSM 条款要求的 attribution 已包含（版权与署名不可省）', () => {
    expect(resolveTileConfig().attribution).toContain('OpenStreetMap');
    expect(resolveTileConfig().attribution).toContain('copyright');
  });

  it('默认模板保留 {z}/{x}/{y} 三个占位符', () => {
    const { urlTemplate } = resolveTileConfig();
    expect(urlTemplate).toContain('{z}');
    expect(urlTemplate).toContain('{x}');
    expect(urlTemplate).toContain('{y}');
  });

  it('缩放上限固定，避免与底图服务能力脱节', () => {
    expect(resolveTileConfig().maxZoom).toBe(19);
  });
});
