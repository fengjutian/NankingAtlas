import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('api env validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts a minimal valid configuration', async () => {
    process.env['APP_ENV'] = 'development';
    delete process.env['API_PORT'];
    const mod = await import('./env');
    expect(mod.env.APP_ENV).toBe('development');
    expect(mod.env.API_PORT).toBe(4000);
  });

  it('parses API_PORT as a number', async () => {
    process.env['APP_ENV'] = 'staging';
    process.env['API_PORT'] = '8080';
    const mod = await import('./env');
    expect(mod.env.API_PORT).toBe(8080);
  });

  it('rejects unknown APP_ENV values', async () => {
    process.env['APP_ENV'] = 'wat';
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });

  it('rejects missing APP_ENV', async () => {
    delete process.env['APP_ENV'];
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });

  it('rejects malformed WEB_ORIGIN', async () => {
    process.env['APP_ENV'] = 'development';
    process.env['WEB_ORIGIN'] = 'not-a-url';
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });
});
