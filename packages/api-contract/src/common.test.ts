import { describe, expect, it } from 'vitest';

import {
  IDEMPOTENCY_KEY_HEADER,
  IF_MATCH_HEADER,
  REQUEST_ID_HEADER,
  buildResponseHeaders,
  createSuccessResponse,
  idempotencyKeySchema,
  ifMatchSchema,
  parseIfMatchVersion,
} from './common.js';

const REQUEST_ID = 'req_abc123_-XYZ';

describe('header constants', () => {
  it('uses lower-case header names', () => {
    expect(IDEMPOTENCY_KEY_HEADER).toBe('idempotency-key');
    expect(IF_MATCH_HEADER).toBe('if-match');
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });
});

describe('idempotencyKeySchema', () => {
  it('accepts a reasonable key', () => {
    expect(idempotencyKeySchema.safeParse('publish-2024_05.01:abc').success).toBe(true);
  });

  it('rejects keys shorter than 8 characters', () => {
    expect(idempotencyKeySchema.safeParse('short').success).toBe(false);
  });

  it('rejects keys containing spaces', () => {
    expect(idempotencyKeySchema.safeParse('has space key').success).toBe(false);
  });

  it('rejects keys longer than 255 characters', () => {
    expect(idempotencyKeySchema.safeParse('a'.repeat(256)).success).toBe(false);
  });
});

describe('ifMatchSchema', () => {
  it('accepts a weak ETag', () => {
    expect(ifMatchSchema.safeParse('W/"3"').success).toBe(true);
  });

  it('rejects a strong ETag', () => {
    expect(ifMatchSchema.safeParse('"3"').success).toBe(false);
  });
});

describe('parseIfMatchVersion', () => {
  it('parses a weak ETag into a number', () => {
    expect(parseIfMatchVersion('W/"3"')).toBe(3);
  });

  it('parses zero', () => {
    expect(parseIfMatchVersion('W/"0"')).toBe(0);
  });

  it('rejects a missing W/ prefix', () => {
    expect(() => parseIfMatchVersion('"3"')).toThrow(TypeError);
  });

  it('rejects a non-numeric version', () => {
    expect(() => parseIfMatchVersion('W/"abc"')).toThrow(TypeError);
  });

  it('rejects a negative version', () => {
    expect(() => parseIfMatchVersion('W/"-1"')).toThrow(TypeError);
  });
});

describe('createSuccessResponse', () => {
  it('wraps data with the request id', () => {
    expect(createSuccessResponse({ id: 'content_01' }, REQUEST_ID)).toEqual({
      data: { id: 'content_01' },
      requestId: REQUEST_ID,
    });
  });

  it('survives a JSON round trip', () => {
    const response = createSuccessResponse({ id: 'content_01', tags: ['a'] }, REQUEST_ID);
    expect(JSON.parse(JSON.stringify(response))).toEqual(response);
  });
});

describe('buildResponseHeaders', () => {
  it('writes the request id under the canonical header', () => {
    expect(buildResponseHeaders(REQUEST_ID)).toEqual({ 'x-request-id': REQUEST_ID });
  });

  it('rejects a malformed request id', () => {
    expect(() => buildResponseHeaders('has space')).toThrow(TypeError);
  });
});
