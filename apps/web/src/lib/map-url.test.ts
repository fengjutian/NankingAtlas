import { describe, expect, it } from 'vitest';

import { DEFAULT_MAP_BBOX } from './map-geo';
import {
  DEFAULT_MAP_QUERY,
  MAP_QUERY_MAX_LENGTH,
  MAP_TYPES,
  allowedMapTypes,
  clearMapQuery,
  firstMapParam,
  isUsableBBox,
  parseMapQuery,
  resolveInitialBBox,
  serializeMapQuery,
  setMapKeyword,
  setMapSelection,
  toggleMapType,
  withMapQuery,
} from './map-url';

import type { MapQuery } from './map-url';

const FULL: MapQuery = {
  type: 'PLACE',
  q: '秦淮',
  selected: 'qinhuai-river',
  bbox: '118.7000,32.0000,118.9000,32.2000',
};

describe('/map URL 状态往返一致性', () => {
  it('parse(serialize(query)) === query（含全部字段）', () => {
    const serialized = serializeMapQuery(FULL);
    const record: Record<string, string> = {};
    new URLSearchParams(serialized).forEach((value, key) => {
      record[key] = value;
    });
    expect(parseMapQuery(record)).toEqual(FULL);
  });

  it('默认值序列化为空串（地址栏保持干净）', () => {
    expect(serializeMapQuery(DEFAULT_MAP_QUERY)).toBe('');
  });

  it('默认值往返一致', () => {
    expect(parseMapQuery({})).toEqual(DEFAULT_MAP_QUERY);
  });

  it('省略默认值：只保留有值的键', () => {
    const serialized = serializeMapQuery({ ...FULL, selected: null, bbox: null });
    expect(serialized).toBe('type=PLACE&q=%E7%A7%A6%E6%B7%AE');
  });

  it('序列化顺序稳定（type → q → selected → bbox）', () => {
    const keys = Array.from(new URLSearchParams(serializeMapQuery(FULL)).keys());
    expect(keys).toEqual(['type', 'q', 'selected', 'bbox']);
  });
});

describe('parseMapQuery 的容错（坏链接不能让页面 500）', () => {
  it('未知 type 回落为 null', () => {
    expect(parseMapQuery({ type: 'PERSON' }).type).toBeNull();
    expect(parseMapQuery({ type: 'NOT_A_TYPE' }).type).toBeNull();
  });

  it('接受契约内的 PLACE', () => {
    expect(parseMapQuery({ type: 'PLACE' }).type).toBe('PLACE');
  });

  it('数组形态的 searchParams 取第一个值', () => {
    expect(parseMapQuery({ q: ['甲', '乙'] }).q).toBe('甲');
    expect(parseMapQuery({ type: ['PLACE'] }).type).toBe('PLACE');
  });

  it('关键词去空白并截断到 100 字符', () => {
    expect(parseMapQuery({ q: '  秦淮  ' }).q).toBe('秦淮');
    expect(parseMapQuery({ q: 'a'.repeat(300) }).q).toHaveLength(100);
    expect(MAP_QUERY_MAX_LENGTH).toBe(100);
  });

  it('空白 selected 视为未选中', () => {
    expect(parseMapQuery({ selected: '   ' }).selected).toBeNull();
    expect(parseMapQuery({ selected: 'abc' }).selected).toBe('abc');
  });

  it('非法 bbox 被丢弃为 null，绝不原样回填进请求', () => {
    expect(parseMapQuery({ bbox: '118.9,32.0,118.7,32.2' }).bbox).toBeNull();
    expect(parseMapQuery({ bbox: 'not-a-bbox' }).bbox).toBeNull();
    expect(parseMapQuery({ bbox: '0,0,90,90' }).bbox).toBeNull();
  });

  it('合法 bbox 被规范化后保留', () => {
    expect(parseMapQuery({ bbox: '118.7,32.0,118.9,32.2' }).bbox).toBe(
      '118.7000,32.0000,118.9000,32.2000',
    );
  });
});

describe('resolveInitialBBox', () => {
  it('未提供 bbox 时用默认视窗', () => {
    expect(resolveInitialBBox(null)).toEqual({ bbox: DEFAULT_MAP_BBOX, errorCode: null });
    expect(resolveInitialBBox('')).toEqual({ bbox: DEFAULT_MAP_BBOX, errorCode: null });
  });

  it('合法 bbox 覆盖默认值且无错误', () => {
    expect(resolveInitialBBox('118.75,32.05,118.85,32.15')).toEqual({
      bbox: { minLon: 118.75, minLat: 32.05, maxLon: 118.85, maxLat: 32.15 },
      errorCode: null,
    });
  });

  it('非法 bbox 回落默认窗口但保留错误码（页面据此提示，而不是白屏）', () => {
    expect(resolveInitialBBox('118.9,32.0,118.7,32.2')).toEqual({
      bbox: DEFAULT_MAP_BBOX,
      errorCode: 'reversed',
    });
    expect(resolveInitialBBox('abc')).toEqual({ bbox: DEFAULT_MAP_BBOX, errorCode: 'malformed' });
  });

  it('isUsableBBox 与 validateBBox 同源', () => {
    expect(isUsableBBox(DEFAULT_MAP_BBOX)).toBe(true);
    expect(isUsableBBox({ minLon: 5, minLat: 5, maxLon: 1, maxLat: 1 })).toBe(false);
  });
});

describe('筛选状态变换', () => {
  it('toggleMapType 可来回切换', () => {
    const once = toggleMapType(DEFAULT_MAP_QUERY, 'PLACE');
    expect(once.type).toBe('PLACE');
    expect(toggleMapType(once, 'PLACE').type).toBeNull();
  });

  it('setMapKeyword 去空白并截断', () => {
    expect(setMapKeyword(DEFAULT_MAP_QUERY, '  秦淮  ').q).toBe('秦淮');
    expect(setMapKeyword(DEFAULT_MAP_QUERY, 'x'.repeat(200)).q).toHaveLength(100);
  });

  it('setMapSelection 对空白值归零', () => {
    expect(setMapSelection(DEFAULT_MAP_QUERY, 'abc').selected).toBe('abc');
    expect(setMapSelection(DEFAULT_MAP_QUERY, '  ').selected).toBeNull();
  });

  it('clearMapQuery 回到默认值', () => {
    expect(clearMapQuery()).toEqual(DEFAULT_MAP_QUERY);
  });

  it('withMapQuery 无参数时返回裸路径', () => {
    expect(withMapQuery('/map', DEFAULT_MAP_QUERY)).toBe('/map');
    expect(withMapQuery('/map', FULL)).toContain('/map?');
  });
});

describe('firstMapParam（读取原始参数，供错误码回传）', () => {
  it('取字符串与数组的第一个值', () => {
    expect(firstMapParam('118.7,32.0,118.9,32.2')).toBe('118.7,32.0,118.9,32.2');
    expect(firstMapParam(['a', 'b'])).toBe('a');
    expect(firstMapParam(undefined)).toBeNull();
  });

  it('非法 bbox 仍能被读到原始值，错误码因此不会在解析层丢失', () => {
    // parseMapQuery 会把坏值归一化成 null；页面必须另走 firstMapParam 才能拿到错误码。
    const params: Record<string, string> = { bbox: '118.9,32.0,118.7,32.2' };
    expect(parseMapQuery(params).bbox).toBeNull();
    expect(resolveInitialBBox(firstMapParam(params.bbox)).errorCode).toBe('reversed');
  });
});

describe('地图类型白名单', () => {
  it('地图只画地点类型', () => {
    expect(MAP_TYPES).toEqual(['PLACE']);
    expect(allowedMapTypes()).toEqual(['PLACE']);
  });
});
