import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { revalidationPathsFor, REVALIDATION_MAX_AGE_SECONDS } from './revalidation.js';

import type * as revalidationModule from './revalidation.js';
import type { verifyRevalidation } from './revalidation.js';

/**
 * 签名 revalidation 协议单测（P2-07；P4-02 修正为与 web 一致的双头协议）。
 *
 * 关注点：签名正确性、时间窗防重放、失败重试、以及**路径推导**是否覆盖了
 * 每种内容类型对应的公开页面（漏一个路径 = 站点不收敛）。
 *
 * 协议（必须与 `apps/web/src/lib/api.ts` 一致，见 protocol-parity.test.ts）：
 *   `x-revalidate-timestamp`: 13 位毫秒整数
 *   `x-revalidate-signature`: `sha256=<hex>`，HMAC(secret, `${timestamp}.${body}`)
 */

/** 测试用密钥；模块级，两个 describe 共享。 */
const SECRET = 'test-revalidation-secret-long-enough-32b';

describe('revalidation signature', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('REVALIDATION_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function verify(input: {
    body: string;
    timestamp: string | undefined;
    signature: string | undefined;
    now?: Date;
  }): Promise<ReturnType<typeof verifyRevalidation>> {
    const mod = await import('./revalidation.js');
    return mod.verifyRevalidation(input);
  }

  it('accepts a correctly signed request', async () => {
    const body = JSON.stringify({ paths: ['/'], slug: 'test', type: 'TOPIC' });
    const now = new Date('2026-01-01T00:00:00Z');
    const ts = now.getTime();

    const mod = await import('./revalidation.js');
    const signature = mod.signRevalidationPayload(ts, body, SECRET);

    expect(await verify({ body, timestamp: String(ts), signature, now })).toEqual({ ok: true });
  });

  it('rejects a missing signature', async () => {
    expect(await verify({ body: '{}', timestamp: '1700000000000', signature: undefined })).toEqual({
      ok: false,
      reason: 'missing_signature',
    });
  });

  it('rejects a missing timestamp', async () => {
    const mod = await import('./revalidation.js');
    const ts = Date.now();
    expect(
      await verify({
        body: '{}',
        timestamp: undefined,
        signature: mod.signRevalidationPayload(ts, '{}', SECRET),
      }),
    ).toEqual({ ok: false, reason: 'missing_signature' });
  });

  it('rejects a signature without the sha256= prefix', async () => {
    const mod = await import('./revalidation.js');
    const ts = Date.now();
    const bare = mod.signRevalidationPayload(ts, '{}', SECRET).replace('sha256=', '');
    expect(await verify({ body: '{}', timestamp: String(ts), signature: bare })).toEqual({
      ok: false,
      reason: 'malformed_timestamp',
    });
  });

  it('rejects a non-numeric timestamp', async () => {
    expect(await verify({ body: '{}', timestamp: 'abc', signature: 'sha256=deadbeef' })).toEqual({
      ok: false,
      reason: 'malformed_timestamp',
    });
  });

  it('rejects a second-precision timestamp (the P2 defect shape)', async () => {
    const mod = await import('./revalidation.js');
    const seconds = Math.floor(Date.now() / 1000);
    expect(
      await verify({
        body: '{}',
        timestamp: String(seconds),
        signature: mod.signRevalidationPayload(seconds, '{}', SECRET),
      }).then((r) => r.ok),
    ).toBe(false);
  });

  it('rejects an expired request (anti-replay)', async () => {
    const body = '{}';
    const signedAt = new Date('2026-01-01T00:00:00Z');
    const ts = signedAt.getTime();
    const mod = await import('./revalidation.js');
    const signature = mod.signRevalidationPayload(ts, body, SECRET);

    const tooLate = new Date(signedAt.getTime() + (REVALIDATION_MAX_AGE_SECONDS + 10) * 1000);
    expect(await verify({ body, timestamp: String(ts), signature, now: tooLate })).toEqual({
      ok: false,
      reason: 'stale',
    });
  });

  it('rejects a tampered body', async () => {
    const originalBody = JSON.stringify({ paths: ['/'], reason: 'publish' });
    const now = new Date();
    const ts = now.getTime();
    const mod = await import('./revalidation.js');
    const signature = mod.signRevalidationPayload(ts, originalBody, SECRET);

    // 攻击者改了 body 但没改签名
    const tampered = JSON.stringify({ paths: ['/etc/passwd'], reason: 'publish' });
    expect(await verify({ body: tampered, timestamp: String(ts), signature, now })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a signature from a different secret', async () => {
    const body = '{}';
    const now = new Date();
    const ts = now.getTime();
    const mod = await import('./revalidation.js');
    const signature = mod.signRevalidationPayload(ts, body, 'a-different-secret-value-32b-long');

    expect(await verify({ body, timestamp: String(ts), signature, now })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('signRevalidationPayload is deterministic and prefixed', async () => {
    const mod = await import('./revalidation.js');
    const a = mod.signRevalidationPayload(1000, 'body', SECRET);
    const b = mod.signRevalidationPayload(1000, 'body', SECRET);
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256=[0-9a-f]{64}$/u);
    expect(mod.signRevalidationPayload(1000, 'other', SECRET)).not.toBe(a);
  });
});

describe('triggerRevalidation', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  async function withEnv<T>(
    vars: Record<string, string>,
    fn: (mod: typeof revalidationModule) => Promise<T>,
  ): Promise<T> {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('REVALIDATION_SECRET', SECRET);
    for (const [key, value] of Object.entries(vars)) {
      vi.stubEnv(key, value);
    }
    const mod = await import('./revalidation.js');
    return fn(mod);
  }

  it('is a no-op when REVALIDATION_URL is not configured', async () => {
    await withEnv({}, async (mod) => {
      globalThis.fetch = vi.fn();
      const result = await mod.triggerRevalidation({ paths: ['/'], slug: 'test', type: 'TOPIC' });
      expect(result).toEqual({ ok: true, attempts: 0 });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  it('succeeds on the first attempt', async () => {
    await withEnv({ REVALIDATION_URL: 'http://localhost:3111/api/revalidate' }, async (mod) => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      const result = await mod.triggerRevalidation({ paths: ['/'], slug: 'test', type: 'TOPIC' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.attempts).toBe(1);
      }
    });
  });

  it('retries and eventually succeeds', async () => {
    await withEnv({ REVALIDATION_URL: 'http://localhost:3111/api/revalidate' }, async (mod) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 500 }))
        .mockResolvedValueOnce(new Response('{}', { status: 200 }));
      globalThis.fetch = fetchMock;

      const result = await mod.triggerRevalidation({ paths: ['/'], slug: 'test', type: 'TOPIC' });
      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('gives up after the retry budget and reports the last reason', async () => {
    await withEnv({ REVALIDATION_URL: 'http://localhost:3111/api/revalidate' }, async (mod) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
      globalThis.fetch = fetchMock;

      const result = await mod.triggerRevalidation({ paths: ['/'], slug: 'test', type: 'TOPIC' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('503');
        // 1 次首发 + 3 次重试
        expect(result.attempts).toBe(4);
      }
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    // 退避总时长约 5.25 秒，超过 vitest 默认 5 秒超时
  }, 15_000);

  it('sends timestamp and signature headers on every attempt', async () => {
    await withEnv({ REVALIDATION_URL: 'http://localhost:3111/api/revalidate' }, async (mod) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      globalThis.fetch = fetchMock;

      await mod.triggerRevalidation({ paths: ['/chronicle/x'], slug: 'x', type: 'PLACE' });
      const firstCall = fetchMock.mock.calls[0] as [string, RequestInit | undefined] | undefined;
      const init = firstCall?.[1];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['x-revalidate-timestamp']).toMatch(/^\d{13}$/u);
      expect(headers['x-revalidate-signature']).toMatch(/^sha256=[0-9a-f]{64}$/u);
    });
  });
});

describe('revalidationPathsFor', () => {
  it('always includes home and sitemap', () => {
    for (const type of ['PLACE', 'PERSON', 'EVENT', 'TOPIC', 'ROUTE']) {
      const paths = revalidationPathsFor({ slug: 'demo', type });
      expect(paths).toContain('/');
      expect(paths).toContain('/sitemap.xml');
    }
  });

  it('includes chronicle and living detail for every type', () => {
    const paths = revalidationPathsFor({ slug: 'demo', type: 'PLACE' });
    expect(paths).toContain('/chronicle/demo');
    expect(paths).toContain('/living/demo');
  });

  it('includes the type-specific route', () => {
    expect(revalidationPathsFor({ slug: 'x', type: 'PLACE' })).toContain('/places/x');
    expect(revalidationPathsFor({ slug: 'x', type: 'TOPIC' })).toContain('/topics/x');
    expect(revalidationPathsFor({ slug: 'x', type: 'ROUTE' })).toContain('/routes/x');
  });

  it('includes /map only for places', () => {
    expect(revalidationPathsFor({ slug: 'x', type: 'PLACE' })).toContain('/map');
    expect(revalidationPathsFor({ slug: 'x', type: 'TOPIC' })).not.toContain('/map');
  });

  it('de-duplicates paths', () => {
    const paths = revalidationPathsFor({ slug: 'x', type: 'PLACE' });
    expect(new Set(paths).size).toBe(paths.length);
  });
});
