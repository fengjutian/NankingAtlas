import { describe, expect, it } from 'vitest';

import { gcj02ToWgs84, isValidLngLat, wgs84ToGcj02 } from './map-coords';

/**
 * 坐标系转换单测（WGS-84 ↔ GCJ-02）。
 *
 * 这一层错了不会抛异常，只会让地图上的 marker **静默偏移几百米** ——
 * 用户按导航会走错路。所以必须用**已发表的对照样例**锁死，而不能只做
 * 往返一致性检查：两个坐标系"错得一样"时往返依然成立。
 */
describe('map coordinate transform', () => {
  /**
   * 对照样例 1：coordtransform（wandergis）README 里作者自己给出的
   * `wgs84togcj02(116.404, 39.915)` 期望值。
   *
   * 这不是我们自造的常量，是该库沿用十余年的公开测试向量。
   */
  const ANCHOR_WGS = { lon: 116.404, lat: 39.915 };
  const ANCHOR_GCJ = { lon: 116.410244, lat: 39.916404 };

  it('WGS-84 → GCJ-02 reproduces the published coordtransform sample', () => {
    const result = wgs84ToGcj02(ANCHOR_WGS);
    expect(result.lon).toBeCloseTo(ANCHOR_GCJ.lon, 6);
    expect(result.lat).toBeCloseTo(ANCHOR_GCJ.lat, 6);
  });

  it('GCJ-02 → WGS-84 inverts the forward transform', () => {
    const result = gcj02ToWgs84(ANCHOR_GCJ);
    expect(result.lon).toBeCloseTo(ANCHOR_WGS.lon, 6);
    expect(result.lat).toBeCloseTo(ANCHOR_WGS.lat, 6);
  });

  it('round-trips every sampled city within sub-meter tolerance', () => {
    for (const point of [
      { lon: 118.78, lat: 32.06 }, // 南京
      { lon: 121.47, lat: 31.23 }, // 上海
      { lon: 113.26, lat: 23.13 }, // 广州
      { lon: 87.62, lat: 43.82 }, // 乌鲁木齐
      { lon: 116.404, lat: 39.915 },
    ]) {
      const back = gcj02ToWgs84(wgs84ToGcj02(point));
      // 1e-6 度 ≈ 0.1 米
      expect(back.lon).toBeCloseTo(point.lon, 6);
      expect(back.lat).toBeCloseTo(point.lat, 6);
    }
  });

  it('shifts by the documented 100-500m range inside China', () => {
    // 国标 GB 20263—2006 的典型偏移量是 300~500m；南京一带约 300m。
    // 这里只锁"量级对"：偏移太小说明没转换，偏移到度级说明投影补偿写错。
    for (const point of [
      { lon: 118.78, lat: 32.06 }, // 南京
      { lon: 116.404, lat: 39.915 },
      { lon: 121.47, lat: 31.23 }, // 上海
    ]) {
      const after = wgs84ToGcj02(point);
      const dLng = Math.abs(after.lon - point.lon);
      const dLat = Math.abs(after.lat - point.lat);
      expect(dLng).toBeGreaterThan(0.001);
      expect(dLng).toBeLessThan(0.01);
      expect(dLat).toBeGreaterThan(0.0005);
      expect(dLat).toBeLessThan(0.01);
    }
  });

  it('does not transform coordinates outside China', () => {
    // 东京
    const tokyo = { lon: 139.6917, lat: 35.6895 };
    expect(wgs84ToGcj02(tokyo)).toEqual(tokyo);
    expect(gcj02ToWgs84(tokyo)).toEqual(tokyo);
    // 伦敦
    const london = { lon: -0.1276, lat: 51.5072 };
    expect(wgs84ToGcj02(london)).toEqual(london);
    // 边界外：框外的西侧与东侧
    expect(wgs84ToGcj02({ lon: 70, lat: 32 })).toEqual({ lon: 70, lat: 32 });
    expect(wgs84ToGcj02({ lon: 140, lat: 32 })).toEqual({ lon: 140, lat: 32 });
  });

  it('【已知局限】台北会被转换，尽管 GCJ-02 规范并未覆盖台湾', () => {
    // 这是"矩形边界法"的固有缺陷，不是本实现的 bug：所有公开实现
    // （含 wandergis/coordtransform）都用同一个矩形框，框内一律转换。
    // 规范说台湾仍用 WGS-84，而矩形框无法只框大陆 —— 要正确处理就得
    // 硬编码一条海岸线，超出"照抄公开算法"的范畴，且本项目只做南京一城
    // （118.78E, 32.06N），永远碰不到这里。
    //
    // 之所以把这条钉成测试：它现在是**已知且被承认**的行为。
    // 将来若真要支持台湾数据，必须先改实现再改这条断言，不能悄悄改期望值。
    const taipei = { lon: 121.5654, lat: 25.033 };
    const converted = wgs84ToGcj02(taipei);
    expect(converted.lon).not.toBe(taipei.lon);
  });

  it('is deterministic', () => {
    const point = { lon: 118.78, lat: 32.06 };
    expect(wgs84ToGcj02(point)).toEqual(wgs84ToGcj02(point));
  });

  it('handles the edges of the China bounding box', () => {
    // 框内最西侧（新疆喀什一带）应转换
    const kashgar = { lon: 75.99, lat: 39.47 };
    expect(wgs84ToGcj02(kashgar).lon).not.toBe(kashgar.lon);
    // 框外一律不转换
    expect(wgs84ToGcj02({ lon: 73, lat: 4.5 })).toEqual({ lon: 73, lat: 4.5 });
    expect(wgs84ToGcj02({ lon: 140, lat: 32 })).toEqual({ lon: 140, lat: 32 });
  });
});

describe('isValidLngLat', () => {
  it('accepts valid points', () => {
    expect(isValidLngLat({ lon: 118.78, lat: 32.06 })).toBe(true);
    expect(isValidLngLat({ lon: -180, lat: -90 })).toBe(true);
    expect(isValidLngLat({ lon: 180, lat: 90 })).toBe(true);
  });

  it('rejects out-of-range coordinates', () => {
    expect(isValidLngLat({ lon: 181, lat: 32 })).toBe(false);
    expect(isValidLngLat({ lon: 118, lat: 91 })).toBe(false);
  });

  it('rejects non-finite and wrong types', () => {
    expect(isValidLngLat({ lon: Number.NaN, lat: 32 })).toBe(false);
    expect(isValidLngLat({ lon: Number.POSITIVE_INFINITY, lat: 32 })).toBe(false);
    expect(isValidLngLat({ lon: '118.78', lat: 32 })).toBe(false);
    expect(isValidLngLat({ lon: 118.78 })).toBe(false);
    expect(isValidLngLat(null)).toBe(false);
    expect(isValidLngLat('118.78,32.06')).toBe(false);
  });
});
