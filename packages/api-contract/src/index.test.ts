import { describe, expect, it } from 'vitest';

import { requestIdSchema } from '@nanking-atlas/validation';

import { API_ERROR_CODES, type ApiErrorCode } from './index.js';

describe('api-contract smoke', () => {
  it('exposes the documented error code set', () => {
    expect(Object.keys(API_ERROR_CODES).sort()).toEqual(
      [
        'CONTENT_VERSION_CONFLICT',
        'FORBIDDEN',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'PUBLICATION_READINESS_FAILED',
        'RATE_LIMITED',
        'UNAUTHENTICATED',
        'VALIDATION_FAILED',
      ].sort(),
    );
  });

  it('narrows error codes to the union type', () => {
    const code: ApiErrorCode = API_ERROR_CODES.FORBIDDEN;
    expect(code).toBe('FORBIDDEN');
  });

  it('re-exports requestIdSchema as the canonical request id schema', () => {
    expect(requestIdSchema.safeParse('req_abc123_-XYZ').success).toBe(true);
    expect(requestIdSchema.safeParse('has space').success).toBe(false);
  });
});
