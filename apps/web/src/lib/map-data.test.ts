import { afterEach, describe, expect, it, vi } from 'vitest';

// map-data.ts 不 import ./env（它依赖 node:crypto，不能进客户端 bundle），
// 所以这里可以直接静态 import，不需要先注入环境变量。
import {
  areaOnlyNote,
  accuracyLabel,
  canRenderMarker,
  hasUsableCoordinates,
  markerItems,
  markerPosition,
  markerPositions,
  requestMapSearch,
  requestPlacesInBBox,
  verificationLabel,
} from './map-data';

import type { MapPlaceItem } from './map-data';

afterEach(() => {
  vi.unstubAllGlobals();
});

const BBOX = { minLon: 118.7, minLat: 32.0, maxLon: 118.9, maxLat: 32.2 };

function item(overrides: Partial<MapPlaceItem> = {}): MapPlaceItem {
  return {
    slug: 'place-a',
    title: '示例地点',
    summary: null,
    type: 'PLACE',
    lon: 118.78,
    lat: 32.06,
    hasPoint: true,
    note: null,
    accuracy: 'EXACT',
    verificationStatus: 'VERIFIED',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * fetch 打桩。
 *
 * 显式声明参数签名，`fetchSpy.mock.calls[0]?.[0]` 才有类型（否则元组是空元组）。
 */
function stubFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>> {
  const spy = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** 请求 URL 断言辅助。 */
function requestedUrl(spy: ReturnType<typeof vi.fn>): string {
  const call = spy.mock.calls[0];
  return String(call?.[0]);
}

const PLACES_PAYLOAD = {
  data: {
    bbox: BBOX,
    center: { lon: 118.8, lat: 32.1 },
    total: 1,
    truncated: false,
    items: [item()],
  },
};

describe('requestPlacesInBBox', () => {
  it('baseUrl 为 null 时直接降级，不发起任何请求（绝不硬编码 localhost）', async () => {
    const fetchSpy = stubFetch(() => jsonResponse(PLACES_PAYLOAD));

    const result = await requestPlacesInBBox({ baseUrl: null, bbox: BBOX });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unconfigured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('bbox 按契约顺序进入查询串（逗号保持字面量，不编码成 %2C）', async () => {
    const fetchSpy = stubFetch(() => jsonResponse(PLACES_PAYLOAD));

    await requestPlacesInBBox({ baseUrl: 'https://api.example.com/', bbox: BBOX });

    expect(requestedUrl(fetchSpy)).toBe(
      'https://api.example.com/api/v1/places?bbox=118.7000,32.0000,118.9000,32.2000',
    );
  });

  it('type / q / limit 缺省时不写入查询串', async () => {
    const fetchSpy = stubFetch(() => jsonResponse(PLACES_PAYLOAD));

    await requestPlacesInBBox({ baseUrl: 'https://api.example.com', bbox: BBOX });

    const url = requestedUrl(fetchSpy);
    expect(url).not.toContain('type=');
    expect(url).not.toContain('q=');
    expect(url).not.toContain('limit=');
  });

  it('传入筛选条件时按 type → q → limit 追加', async () => {
    const fetchSpy = stubFetch(() => jsonResponse(PLACES_PAYLOAD));

    await requestPlacesInBBox({
      baseUrl: 'https://api.example.com',
      bbox: BBOX,
      type: 'PLACE',
      q: '秦淮',
      limit: 50,
    });

    const url = requestedUrl(fetchSpy);
    expect(url).toContain('type=PLACE');
    expect(url).toContain('limit=50');
    expect(url).toContain('q=%E7%A7%A6%E6%B7%AE');
  });

  it('空关键词不写入查询串（与列表页保持一致）', async () => {
    const fetchSpy = stubFetch(() => jsonResponse(PLACES_PAYLOAD));

    await requestPlacesInBBox({ baseUrl: 'https://api.example.com', bbox: BBOX, q: '' });

    expect(requestedUrl(fetchSpy)).not.toContain('q=');
  });

  it('成功时拆出 data 信封', async () => {
    stubFetch(() => jsonResponse(PLACES_PAYLOAD));

    const result = await requestPlacesInBBox({ baseUrl: 'https://api.example.com', bbox: BBOX });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.data.total).toBe(1);
    expect(result.ok === true && result.data.items[0]?.slug).toBe('place-a');
  });

  it('非法 bbox 的 400 → http_error，并保留 HTTP 状态码', async () => {
    stubFetch(() =>
      jsonResponse(
        { error: { code: 'INVALID_BBOX', message: '范围非法', requestId: 'req-1' } },
        400,
      ),
    );

    const result = await requestPlacesInBBox({ baseUrl: 'https://api.example.com', bbox: BBOX });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('http_error');
    expect(result.ok === false && result.status).toBe(400);
    expect(result.ok === false && result.requestId).toBe('req-1');
  });

  it('网络异常 → network，不向渲染层抛错', async () => {
    stubFetch(() => {
      throw new Error('ECONNREFUSED');
    });

    const result = await requestPlacesInBBox({ baseUrl: 'https://api.example.com', bbox: BBOX });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('network');
  });

  it('AbortError 也归入 network（由 LatestRequest 判定是否过期后丢弃）', async () => {
    stubFetch(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });

    const result = await requestPlacesInBBox({ baseUrl: 'https://api.example.com', bbox: BBOX });

    expect(result.ok === false && result.reason).toBe('network');
  });

  it('响应结构不符合契约 → invalid_payload', async () => {
    stubFetch(() => jsonResponse({ data: { bbox: BBOX, center: null, total: 'x' } }));

    const result = await requestPlacesInBBox({ baseUrl: 'https://api.example.com', bbox: BBOX });

    expect(result.ok === false && result.reason).toBe('invalid_payload');
  });

  it('响应体不是 JSON → invalid_payload', async () => {
    stubFetch(() => new Response('<html>502</html>', { status: 200 }));

    const result = await requestPlacesInBBox({ baseUrl: 'https://api.example.com', bbox: BBOX });

    expect(result.ok === false && result.reason).toBe('invalid_payload');
  });

  it('signal 被透传给 fetch', async () => {
    const fetchSpy = stubFetch(() => jsonResponse(PLACES_PAYLOAD));
    const controller = new AbortController();

    await requestPlacesInBBox({
      baseUrl: 'https://api.example.com',
      bbox: BBOX,
      signal: controller.signal,
    });

    expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});

describe('requestMapSearch', () => {
  it('baseUrl 为 null 时降级为 unconfigured', async () => {
    const fetchSpy = stubFetch(() => jsonResponse({}));

    const result = await requestMapSearch({ baseUrl: null, q: '秦淮' });

    expect(result.ok === false && result.reason).toBe('unconfigured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('解析搜索信封，含建议标签', async () => {
    stubFetch(() =>
      jsonResponse({
        data: {
          query: '秦淮',
          total: 1,
          backend: 'like',
          items: [
            {
              slug: 'qinhuai',
              type: 'PLACE',
              title: '秦淮',
              summary: null,
              matchedOn: 'title',
            },
          ],
          suggestions: ['建筑', '水系'],
        },
      }),
    );

    const result = await requestMapSearch({ baseUrl: 'https://api.example.com', q: '秦淮' });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.data.suggestions).toEqual(['建筑', '水系']);
  });

  it('关键词进入查询串', async () => {
    const fetchSpy = stubFetch(() =>
      jsonResponse({ data: { query: '', total: 0, backend: 'like', items: [], suggestions: [] } }),
    );

    await requestMapSearch({ baseUrl: 'https://api.example.com', q: '秦淮' });

    expect(requestedUrl(fetchSpy)).toContain('/api/v1/search?q=');
  });

  it('契约不符 → invalid_payload', async () => {
    stubFetch(() => jsonResponse({ data: { items: 'nope' } }));

    const result = await requestMapSearch({ baseUrl: 'https://api.example.com', q: 'x' });

    expect(result.ok === false && result.reason).toBe('invalid_payload');
  });
});

describe('marker 可绘制性（§9.2 末条 / AGENTS.md §3.5）', () => {
  it('精确且已核验 → 可绘制', () => {
    expect(canRenderMarker(item())).toBe(true);
    expect(markerPosition(item())).toEqual({ lon: 118.78, lat: 32.06 });
  });

  it('hasPoint=false → 不绘制（即使坐标存在）', () => {
    const target = item({ hasPoint: false });
    expect(canRenderMarker(target)).toBe(false);
    expect(markerPosition(target)).toBeNull();
  });

  it('AREA_ONLY / UNKNOWN → 不绘制', () => {
    expect(canRenderMarker(item({ accuracy: 'AREA_ONLY' }))).toBe(false);
    expect(canRenderMarker(item({ accuracy: 'UNKNOWN' }))).toBe(false);
  });

  it('APPROXIMATE 也不绘制 —— 未核验完成不给精确点（AGENTS.md §3.5）', () => {
    expect(canRenderMarker(item({ accuracy: 'APPROXIMATE', verificationStatus: 'VERIFIED' }))).toBe(
      false,
    );
  });

  it('EXACT 但未核验 → 不绘制', () => {
    for (const status of ['UNVERIFIED', 'PARTIAL', 'DISPUTED'] as const) {
      expect(canRenderMarker(item({ accuracy: 'EXACT', verificationStatus: status }))).toBe(false);
    }
  });

  it('精度未标明（null）按不绘制处理 —— 宁可少画，不猜坐标', () => {
    expect(canRenderMarker(item({ accuracy: null }))).toBe(false);
  });

  it('坐标缺失或非有限数 → 不绘制', () => {
    expect(hasUsableCoordinates(item({ lon: null, lat: 32 }))).toBe(false);
    expect(hasUsableCoordinates(item({ lon: Number.NaN, lat: 32 }))).toBe(false);
    expect(hasUsableCoordinates(item({ lon: 500, lat: 32 }))).toBe(false);
    expect(hasUsableCoordinates(item({ lon: 118, lat: 200 }))).toBe(false);
  });

  it('markerItems 过滤掉全部不可绘制项', () => {
    const items = [
      item({ slug: 'ok' }),
      item({ slug: 'area', hasPoint: false }),
      item({ slug: 'unknown', accuracy: 'UNKNOWN' }),
      item({ slug: 'nocoord', lon: null, lat: null }),
    ];
    expect(markerItems(items).map((entry) => entry.slug)).toEqual(['ok']);
  });

  it('markerPositions 只输出可绘制项的坐标', () => {
    const positions = markerPositions([
      item({ slug: 'ok', lon: 118.7, lat: 32.0 }),
      item({ slug: 'area', hasPoint: false }),
    ]);
    expect(Array.from(positions.entries())).toEqual([['ok', { lon: 118.7, lat: 32.0 }]]);
  });

  it('空列表时 markerPositions 为空（不产生任何默认点）', () => {
    expect(markerPositions([]).size).toBe(0);
  });
});

describe('区域说明与标签', () => {
  it('优先使用 API 提供的 note', () => {
    expect(areaOnlyNote(item({ hasPoint: false, note: '仅有区域级位置' }))).toBe('仅有区域级位置');
  });

  it('note 为空白串时按精度生成中性说明', () => {
    expect(areaOnlyNote(item({ note: '   ', accuracy: 'AREA_ONLY' }))).toContain('区域级');
    expect(areaOnlyNote(item({ note: null, accuracy: 'UNKNOWN' }))).toContain('核验');
  });

  it('精度未标明时给出兜底说明', () => {
    expect(areaOnlyNote(item({ note: null, accuracy: null }))).toContain('未标明');
  });

  it('精度与核验标签可读', () => {
    expect(accuracyLabel('EXACT')).toBe('精确点位');
    expect(accuracyLabel(null)).toBe('位置精度未标明');
    expect(verificationLabel('DISPUTED')).toBe('存在争议');
    expect(verificationLabel(null)).toBe('核验状态未标明');
  });
});
