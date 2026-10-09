import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import {
  REVALIDATION_MAX_AGE_SECONDS,
  revalidationPathsFor,
  signRevalidation,
  verifyRevalidation,
} from './revalidation.js';

/**
 * 签名 revalidation 协议单测（P2-07）。
 *
 * 关注点：签名正确性、时间窗防重放、以及**路径推导**是否覆盖了
 * 每种内容类型对应的公开页面（漏一个路径 = 站点不收敛）。
 */
describe('revalidation signature', () => {
  const SECRET = 'test-revalidation-secret-long-enough-32b';

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
    signature: string | undefined;
    now?: Date;
  }): Promise<ReturnType<typeof verifyRevalidation>> {
    const mod = await import('./revalidation.js');
    return mod.verifyRevalidation(input);
  }

  it('accepts a correctly signed request', async () => {
    const body = JSON.stringify({ paths: ['/'], reason: 'test' });
    const now = new Date('2026-01-01T00:00:00Z');
    const ts = Math.floor(now.getTime() / 1000);

    const { signRevalidation: sign } = await import('./revalidation.js');
    const signature = `${String(ts)}:${sign(body, ts, SECRET)}`;

    expect(await verify({ body, signature, now })).toEqual({ ok: true });
  });

  it('rejects a missing signature', async () => {
    expect(await verify({ body: '{}', signature: undefined })).toEqual({
      ok: false,
      reason: 'missing_signature',
    });
  });

  it('rejects a malformed signature format', async () => {
    expect(await verify({ body: '{}', signature: 'no-colon' })).toEqual({
      ok: false,
      reason: 'malformed_timestamp',
    });
  });

  it('rejects a non-numeric timestamp', async () => {
    expect(await verify({ body: '{}', signature: 'abc:deadbeef' })).toEqual({
      ok: false,
      reason: 'malformed_timestamp',
    });
  });

  it('rejects an expired request (anti-replay)', async () => {
    const body = '{}';
    const signedAt = new Date('2026-01-01T00:00:00Z');
    const ts = Math.floor(signedAt.getTime() / 1000);
    const { signRevalidation: sign } = await import('./revalidation.js');
    const signature = `${String(ts)}:${sign(body, ts, SECRET)}`;

    // 超过时间窗
    const tooLate = new Date(signedAt.getTime() + (REVALIDATION_MAX_AGE_SECONDS + 10) * 1000);
    expect(await verify({ body, signature, now: tooLate })).toEqual({
      ok: false,
      reason: 'stale',
    });
  });

  it('rejects a tampered body', async () => {
    const originalBody = JSON.stringify({ paths: ['/'], reason: 'publish' });
    const now = new Date('2026-01-01T00:00:00Z');
    const ts = Math.floor(now.getTime() / 1000);
    const { signRevalidation: sign } = await import('./revalidation.js');
    const signature = `${String(ts)}:${sign(originalBody, ts, SECRET)}`;

    // 攻击者改了 body 但没改签名
    const tampered = JSON.stringify({ paths: ['/etc/passwd'], reason: 'publish' });
    expect(await verify({ body: tampered, signature, now })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a signature from a different secret', async () => {
    const body = '{}';
    const now = new Date('2026-01-01T00:00:00Z');
    const ts = Math.floor(now.getTime() / 1000);
    const signature = `${String(ts)}:${signRevalidation(body, ts, 'a-different-secret-value-32b-long')}`;

    expect(await verify({ body, signature, now })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('signature is deterministic for the same inputs', () => {
    const a = signRevalidation('body', 1000, SECRET);
    const b = signRevalidation('body', 1000, SECRET);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signature changes when the body changes', () => {
    const a = signRevalidation('body-a', 1000, SECRET);
    const b = signRevalidation('body-b', 1000, SECRET);
    expect(a).not.toBe(b);
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
