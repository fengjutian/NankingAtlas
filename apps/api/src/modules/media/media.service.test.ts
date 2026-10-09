import { describe, expect, it } from 'vitest';

import {
  ALLOWED_IMAGE_MIMES,
  MAX_UPLOAD_BYTES,
  assertExtension,
  assertMagicBytes,
  assertRightsStatus,
  assertSize,
  buildObjectKey,
  isPubliclyUsable,
  sha256Hex,
} from './media.service.js';

/**
 * 上传校验单测（P1-09；AGENTS.md §4.5「上传必须校验内容与大小」）。
 */
describe('upload validation', () => {
  const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const gifHeader = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const webpHeader = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);

  describe('assertMagicBytes — 不能信 Content-Type', () => {
    it('accepts valid headers for every allowed mime', () => {
      expect(() => assertMagicBytes('image/jpeg', jpegHeader)).not.toThrow();
      expect(() => assertMagicBytes('image/png', pngHeader)).not.toThrow();
      expect(() => assertMagicBytes('image/gif', gifHeader)).not.toThrow();
      expect(() => assertMagicBytes('image/webp', webpHeader)).not.toThrow();
    });

    it('rejects a PHP file disguised as image/jpeg', () => {
      const php = new Uint8Array([0x3c, 0x3f, 0x70, 0x68, 0x70, 0x20]);
      expect(() => assertMagicBytes('image/jpeg', php)).toThrow(/与声明的 MIME 类型不符/);
    });

    it('rejects a text file disguised as image/png', () => {
      const text = new TextEncoder().encode('hello world, not an image');
      expect(() => assertMagicBytes('image/png', text)).toThrow(/与声明的 MIME 类型不符/);
    });

    it('rejects a RIFF container that is not WebP', () => {
      const wav = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      ]);
      expect(() => assertMagicBytes('image/webp', wav)).toThrow(/不是有效的 WebP/);
    });

    it('rejects unsupported mime types', () => {
      for (const mime of [
        'application/pdf',
        'image/svg+xml',
        'text/html',
        'application/x-msdownload',
      ]) {
        expect(() => assertMagicBytes(mime, jpegHeader)).toThrow(/不支持的 MIME 类型/);
      }
    });

    it('rejects content too short to identify', () => {
      expect(() => assertMagicBytes('image/png', new Uint8Array([0x89]))).toThrow(/过短/);
    });

    it('never allows image/svg+xml (XSS vector) even if headers match', () => {
      expect((ALLOWED_IMAGE_MIMES as readonly string[]).includes('image/svg+xml')).toBe(false);
    });
  });

  describe('assertExtension', () => {
    it('accepts matching extensions', () => {
      expect(() => assertExtension('image/jpeg', 'photo.jpg')).not.toThrow();
      expect(() => assertExtension('image/jpeg', 'PHOTO.JPEG')).not.toThrow();
      expect(() => assertExtension('image/png', 'shot.png')).not.toThrow();
      expect(() => assertExtension('image/webp', 'pic.webp')).not.toThrow();
    });

    it('rejects mismatched extension', () => {
      expect(() => assertExtension('image/png', 'evil.exe')).toThrow(/扩展名与 MIME 不匹配/);
      expect(() => assertExtension('image/jpeg', 'shell.php')).toThrow(/扩展名与 MIME 不匹配/);
      expect(() => assertExtension('image/png', 'noext')).toThrow(/扩展名与 MIME 不匹配/);
    });

    it('rejects double extension tricks', () => {
      expect(() => assertExtension('image/png', 'x.png.exe')).toThrow(/扩展名与 MIME 不匹配/);
    });
  });

  describe('assertSize', () => {
    it('accepts a normal size', () => {
      expect(() => assertSize(1024)).not.toThrow();
    });

    it('rejects zero and negative', () => {
      expect(() => assertSize(0)).toThrow(/大小非法/);
      expect(() => assertSize(-1)).toThrow(/大小非法/);
    });

    it('rejects non-integer', () => {
      expect(() => assertSize(1024.5)).toThrow(/大小非法/);
    });

    it('rejects above the 10 MiB cap', () => {
      expect(() => assertSize(MAX_UPLOAD_BYTES + 1)).toThrow(/超过上限/);
      expect(() => assertSize(MAX_UPLOAD_BYTES)).not.toThrow();
    });
  });

  describe('assertRightsStatus', () => {
    it('accepts known statuses', () => {
      for (const status of ['PUBLIC_DOMAIN', 'CC_BY', 'CC0', 'LICENSED']) {
        expect(() => assertRightsStatus(status)).not.toThrow();
      }
    });

    it('rejects unknown statuses', () => {
      expect(() => assertRightsStatus('FREE')).toThrow(/无效版权状态/);
      expect(() => assertRightsStatus('')).toThrow(/无效版权状态/);
    });
  });

  describe('isPubliclyUsable (技术方案 §5.3)', () => {
    it('blocks UNKNOWN and RESTRICTED', () => {
      expect(isPubliclyUsable('UNKNOWN')).toBe(false);
      expect(isPubliclyUsable('RESTRICTED')).toBe(false);
    });

    it('allows cleared licenses', () => {
      for (const status of ['PUBLIC_DOMAIN', 'CC_BY', 'CC_BY_SA', 'CC0', 'LICENSED']) {
        expect(isPubliclyUsable(status)).toBe(true);
      }
    });
  });

  describe('buildObjectKey', () => {
    it('produces unpredictable, extension-matched keys', () => {
      const a = buildObjectKey('image/jpeg');
      const b = buildObjectKey('image/jpeg');
      expect(a).not.toBe(b);
      expect(a.startsWith('media/')).toBe(true);
      expect(a.endsWith('.jpg')).toBe(true);
    });

    it('uses the matching extension per mime', () => {
      expect(buildObjectKey('image/png').endsWith('.png')).toBe(true);
      expect(buildObjectKey('image/gif').endsWith('.gif')).toBe(true);
      expect(buildObjectKey('image/webp').endsWith('.webp')).toBe(true);
    });
  });

  describe('sha256Hex', () => {
    it('produces 64-char lowercase hex, deterministic', () => {
      const bytes = new TextEncoder().encode('abc');
      expect(sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);
      expect(sha256Hex(bytes)).toBe(sha256Hex(bytes));
    });
  });
});
