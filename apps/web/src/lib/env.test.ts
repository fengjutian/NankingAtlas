import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

/**
 * Next.js / Vitest 环境中 process.env 由 Node 暴露。
 * 用 vi.stubEnv 注入受控值，避免直接重写只读 process.env 触发 TS 类型错误。
 */
describe('web env validation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a valid configuration', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:4000');
    const mod = await import('./env');
    expect(mod.env.APP_ENV).toBe('development');
    expect(mod.env.API_BASE_URL).toBe('http://localhost:4000');
  });

  it('falls back to null API base URL when not provided', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    const mod = await import('./env');
    expect(mod.env.APP_ENV).toBe('production');
    expect(mod.env.API_BASE_URL).toBeNull();
  });

  it('rejects unknown APP_ENV values', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'wat');
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });

  it('rejects missing APP_ENV', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', '');
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });

  it('rejects malformed API_BASE_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'not-a-url');
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });
});
