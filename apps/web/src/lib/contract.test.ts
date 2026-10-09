import { afterEach, describe, expect, it, vi } from 'vitest';

// api.ts 在模块加载期读 env（src/lib/env.ts 是 fail-fast 校验），
// 所以必须在 import 被测模块之前注入。
vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'test');
vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://api.test');

const api = await import('./api');
const { publicContentSchema } = await import('./types');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const CONTENT = {
  id: 'c1',
  type: 'TOPIC',
  slug: 'demo-topic',
  title: '示例专题',
  subtitle: null,
  summary: '摘要',
  body: { type: 'doc', content: [] },
  language: 'ZH',
  publishedAt: '2026-10-09T12:00:00.000Z',
};

/**
 * 回归测试：详情页曾把 `{ data: {...} }` 信封直接交给只认裸对象的
 * `publicContentSchema`，safeParse 失败 → `invalid_payload` → 页面误报 404。
 * 表现为"列表页有链接、点进去 404"，当时花了很久才定位。
 */
describe('envelope unwrapping', () => {
  it('returns the bare content object from the { data } envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: CONTENT }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result = await api.getPublishedContentBySlug('demo-topic');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.slug).toBe('demo-topic');
      expect(result.data.title).toBe('示例专题');
    }
  });

  it('maps a 404 to not_found (not invalid_payload)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: '内容不存在', requestId: 'r1' } }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    const result = await api.getPublishedContentBySlug('missing');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not_found');
    }
  });

  it('maps a network failure to network (never not_found)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await api.getPublishedContentBySlug('demo-topic');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('network');
      expect(api.isServiceUnavailable(result.reason)).toBe(true);
    }
  });

  it('unwraps the list envelope too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [CONTENT] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result = await api.listPublishedContents();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
    }
  });
});

describe('publicContentSchema contract', () => {
  const sample = CONTENT;

  it('accepts the real API response shape', () => {
    const parsed = publicContentSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
  });

  it('accepts null subtitle/summary/publishedAt', () => {
    const parsed = publicContentSchema.safeParse({
      ...sample,
      subtitle: null,
      summary: null,
      publishedAt: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('strips unknown fields instead of failing (内部备注不会外泄)', () => {
    const parsed = publicContentSchema.safeParse({
      ...sample,
      createdById: 'secret-user-id',
      version: 3,
      status: 'PUBLISHED',
      archivedAt: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('createdById');
      expect(parsed.data).not.toHaveProperty('version');
      expect(parsed.data).not.toHaveProperty('status');
    }
  });

  it('rejects a payload missing required fields', () => {
    const { id: _id, ...withoutId } = sample;
    expect(publicContentSchema.safeParse(withoutId).success).toBe(false);
  });

  it('rejects an unknown content type', () => {
    expect(publicContentSchema.safeParse({ ...sample, type: 'MONUMENT' }).success).toBe(false);
  });

  it('accepts every ContentType the API can emit', () => {
    for (const type of [
      'PLACE',
      'PERSON',
      'EVENT',
      'ARCHITECTURE',
      'TRADITION',
      'TOPIC',
      'ROUTE',
    ] as const) {
      expect(publicContentSchema.safeParse({ ...sample, type }).success).toBe(true);
    }
  });
});
