import { describe, expect, it } from 'vitest';

import {
  MAX_BBOX_AREA,
  bboxCenter,
  hasTrustedPoint,
  pointDisplay,
  validateBbox,
} from './places-query.service.js';
import { QueryValidationError, parseBboxParam } from './places-search.controller.js';
import { MIN_QUERY_LENGTH, escapeLikePattern } from './search.service.js';

/**
 * 空间查询与搜索的纯逻辑单测（P3-01 / P3-05）。
 */

describe('validateBbox', () => {
  const valid = { minLon: 118.7, minLat: 32.0, maxLon: 118.9, maxLat: 32.2 };

  it('accepts a normal bbox', () => {
    const result = validateBbox(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bbox).toEqual(valid);
    }
  });

  it('rejects an inverted longitude range', () => {
    const result = validateBbox({ ...valid, minLon: 119, maxLon: 118 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.message).join()).toContain('minLon');
    }
  });

  it('rejects an inverted latitude range', () => {
    const result = validateBbox({ ...valid, minLat: 33, maxLat: 32 });
    expect(result.ok).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(validateBbox({ ...valid, minLon: -200 }).ok).toBe(false);
    expect(validateBbox({ ...valid, maxLat: 100 }).ok).toBe(false);
  });

  it('rejects non-finite numbers', () => {
    expect(validateBbox({ ...valid, minLon: Number.NaN }).ok).toBe(false);
    expect(validateBbox({ ...valid, maxLat: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });

  it('rejects an over-large area (prevents full-table pull)', () => {
    const result = validateBbox({ minLon: -180, minLat: -90, maxLon: 180, maxLat: 90 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.message).join()).toContain('过大');
    }
  });

  it('accepts an area just under the cap', () => {
    const side = Math.sqrt(MAX_BBOX_AREA) / 2;
    const result = validateBbox({
      minLon: 118,
      minLat: 32,
      maxLon: 118 + side * 2,
      maxLat: 32 + side * 2,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a zero-width bbox', () => {
    expect(validateBbox({ ...valid, minLon: 118.8, maxLon: 118.8 }).ok).toBe(false);
  });
});

describe('bboxCenter', () => {
  it('returns the midpoint', () => {
    expect(bboxCenter({ minLon: 118, minLat: 32, maxLon: 120, maxLat: 34 })).toEqual({
      lon: 119,
      lat: 33,
    });
  });
});

describe('parseBboxParam', () => {
  it('parses a well-formed string', () => {
    expect(parseBboxParam('118.7,32.0,118.9,32.2')).toEqual({
      minLon: 118.7,
      minLat: 32,
      maxLon: 118.9,
      maxLat: 32.2,
    });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseBboxParam(' 118.7 , 32.0 , 118.9 , 32.2 ').minLon).toBe(118.7);
  });

  it('rejects wrong arity', () => {
    expect(() => parseBboxParam('118.7,32.0,118.9')).toThrow(QueryValidationError);
    expect(() => parseBboxParam('118.7,32.0,118.9,32.2,1')).toThrow(QueryValidationError);
  });

  it('rejects non-numeric parts', () => {
    expect(() => parseBboxParam('a,b,c,d')).toThrow(QueryValidationError);
  });

  it('rejects an empty string', () => {
    expect(() => parseBboxParam('')).toThrow(QueryValidationError);
  });
});

describe('coordinate trust rules (AGENTS.md §3.5)', () => {
  it('trusts only EXACT + VERIFIED with both coordinates', () => {
    expect(
      hasTrustedPoint({ accuracy: 'EXACT', verificationStatus: 'VERIFIED', lon: 118.7, lat: 32 }),
    ).toBe(true);
  });

  it('does not trust APPROXIMATE even if verified', () => {
    expect(
      hasTrustedPoint({
        accuracy: 'APPROXIMATE',
        verificationStatus: 'VERIFIED',
        lon: 118.7,
        lat: 32,
      }),
    ).toBe(false);
  });

  it('does not trust EXACT when not verified', () => {
    expect(
      hasTrustedPoint({ accuracy: 'EXACT', verificationStatus: 'PARTIAL', lon: 118.7, lat: 32 }),
    ).toBe(false);
  });

  it('does not trust a point with missing coordinates', () => {
    expect(
      hasTrustedPoint({ accuracy: 'EXACT', verificationStatus: 'VERIFIED', lon: null, lat: null }),
    ).toBe(false);
  });

  it('gives a distinct note per untrusted accuracy', () => {
    const notes = (['AREA_ONLY', 'APPROXIMATE', 'UNKNOWN'] as const).map(
      (accuracy) =>
        pointDisplay({ accuracy, verificationStatus: 'PARTIAL', lon: 118.7, lat: 32 }).note,
    );
    expect(new Set(notes).size).toBe(3);
    for (const note of notes) {
      expect(note).not.toBeNull();
    }
  });

  it('says "未核验" when there are no coordinates at all', () => {
    const result = pointDisplay({
      accuracy: 'UNKNOWN',
      verificationStatus: 'UNVERIFIED',
      lon: null,
      lat: null,
    });
    expect(result.hasPoint).toBe(false);
    expect(result.note).toContain('未核验');
  });

  it('gives no note for a trusted point', () => {
    const result = pointDisplay({
      accuracy: 'EXACT',
      verificationStatus: 'VERIFIED',
      lon: 118.7,
      lat: 32,
    });
    expect(result).toEqual({ hasPoint: true, note: null });
  });
});

describe('escapeLikePattern', () => {
  it('escapes LIKE wildcards so user input cannot become a full scan', () => {
    expect(escapeLikePattern('%')).toBe('\\%');
    expect(escapeLikePattern('_')).toBe('\\_');
    expect(escapeLikePattern('\\')).toBe('\\\\');
  });

  it('escapes wildcards inside a normal query', () => {
    expect(escapeLikePattern('100%_x')).toBe('100\\%\\_x');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeLikePattern('秦淮')).toBe('秦淮');
  });

  it('handles empty input', () => {
    expect(escapeLikePattern('')).toBe('');
  });
});

describe('search query bounds', () => {
  it('has a minimum length below which no search runs', () => {
    expect(MIN_QUERY_LENGTH).toBe(2);
  });
});
