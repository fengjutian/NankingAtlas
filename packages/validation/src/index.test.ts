import { describe, expect, it } from 'vitest';

import { APP_ENV, parseAppEnv } from './appEnv.js';
import { requestIdSchema } from './iso4217.js';
import { slugSchema } from './slug.js';

describe('validation rules', () => {
  describe('APP_ENV', () => {
    it('accepts the four documented env names', () => {
      for (const v of ['development', 'test', 'staging', 'production']) {
        expect(APP_ENV.safeParse(v).success).toBe(true);
      }
    });

    it('parseAppEnv returns null for unknown values', () => {
      expect(parseAppEnv('wat')).toBeNull();
      expect(parseAppEnv(undefined)).toBeNull();
    });
  });

  describe('slugSchema', () => {
    it('accepts lowercase alphanumeric with single hyphens', () => {
      expect(slugSchema.safeParse('nanjing-ming-city-wall').success).toBe(true);
      expect(slugSchema.safeParse('article-2026').success).toBe(true);
    });

    it('rejects uppercase, leading/trailing hyphens, and double hyphens', () => {
      expect(slugSchema.safeParse('Nanjing').success).toBe(false);
      expect(slugSchema.safeParse('-leading').success).toBe(false);
      expect(slugSchema.safeParse('trailing-').success).toBe(false);
      expect(slugSchema.safeParse('double--hyphen').success).toBe(false);
    });

    it('rejects empty and overlong slugs', () => {
      expect(slugSchema.safeParse('').success).toBe(false);
      expect(slugSchema.safeParse('a'.repeat(121)).success).toBe(false);
    });
  });

  describe('requestIdSchema', () => {
    it('accepts base64url-style ids of plausible length', () => {
      expect(requestIdSchema.safeParse('req_abc123_-XYZ').success).toBe(true);
    });

    it('rejects ids containing whitespace or punctuation', () => {
      expect(requestIdSchema.safeParse('has space').success).toBe(false);
      expect(requestIdSchema.safeParse('with/slash').success).toBe(false);
    });
  });
});
