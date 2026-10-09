import { describe, expect, it } from 'vitest';

import { DATABASE_PACKAGE_NAME } from './index.js';

describe('database package smoke', () => {
  it('exposes its package name as a constant', () => {
    expect(DATABASE_PACKAGE_NAME).toBe('@nanking-atlas/database');
  });
});
