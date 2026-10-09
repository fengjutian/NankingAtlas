import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { assertPasswordAcceptable, hashPassword, verifyPassword } from './password.js';

/**
 * Argon2id 单测。
 *
 * 注意：argon2 是原生模块，单次 hash 约几十毫秒；这里用例数刻意控制在
 * "够覆盖语义"而非"穷举参数"，避免测试拖慢 CI。
 */
describe('password hashing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('APP_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hashes and verifies a valid password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(verifyPassword(hash, 'correct-horse-battery-staple')).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword(hash, 'wrong-horse-battery-staple')).resolves.toBe(false);
  });

  it('produces distinct hashes for the same password (salted)', async () => {
    const a = await hashPassword('correct-horse-battery-staple');
    const b = await hashPassword('correct-horse-battery-staple');
    expect(a).not.toBe(b);
    await expect(verifyPassword(a, 'correct-horse-battery-staple')).resolves.toBe(true);
    await expect(verifyPassword(b, 'correct-horse-battery-staple')).resolves.toBe(true);
  });

  it('returns false (not throws) for a corrupted hash string', async () => {
    await expect(verifyPassword('not-a-real-hash', 'whatever-long-enough')).resolves.toBe(false);
  });

  it('returns false for null hash without throwing (account enumeration defense)', async () => {
    await expect(verifyPassword(null, 'whatever-long-enough')).resolves.toBe(false);
  });

  describe('assertPasswordAcceptable', () => {
    it('rejects passwords shorter than the minimum', () => {
      expect(() => assertPasswordAcceptable('short')).toThrow(/至少需要/);
    });

    it('rejects whitespace-only passwords', () => {
      expect(() => assertPasswordAcceptable('               ')).toThrow(/空白/);
    });

    it('rejects passwords beyond the byte cap', () => {
      const long = 'a'.repeat(2000);
      expect(() => assertPasswordAcceptable(long)).toThrow(/字节/);
    });

    it('accepts a 12+ character password', () => {
      expect(() => assertPasswordAcceptable('exactly-12-ch')).not.toThrow();
    });
  });
});
