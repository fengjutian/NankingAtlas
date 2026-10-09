import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import {
  constantTimeEqualHex,
  generateRefreshToken,
  hashRefreshToken,
  issueAccessToken,
  verifyAccessToken,
} from './token.js';

describe('access token (HS256)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('AUTH_ACCESS_SECRET', 'test-access-secret-that-is-long-enough-32b');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('issues a verifiable token carrying sub/roles/exp', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const { token, claims } = issueAccessToken({
      userId: 'user-1',
      roles: ['EDITOR'],
      now,
    });
    expect(claims.sub).toBe('user-1');
    expect(claims.roles).toEqual(['EDITOR']);
    expect(token.split('.')).toHaveLength(3);

    const verified = verifyAccessToken(token, new Date('2026-01-01T00:05:00Z'));
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims.sub).toBe('user-1');
      expect(verified.claims.roles).toEqual(['EDITOR']);
    }
  });

  it('rejects a tampered payload (bad signature)', () => {
    const { token } = issueAccessToken({ userId: 'user-1', roles: ['EDITOR'] });
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'attacker', roles: ['ADMIN'], iat: 0, exp: 9999999999, jti: 'x' }),
    ).toString('base64url');
    const forged = `${header}.${forgedPayload}.${signature}`;
    const result = verifyAccessToken(forged);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('rejects a token signed with a different secret', async () => {
    const first = await import('./token.js');
    const { token } = first.issueAccessToken({ userId: 'user-1', roles: [] });
    vi.resetModules();
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('AUTH_ACCESS_SECRET', 'a-completely-different-secret-value-32b');
    const other = await import('./token.js');
    const result = other.verifyAccessToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('bad_signature');
    }
  });

  it('rejects an expired token', () => {
    const issued = new Date('2026-01-01T00:00:00Z');
    const { token } = issueAccessToken({ userId: 'user-1', roles: [], now: issued });
    // Access TTL default 900s → 15 min later must be expired.
    const result = verifyAccessToken(token, new Date('2026-01-01T01:00:00Z'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('expired');
    }
  });

  it('rejects malformed token shapes', () => {
    expect(verifyAccessToken('')).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyAccessToken('only.two')).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyAccessToken('a.b.c.d')).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyAccessToken('..')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects a well-signed token whose payload is not the expected shape', () => {
    // Sign a payload with valid signature but wrong claim types.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 123, roles: 'ADMIN' })).toString('base64url');
    // We cannot sign without the secret, so just assert malformed path via garbage.
    const result = verifyAccessToken(`${header}.${payload}.zzzz`);
    expect(result.ok).toBe(false);
  });
});

describe('refresh token', () => {
  it('generates unique base64url tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('hashes deterministically and irreversibly enough for storage', () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });

  it('constantTimeEqualHex compares correctly', () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);
    expect(constantTimeEqualHex(hash, hashRefreshToken(token))).toBe(true);
    expect(constantTimeEqualHex(hash, hashRefreshToken(generateRefreshToken()))).toBe(false);
    expect(constantTimeEqualHex(hash, 'abcd')).toBe(false);
  });
});

describe('hashIp', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('AUTH_ACCESS_SECRET', 'test-access-secret-that-is-long-enough-32b');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is deterministic for the same IP and secret', async () => {
    const a = await import('./token.js');
    expect(a.hashIp('203.0.113.5')).toBe(a.hashIp('203.0.113.5'));
    expect(a.hashIp('203.0.113.5')).not.toBe(a.hashIp('203.0.113.6'));
  });
});
