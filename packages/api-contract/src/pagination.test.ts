import { describe, expect, it } from 'vitest';

import {
  CursorError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildCursorPage,
  cursorQuerySchema,
  decodeCursor,
  encodeCursor,
  pageSizeSchema,
  type CursorPayload,
} from './pagination.js';

const PAYLOAD: CursorPayload = { createdAt: '2024-05-01T10:00:00.000Z', id: 'content_01' };

function makeItems(count: number): { id: string; createdAt: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `content_${String(index).padStart(3, '0')}`,
    createdAt: '2024-05-01T10:00:00.000Z',
  }));
}

const toCursorItem = (item: { id: string; createdAt: string }): CursorPayload => ({
  createdAt: item.createdAt,
  id: item.id,
});

describe('page size', () => {
  it('defaults to 20', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    expect(pageSizeSchema.parse(undefined)).toBe(20);
  });

  it('caps at 100', () => {
    expect(MAX_PAGE_SIZE).toBe(100);
    expect(pageSizeSchema.parse(100)).toBe(100);
  });

  it('rejects values above 100', () => {
    expect(pageSizeSchema.safeParse(101).success).toBe(false);
  });

  it('rejects non-integers and non-numbers', () => {
    expect(pageSizeSchema.safeParse(10.5).success).toBe(false);
    expect(pageSizeSchema.safeParse('abc').success).toBe(false);
    expect(pageSizeSchema.safeParse(0).success).toBe(false);
  });

  it('coerces numeric strings from query params', () => {
    expect(pageSizeSchema.parse('25')).toBe(25);
  });
});

describe('cursorQuerySchema', () => {
  it('applies defaults for an empty query', () => {
    expect(cursorQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it('accepts cursor plus limit', () => {
    const cursor = encodeCursor(PAYLOAD);
    expect(cursorQuerySchema.parse({ cursor, limit: '5' })).toEqual({ cursor, limit: 5 });
  });
});

describe('encode/decode cursor', () => {
  it('round-trips a payload', () => {
    expect(decodeCursor(encodeCursor(PAYLOAD))).toEqual(PAYLOAD);
  });

  it('produces base64url without padding', () => {
    const cursor = encodeCursor(PAYLOAD);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(cursor).not.toContain('=');
  });

  it('produces a different cursor per id', () => {
    expect(encodeCursor(PAYLOAD)).not.toBe(encodeCursor({ ...PAYLOAD, id: 'content_02' }));
  });

  it('rejects a tampered base64 character', () => {
    const tampered = `${encodeCursor(PAYLOAD).slice(0, -1)}*`;
    expect(() => decodeCursor(tampered)).toThrow(CursorError);
  });

  it('rejects a base64 string of impossible length', () => {
    expect(() => decodeCursor('AAAAA')).toThrow(CursorError);
  });

  it('rejects valid base64url that is not JSON', () => {
    expect(() => decodeCursor(encodeRaw('not json at all'))).toThrow(CursorError);
  });

  it('rejects JSON missing the id field', () => {
    expect(() => decodeCursor(encodeRaw(JSON.stringify({ createdAt: PAYLOAD.createdAt })))).toThrow(
      CursorError,
    );
  });

  it('rejects an over-long cursor', () => {
    expect(() => decodeCursor('a'.repeat(513))).toThrow(CursorError);
  });

  it('reports a structured error code', () => {
    try {
      decodeCursor(encodeRaw(JSON.stringify({ createdAt: PAYLOAD.createdAt })));
      expect.unreachable('decodeCursor should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CursorError);
      expect((error as CursorError).code).toBe('CURSOR_PAYLOAD_INVALID');
    }
  });

  it('refuses to encode an invalid payload', () => {
    expect(() => encodeCursor({ createdAt: 'not-a-date', id: 'x' })).toThrow(CursorError);
  });
});

describe('buildCursorPage', () => {
  it('reports no more pages when items equal limit', () => {
    const items = makeItems(3);
    const page = buildCursorPage({ items, limit: 3, toCursorItem });
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(3);
  });

  it('reports more pages when items exceed limit', () => {
    const items = makeItems(4);
    const page = buildCursorPage({ items, limit: 3, toCursorItem });
    expect(page.hasMore).toBe(true);
    expect(page.items).toHaveLength(3);
    expect(decodeCursor(page.nextCursor ?? '')).toEqual(toCursorItem(items[2] as CursorPayload));
  });

  it('reports no more pages when items are fewer than limit', () => {
    const page = buildCursorPage({ items: makeItems(2), limit: 3, toCursorItem });
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('rejects an out-of-range limit', () => {
    expect(() => buildCursorPage({ items: makeItems(1), limit: 0, toCursorItem })).toThrow(RangeError);
    expect(() => buildCursorPage({ items: makeItems(1), limit: 101, toCursorItem })).toThrow(RangeError);
  });

  it('does not alias the caller array', () => {
    const items = makeItems(1);
    const page = buildCursorPage({ items, limit: 1, toCursorItem });
    expect(page.items).not.toBe(items);
  });
});

/** Minimal base64url encoder used to build deliberately invalid cursors. */
function encodeRaw(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}