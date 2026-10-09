import { describe, expect, it } from 'vitest';

import {
  API_ERROR_CODE_HTTP_STATUS,
  API_ERROR_CODES,
  apiErrorResponseSchema,
  createApiError,
  httpStatusForApiErrorCode,
  type ApiErrorCode,
} from './errors.js';

const REQUEST_ID = 'req_abc123_-XYZ';

describe('API_ERROR_CODES', () => {
  it('exposes 20 error codes', () => {
    expect(API_ERROR_CODES).toHaveLength(20);
  });

  it('has no duplicate codes', () => {
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
  });

  it('only uses upper snake case codes', () => {
    for (const code of API_ERROR_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/u);
    }
  });
});

describe('apiErrorResponseSchema', () => {
  it.each(API_ERROR_CODES)('accepts the %s code', (code) => {
    const result = apiErrorResponseSchema.safeParse({
      error: { code, message: 'boom', requestId: REQUEST_ID },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a code outside the set', () => {
    const result = apiErrorResponseSchema.safeParse({
      error: { code: 'NOT_A_REAL_CODE', message: 'boom', requestId: REQUEST_ID },
    });
    expect(result.success).toBe(false);
  });

  it('rejects the removed P0 placeholder code UNAUTHENTICATED', () => {
    const result = apiErrorResponseSchema.safeParse({
      error: { code: 'UNAUTHENTICATED', message: 'boom', requestId: REQUEST_ID },
    });
    expect(result.success).toBe(false);
  });

  it('accepts structured details', () => {
    const result = apiErrorResponseSchema.safeParse({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'invalid',
        requestId: REQUEST_ID,
        details: { fields: { title: 'required' } },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed requestId', () => {
    const result = apiErrorResponseSchema.safeParse({
      error: { code: 'NOT_FOUND', message: 'missing', requestId: 'has space' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing requestId', () => {
    const result = apiErrorResponseSchema.safeParse({
      error: { code: 'NOT_FOUND', message: 'missing' },
    });
    expect(result.success).toBe(false);
  });
});

describe('API_ERROR_CODE_HTTP_STATUS', () => {
  it('covers every error code exactly', () => {
    expect(Object.keys(API_ERROR_CODE_HTTP_STATUS).sort()).toEqual([...API_ERROR_CODES].sort());
  });

  it('has no extra keys beyond the code set', () => {
    const codes = new Set<string>(API_ERROR_CODES);
    for (const key of Object.keys(API_ERROR_CODE_HTTP_STATUS)) {
      expect(codes.has(key)).toBe(true);
    }
  });

  it.each([
    ['VALIDATION_FAILED', 422],
    ['UNAUTHORIZED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['RATE_LIMITED', 429],
    ['INTERNAL_ERROR', 500],
    ['SERVICE_UNAVAILABLE', 503],
  ] as const)('maps %s to %i', (code, status) => {
    expect(httpStatusForApiErrorCode(code)).toBe(status);
  });

  it('maps optimistic-lock conflicts to 409', () => {
    expect(httpStatusForApiErrorCode('CONTENT_VERSION_CONFLICT')).toBe(409);
  });

  it('only uses valid HTTP status codes', () => {
    for (const status of Object.values(API_ERROR_CODE_HTTP_STATUS)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });
});

describe('createApiError', () => {
  it('omits details when not provided', () => {
    const result = createApiError('NOT_FOUND', 'missing', REQUEST_ID);
    expect(result).toEqual({
      error: { code: 'NOT_FOUND', message: 'missing', requestId: REQUEST_ID },
    });
    expect('details' in result.error).toBe(false);
  });

  it('includes details when provided', () => {
    const result = createApiError('VALIDATION_FAILED', 'invalid', REQUEST_ID, {
      fields: { title: 'required' },
    });
    expect(result.error.details).toEqual({ fields: { title: 'required' } });
  });

  it('produces a payload accepted by apiErrorResponseSchema', () => {
    const result = createApiError('FORBIDDEN', 'nope', REQUEST_ID);
    expect(apiErrorResponseSchema.safeParse(result).success).toBe(true);
  });

  it('keeps the error code narrowed to the union type', () => {
    const code: ApiErrorCode = 'CONTENT_SLUG_TAKEN';
    expect(createApiError(code, 'taken', REQUEST_ID).error.code).toBe('CONTENT_SLUG_TAKEN');
  });

  it('survives a JSON round trip', () => {
    const result = createApiError('INTERNAL_ERROR', 'oops', REQUEST_ID, { trace: 'abc' });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
