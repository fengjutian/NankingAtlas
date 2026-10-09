import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

/**
 * Vitest (jsdom) 在测试中把 import.meta.env 暴露为可写对象。
 * 通过 Object.defineProperty 给 import.meta.env 注入受控值。
 */
interface MetaLike {
  env: Record<string, string | undefined>;
}

function setImportMetaEnv(values: Record<string, string | undefined>): void {
  const meta = import.meta as unknown as MetaLike;
  Object.keys(meta.env).forEach((key) => {
    delete meta.env[key];
  });
  Object.assign(meta.env, values);
}

describe('admin env validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    setImportMetaEnv({});
  });

  it('accepts a valid configuration', async () => {
    setImportMetaEnv({
      VITE_APP_ENV: 'development',
      VITE_API_BASE_URL: 'http://localhost:4000',
    });
    const mod = await import('./env');
    expect(mod.env.APP_ENV).toBe('development');
    expect(mod.env.API_BASE_URL).toBe('http://localhost:4000');
  });

  it('falls back to null API base URL when not provided', async () => {
    setImportMetaEnv({ VITE_APP_ENV: 'production' });
    const mod = await import('./env');
    expect(mod.env.APP_ENV).toBe('production');
    expect(mod.env.API_BASE_URL).toBeNull();
  });

  it('rejects unknown APP_ENV values', async () => {
    setImportMetaEnv({ VITE_APP_ENV: 'wat' });
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });

  it('rejects missing APP_ENV', async () => {
    setImportMetaEnv({});
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });

  it('rejects malformed API_BASE_URL', async () => {
    setImportMetaEnv({
      VITE_APP_ENV: 'development',
      VITE_API_BASE_URL: 'not-a-url',
    });
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });
});
