import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from './api';

/**
 * `api.ts` 在模块加载时读取 `env`（fail-fast 校验），因此这里按 env 值动态载入，
 * 用与 `env.test.ts` 相同的 stubEnv 约定，而不是直接静态 import。
 */
async function loadApi(apiBaseUrl: string | null): Promise<typeof ApiModule> {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'test');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  if (apiBaseUrl === null) {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
  } else {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', apiBaseUrl);
  }
  return import('./api');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('buildApiUrl', () => {
  it('prefixes /api/v1 and serialises the query', async () => {
    const { buildApiUrl } = await loadApi('http://localhost:4000');
    expect(buildApiUrl('/contents', { type: 'PLACE', limit: 20 })).toBe(
      'http://localhost:4000/api/v1/contents?type=PLACE&limit=20',
    );
  });

  it('normalises a missing leading slash and a trailing slash on the base URL', async () => {
    const { buildApiUrl } = await loadApi('http://localhost:4000/');
    expect(buildApiUrl('contents', {})).toBe('http://localhost:4000/api/v1/contents');
  });

  it('returns null when the base URL is not configured', async () => {
    const { buildApiUrl } = await loadApi(null);
    expect(buildApiUrl('/contents')).toBeNull();
  });

  it('omits an empty keyword and absent filters', async () => {
    const { buildApiUrl } = await loadApi('https://api.example.invalid');
    expect(buildApiUrl('/contents', { q: '' })).toBe('https://api.example.invalid/api/v1/contents');
  });

  it('percent-encodes a slug so it cannot break out of the path segment', async () => {
    const { encodeSlug } = await loadApi('http://localhost:4000');
    expect(encodeSlug('a b?c')).toBe('a%20b%3Fc');
    expect(encodeSlug('a-slug')).toBe('a-slug');
  });
});

describe('失败映射', () => {
  it('maps 404 / 401 / 403 / 5xx to distinct reasons', async () => {
    const { reasonForStatus } = await loadApi('http://localhost:4000');
    expect(reasonForStatus(404)).toBe('not_found');
    expect(reasonForStatus(401)).toBe('forbidden');
    expect(reasonForStatus(403)).toBe('forbidden');
    expect(reasonForStatus(500)).toBe('http_error');
    expect(reasonForStatus(418)).toBe('http_error');
  });

  it('exposes a message for every failure reason', async () => {
    const { failureMessage } = await loadApi('http://localhost:4000');
    for (const reason of [
      'unconfigured',
      'network',
      'not_found',
      'forbidden',
      'http_error',
      'invalid_payload',
    ] as const) {
      expect(failureMessage(reason)).not.toBe('');
    }
  });

  it('degrades to "unconfigured" without issuing a request when the base URL is missing', async () => {
    const api = await loadApi(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await api.listPublishedContents();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unconfigured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a 404 envelope to not_found and keeps the requestId', async () => {
    const api = await loadApi('http://localhost:4000');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        jsonResponse(
          { error: { code: 'CONTENT_NOT_FOUND', message: 'x', requestId: 'req-1' } },
          404,
        ),
      ),
    );
    const result = await api.getPublishedContentBySlug('missing');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not_found');
      expect(result.requestId).toBe('req-1');
    }
  });

  it('maps a network failure to the network reason instead of throwing', async () => {
    const api = await loadApi('http://localhost:4000');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const result = await api.getPublishedContentBySlug('any');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('network');
  });

  it('rejects a payload that violates the public contract', async () => {
    const api = await loadApi('http://localhost:4000');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ data: [{ id: 1 }] })),
    );
    const result = await api.getPublishedContentBySlug('x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_payload');
  });

  it('unwraps the data envelope of the public list', async () => {
    const api = await loadApi('http://localhost:4000');
    const row = {
      id: 'c1',
      type: 'PLACE',
      slug: 'a-slug',
      title: '标题',
      subtitle: null,
      summary: null,
      body: { type: 'doc', content: [] },
      language: 'ZH',
      publishedAt: '2026-10-09T00:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ data: [row] })),
    );
    const result = await api.listPublishedContents({ limit: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.slug).toBe('a-slug');
    }
  });

  it('extracts only whitelisted place extension fields', async () => {
    const api = await loadApi('http://localhost:4000');
    const row = {
      id: 'c1',
      type: 'PLACE',
      slug: 'a-slug',
      title: '标题',
      subtitle: null,
      summary: null,
      body: { type: 'doc', content: [] },
      language: 'ZH',
      publishedAt: null,
      address: '某路 1 号',
      lon: 118.78,
      lat: 32.06,
      accuracy: 'APPROXIMATE',
      verificationStatus: 'PARTIAL',
      internalNote: '不得外泄',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ data: row })),
    );
    const result = await api.getPlaceBySlug('a-slug');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.accuracy).toBe('APPROXIMATE');
      expect('internalNote' in result.data).toBe(false);
    }
  });

  it('rejects the whole payload when a coordinate violates the contract type', async () => {
    const api = await loadApi('http://localhost:4000');
    const row = {
      id: 'c1',
      type: 'PLACE',
      slug: 'a-slug',
      title: '标题',
      subtitle: null,
      summary: null,
      body: { type: 'doc', content: [] },
      language: 'ZH',
      publishedAt: null,
      lon: '118.78',
      accuracy: 'SUPER_EXACT',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ data: row })),
    );
    const result = await api.getPlaceBySlug('a-slug');
    // 契约违例不做"猜测式"降级：整条载荷判为无效，避免字符串坐标进入展示路径。
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_payload');
  });
});

describe('筛选 / 分页的 URL 序列化', () => {
  it('falls back to defaults for missing parameters', async () => {
    const { parseListQuery } = await loadApi(null);
    expect(parseListQuery({})).toEqual({ type: null, q: '', page: 1, pageSize: 20 });
  });

  it('rejects a type outside the allowed set', async () => {
    const { parseListQuery } = await loadApi(null);
    expect(parseListQuery({ type: 'ROUTE' }, ['PLACE']).type).toBeNull();
    expect(parseListQuery({ type: 'PLACE' }, ['PLACE']).type).toBe('PLACE');
  });

  it('trims and truncates the keyword', async () => {
    const { parseListQuery, MAX_QUERY_LENGTH } = await loadApi(null);
    expect(parseListQuery({ q: '  老门东  ' }).q).toBe('老门东');
    expect(parseListQuery({ q: 'x'.repeat(500) }).q).toHaveLength(MAX_QUERY_LENGTH);
  });

  it('reads the first value when searchParams repeat a key', async () => {
    const { parseListQuery } = await loadApi(null);
    expect(parseListQuery({ type: ['PLACE', 'TOPIC'] }, ['PLACE', 'TOPIC']).type).toBe('PLACE');
  });

  it('rejects non-positive and malformed numbers', async () => {
    const { parseListQuery } = await loadApi(null);
    expect(parseListQuery({ page: '0' }).page).toBe(1);
    expect(parseListQuery({ page: 'abc' }).page).toBe(1);
    expect(parseListQuery({ pageSize: '33' }).pageSize).toBe(20);
    expect(parseListQuery({ pageSize: '50' }).pageSize).toBe(50);
  });

  it('omits defaults when serialising and keeps a stable key order', async () => {
    const { serializeListQuery } = await loadApi(null);
    expect(serializeListQuery({ type: null, q: '', page: 1, pageSize: 20 })).toBe('');
    expect(serializeListQuery({ type: 'PLACE', q: '城墙', page: 3, pageSize: 50 })).toBe(
      'type=PLACE&q=%E5%9F%8E%E5%A2%99&page=3&pageSize=50',
    );
  });

  it('round-trips every serialised query', async () => {
    const api = await loadApi(null);
    const samples = [
      { type: null, q: '', page: 1, pageSize: 20 },
      { type: 'PERSON' as const, q: '张三', page: 2, pageSize: 10 },
      { type: 'TOPIC' as const, q: '', page: 7, pageSize: 50 },
    ];
    for (const sample of samples) {
      const serialized = api.serializeListQuery(sample);
      expect(api.parseListQuery(api.parseQueryStringToRecord(serialized))).toEqual(sample);
    }
  });

  it('builds a shareable path', async () => {
    const { withListQuery, serializeListQuery } = await loadApi(null);
    expect(withListQuery('/chronicle', { type: null, q: '', page: 1, pageSize: 20 })).toBe(
      '/chronicle',
    );
    expect(withListQuery('/living', { type: 'PLACE', q: '', page: 1, pageSize: 20 })).toBe(
      `/living?${serializeListQuery({ type: 'PLACE', q: '', page: 1, pageSize: 20 })}`,
    );
  });

  it('resets the page when the type facet or keyword changes', async () => {
    const { setKeyword, setPageSize, setPage, toggleType } = await loadApi(null);
    const current = { type: null, q: '', page: 4, pageSize: 20 } as const;
    expect(toggleType(current, 'PLACE').page).toBe(1);
    expect(toggleType(current, 'PLACE').type).toBe('PLACE');
    expect(toggleType({ ...current, type: 'PLACE' }, 'PLACE').type).toBeNull();
    expect(setKeyword(current, '  秦淮  ')).toEqual({
      type: null,
      q: '秦淮',
      page: 1,
      pageSize: 20,
    });
    expect(setPageSize(current, 50).pageSize).toBe(50);
    expect(setPage(current, 0).page).toBe(1);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, index) => index + 1);

  it('slices the requested page', async () => {
    const { paginate } = await loadApi(null);
    const result = paginate(items, { type: null, q: '', page: 2, pageSize: 10 });
    expect(result.pageItems).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(result.totalPages).toBe(3);
    expect(result.capped).toBe(false);
  });

  it('clamps a page beyond the last one', async () => {
    const { paginate } = await loadApi(null);
    const result = paginate(items, { type: null, q: '', page: 99, pageSize: 10 });
    expect(result.pageItems).toHaveLength(5);
    expect(result.totalPages).toBe(3);
  });

  it('flags a window that hit the API result cap', async () => {
    const { paginate, MAX_PAGE_SIZE } = await loadApi(null);
    const many = Array.from({ length: MAX_PAGE_SIZE }, (_, index) => index);
    expect(paginate(many, { type: null, q: '', page: 1, pageSize: 10 }).capped).toBe(true);
  });

  it('handles an empty result set without dividing by zero', async () => {
    const { paginate } = await loadApi(null);
    const result = paginate([], { type: null, q: '', page: 1, pageSize: 10 });
    expect(result.pageItems).toEqual([]);
    expect(result.totalPages).toBe(1);
  });
});

describe('签名 revalidation', () => {
  const secret = 'test-secret-value';
  const now = 1_760_000_000_000;
  const body = JSON.stringify({ slug: 'a-slug', type: 'PLACE' });

  it('produces a deterministic sha256 signature', async () => {
    const { signRevalidationPayload } = await loadApi(null);
    const first = signRevalidationPayload(String(now), body, secret);
    expect(first).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signRevalidationPayload(String(now), body, secret)).toBe(first);
  });

  it('accepts a correctly signed, fresh request', async () => {
    const { signRevalidationPayload, verifyRevalidationSignature } = await loadApi(null);
    const timestamp = String(now);
    const signature = signRevalidationPayload(timestamp, body, secret);
    expect(verifyRevalidationSignature({ timestamp, signature, body, secret, nowMs: now })).toEqual(
      { ok: true },
    );
  });

  it('rejects a missing signature or timestamp', async () => {
    const { verifyRevalidationSignature } = await loadApi(null);
    const result = verifyRevalidationSignature({
      timestamp: null,
      signature: null,
      body,
      secret,
      nowMs: now,
    });
    expect(result).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects malformed headers', async () => {
    const { verifyRevalidationSignature } = await loadApi(null);
    expect(
      verifyRevalidationSignature({
        timestamp: 'not-a-number',
        signature: 'sha256=abc',
        body,
        secret,
        nowMs: now,
      }),
    ).toEqual({ ok: false, reason: 'malformed' });
    expect(
      verifyRevalidationSignature({
        timestamp: String(now),
        signature: 'md5=abc',
        body,
        secret,
        nowMs: now,
      }),
    ).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects a replayed timestamp outside the tolerance window', async () => {
    const { signRevalidationPayload, verifyRevalidationSignature, REVALIDATION_TOLERANCE_MS } =
      await loadApi(null);
    const stale = String(now - REVALIDATION_TOLERANCE_MS - 1_000);
    const signature = signRevalidationPayload(stale, body, secret);
    expect(
      verifyRevalidationSignature({ timestamp: stale, signature, body, secret, nowMs: now }),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a timestamp from the future beyond the tolerance window', async () => {
    const { signRevalidationPayload, verifyRevalidationSignature, REVALIDATION_TOLERANCE_MS } =
      await loadApi(null);
    const future = String(now + REVALIDATION_TOLERANCE_MS + 1_000);
    const signature = signRevalidationPayload(future, body, secret);
    expect(
      verifyRevalidationSignature({ timestamp: future, signature, body, secret, nowMs: now }),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a tampered body', async () => {
    const { signRevalidationPayload, verifyRevalidationSignature } = await loadApi(null);
    const timestamp = String(now);
    const signature = signRevalidationPayload(timestamp, body, secret);
    const result = verifyRevalidationSignature({
      timestamp,
      signature,
      body: JSON.stringify({ slug: 'another-slug', type: 'PLACE' }),
      secret,
      nowMs: now,
    });
    expect(result).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects a tampered timestamp', async () => {
    const { signRevalidationPayload, verifyRevalidationSignature } = await loadApi(null);
    const sent = String(now);
    const signature = signRevalidationPayload(sent, body, secret);
    const result = verifyRevalidationSignature({
      timestamp: String(now - 1_000),
      signature,
      body,
      secret,
      nowMs: now,
    });
    expect(result).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects a signature made with a different secret', async () => {
    const { signRevalidationPayload, verifyRevalidationSignature } = await loadApi(null);
    const timestamp = String(now);
    const signature = signRevalidationPayload(timestamp, body, 'another-secret');
    expect(verifyRevalidationSignature({ timestamp, signature, body, secret, nowMs: now })).toEqual(
      { ok: false, reason: 'mismatch' },
    );
  });

  it('honours a custom tolerance window', async () => {
    const { signRevalidationPayload, verifyRevalidationSignature } = await loadApi(null);
    const timestamp = String(now - 5_000);
    const signature = signRevalidationPayload(timestamp, body, secret);
    expect(
      verifyRevalidationSignature({
        timestamp,
        signature,
        body,
        secret,
        nowMs: now,
        toleranceMs: 10_000,
      }),
    ).toEqual({ ok: true });
    expect(
      verifyRevalidationSignature({
        timestamp,
        signature,
        body,
        secret,
        nowMs: now,
        toleranceMs: 1_000,
      }),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('reads REVALIDATION_SECRET and treats an empty value as unset', async () => {
    const api = await loadApi(null);
    vi.stubEnv('REVALIDATION_SECRET', '');
    expect(api.getRevalidationSecret()).toBeNull();
    vi.stubEnv('REVALIDATION_SECRET', 'configured');
    expect(api.getRevalidationSecret()).toBe('configured');
  });
});
