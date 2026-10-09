import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

/**
 * 对单次运行的 @nestjs/testing + vitest 环境，process.env 是只读视图；
 * 通过 vi.stubEnv / vi.unstubAllEnvs 控制注入值，避免直接重写 process.env 触发类型错误。
 */
describe('api env validation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a minimal valid configuration', async () => {
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('API_PORT', '');
    const mod = await import('./env.js');
    expect(mod.env.APP_ENV).toBe('development');
    expect(mod.env.API_PORT).toBe(4000);
  });

  it('parses API_PORT as a number', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('API_PORT', '8080');
    const mod = await import('./env.js');
    expect(mod.env.API_PORT).toBe(8080);
  });

  it('rejects unknown APP_ENV values', async () => {
    vi.stubEnv('APP_ENV', 'wat');
    await expect(import('./env.js')).rejects.toThrow(/invalid environment configuration/);
  });

  it('rejects missing APP_ENV', async () => {
    vi.stubEnv('APP_ENV', '');
    await expect(import('./env.js')).rejects.toThrow(/invalid environment configuration/);
  });

  it('rejects malformed WEB_ORIGIN', async () => {
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('WEB_ORIGIN', 'not-a-url');
    await expect(import('./env.js')).rejects.toThrow(/invalid environment configuration/);
  });
});
