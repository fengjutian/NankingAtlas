import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('web env validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts a valid configuration', async () => {
    process.env['NEXT_PUBLIC_APP_ENV'] = 'development';
    process.env['NEXT_PUBLIC_API_BASE_URL'] = 'http://localhost:4000';
    const mod = await import('./env');
    expect(mod.env.APP_ENV).toBe('development');
    expect(mod.env.API_BASE_URL).toBe('http://localhost:4000');
  });

  it('falls back to null API base URL when not provided', async () => {
    process.env['NEXT_PUBLIC_APP_ENV'] = 'production';
    delete process.env['NEXT_PUBLIC_API_BASE_URL'];
    const mod = await import('./env');
    expect(mod.env.APP_ENV).toBe('production');
    expect(mod.env.API_BASE_URL).toBeNull();
  });

  it('rejects unknown APP_ENV values', async () => {
    process.env['NEXT_PUBLIC_APP_ENV'] = 'wat';
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });

  it('rejects missing APP_ENV', async () => {
    delete process.env['NEXT_PUBLIC_APP_ENV'];
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });

  it('rejects malformed API_BASE_URL', async () => {
    process.env['NEXT_PUBLIC_APP_ENV'] = 'development';
    process.env['NEXT_PUBLIC_API_BASE_URL'] = 'not-a-url';
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });
});