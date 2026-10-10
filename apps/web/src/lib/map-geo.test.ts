import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAP_BBOX,
  MAX_BBOX_SPAN_DEG,
  bboxCenter,
  bboxFromBounds,
  bboxErrorMessage,
  bboxSignature,
  formatBBox,
  padBBox,
  parseAndValidateBBox,
  parseBBox,
  validateBBox,
} from './map-geo';

import type { MapBBox } from './map-geo';

const VALID: MapBBox = { minLon: 118.7, minLat: 32.0, maxLon: 118.9, maxLat: 32.2 };

describe('bbox 解析与序列化（地图移动 → 请求参数）', () => {
  it('按契约顺序解析 minLon,minLat,maxLon,maxLat', () => {
    expect(parseBBox('118.7,32.0,118.9,32.2')).toEqual(VALID);
  });

  it('容忍空白', () => {
    expect(parseBBox('  118.7 , 32.0 ,118.9, 32.2 ')).toEqual(VALID);
  });

  it('支持负数与指数写法', () => {
    expect(parseBBox('-73.9857,40.7484,-73.9850,40.7580')).toEqual({
      minLon: -73.9857,
      minLat: 40.7484,
      maxLon: -73.985,
      maxLat: 40.758,
    });
    expect(parseBBox('1.187e2,3.2e1,1.189e2,3.22e1')).toEqual({
      minLon: 118.7,
      minLat: 32,
      maxLon: 118.9,
      maxLat: 32.2,
    });
  });

  it('序列化固定小数位，避免浮点尾数抖动打出不同 URL', () => {
    expect(formatBBox(VALID)).toBe('118.7000,32.0000,118.9000,32.2000');
    expect(formatBBox({ minLon: 0.1 + 0.2, minLat: 1, maxLon: 2, maxLat: 3 })).toBe(
      '0.3000,1.0000,2.0000,3.0000',
    );
  });

  it('parse → format → parse 往返一致', () => {
    const parsed = parseBBox(formatBBox(VALID));
    if (parsed === null) throw new Error('合法的 bbox 序列化后不应解析失败');
    expect(parseBBox(formatBBox(parsed))).toEqual(VALID);
  });

  it('拒绝非数字片段', () => {
    expect(parseBBox('a,32,118.9,32.2')).toBeNull();
    expect(parseBBox('118.7,32,118.9,NaN')).toBeNull();
    expect(parseBBox('118.7,32,118.9,Infinity')).toBeNull();
  });

  it('拒绝字段数不对、空串与缺项', () => {
    expect(parseBBox('')).toBeNull();
    expect(parseBBox('   ')).toBeNull();
    expect(parseBBox('118.7,32.0,118.9')).toBeNull();
    expect(parseBBox('118.7,32.0,118.9,32.2,1')).toBeNull();
    expect(parseBBox('118.7,,118.9,32.2')).toBeNull();
  });
});

describe('validateBBox 的判定顺序与分类', () => {
  it('接受合法窗口', () => {
    expect(validateBBox(VALID)).toEqual({ ok: true, bbox: VALID });
  });

  it('malformed 优先于其它判定（非数字先被拦下）', () => {
    expect(validateBBox({ minLon: 'x', minLat: 32, maxLon: 200, maxLat: 32.2 })).toEqual({
      ok: false,
      code: 'malformed',
    });
    expect(validateBBox({ minLon: Number.NaN, minLat: 32, maxLon: 118.9, maxLat: 32.2 })).toEqual({
      ok: false,
      code: 'malformed',
    });
  });

  it('out_of_range 在 reversed 之前（越界先报）', () => {
    expect(validateBBox({ minLon: -200, minLat: 32, maxLon: -201, maxLat: 32.2 })).toEqual({
      ok: false,
      code: 'out_of_range',
    });
    expect(validateBBox({ minLon: 0, minLat: 95, maxLon: 1, maxLat: 96 })).toEqual({
      ok: false,
      code: 'out_of_range',
    });
  });

  it('反向窗口判定为 reversed', () => {
    expect(validateBBox({ minLon: 118.9, minLat: 32.0, maxLon: 118.7, maxLat: 32.2 }).ok).toBe(
      false,
    );
    expect(validateBBox({ minLon: 118.7, minLat: 32.2, maxLon: 118.9, maxLat: 32.0 }).ok).toBe(
      false,
    );
    const result = validateBBox({ minLon: 118.9, minLat: 32.0, maxLon: 118.7, maxLat: 32.2 });
    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.code : null).toBe('reversed');
  });

  it('跨度相等（零面积）也算非法，避免退化窗口打出无意义请求', () => {
    expect(validateBBox({ minLon: 118.7, minLat: 32.0, maxLon: 118.7, maxLat: 32.2 }).ok).toBe(
      false,
    );
  });

  it('跨度过大判定为 too_large', () => {
    const result = validateBBox({
      minLon: 0,
      minLat: 0,
      maxLon: MAX_BBOX_SPAN_DEG + 0.1,
      maxLat: 1,
    });
    expect(result.ok === false ? result.code : null).toBe('too_large');
  });

  it('非对象输入返回 malformed', () => {
    expect(validateBBox(null)).toEqual({ ok: false, code: 'malformed' });
    expect(validateBBox('118.7,32,118.9,32.2')).toEqual({ ok: false, code: 'malformed' });
  });

  it('parseAndValidateBBox 组合了解析与校验的判定顺序', () => {
    expect(parseAndValidateBBox('118.9,32.0,118.7,32.2')).toEqual({
      ok: false,
      code: 'reversed',
    });
    expect(parseAndValidateBBox('118.7,32.0,118.9,32.2').ok).toBe(true);
  });

  it('每种错误码都有可执行的中文提示，且互不相同', () => {
    const codes = ['malformed', 'reversed', 'out_of_range', 'too_large'] as const;
    const messages = new Set(codes.map(bboxErrorMessage));
    expect(messages.size).toBe(4);
    expect(bboxErrorMessage('too_large')).toContain('缩小');
  });
});

describe('视口换算', () => {
  it('SDK 边界 → bbox（处理 south/north 顺序颠倒）', () => {
    expect(bboxFromBounds({ west: 118.7, south: 32.2, east: 118.9, north: 32.0 })).toEqual(VALID);
  });

  it('bbox 中心点（结果四舍五入到 6 位，避免浮点尾数打到 URL 上）', () => {
    expect(bboxCenter(VALID)).toEqual({ lon: 118.8, lat: 32.1 });
  });

  it('bbox 签名可用于"视口没动就不重复请求"', () => {
    expect(bboxSignature(VALID)).toBe(bboxSignature({ ...VALID }));
    expect(bboxSignature(VALID)).not.toBe(bboxSignature({ ...VALID, maxLat: 32.3 }));
  });

  it('padBBox 按比例外扩，仍是合法 bbox', () => {
    const padded = padBBox(VALID, 0.25);
    expect(padded.minLon).toBeLessThan(VALID.minLon);
    expect(padded.maxLat).toBeGreaterThan(VALID.maxLat);
    expect(validateBBox(padded).ok).toBe(true);
  });

  it('默认视窗自身是合法 bbox（build/首屏请求不会先天非法）', () => {
    expect(validateBBox(DEFAULT_MAP_BBOX).ok).toBe(true);
  });
});
