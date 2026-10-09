import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

declare global {
  // eslint-disable-next-line no-var
  var import.meta: { env: Record<string, string | undefined> };
}

function setImportMetaEnv(values: Record<string, string | undefined>): void {
  globalThis.import.meta = { env: values };
}

describe('admin env validation', () => {
  const originalMeta = globalThis.import?.meta;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalMeta) {
      globalThis.import.meta = originalMeta;
    } else {
      // @ts-expect-error 重置 import.meta 以避免污染后续测试
      delete globalThis.import.meta;
    }
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

  it('rejects unknown APP_ENV values', async () => {
    setImportMetaEnv({ VITE_APP_ENV: 'wat' });
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });

  it('rejects missing APP_ENV', async () => {
    setImportMetaEnv({});
    await expect(import('./env')).rejects.toThrow(/invalid environment configuration/);
  });
});