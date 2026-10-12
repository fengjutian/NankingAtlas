import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_SIZE,
  InvalidCursorError,
  MAX_PAGE_SIZE,
  buildCursorPage,
  decodeCursor,
  encodeCursor,
} from './cursor.js';

/**
 * 服务端游标编解码单测。
 *
 * 其中「格式固定」那组断言是**跨包契约**：本仓库的浏览器侧游标实现在
 * `packages/api-contract/src/pagination.ts`（手写 base64url），而仓库边界
 * 规则禁止 api 依赖 api-contract，所以两侧各有一份实现。用固定期望字符串锁住
 * 服务端这一侧的字节格式 —— 任何一边改动格式都会让对应测试变红。
 */

const SAMPLE = { createdAt: '2026-01-01T00:00:00.000Z', id: 'abc' } as const;

/** 与 `api-contract` 手写实现输出一致的固定值（base64url(JSON)，无 padding）。 */
const SAMPLE_ENCODED = 'eyJjcmVhdGVkQXQiOiIyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCJpZCI6ImFiYyJ9';

describe('游标格式与 api-contract 保持字节兼容', () => {
  it('编码结果等于固定的 base64url 字符串', () => {
    expect(encodeCursor(SAMPLE)).toBe(SAMPLE_ENCODED);
  });

  it('编码结果只含 base64url 字符且无 padding', () => {
    const encoded = encodeCursor(SAMPLE);
    expect(encoded).not.toContain('=');
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('可以解码回原载荷（往返一致）', () => {
    expect(decodeCursor(SAMPLE_ENCODED)).toEqual({ createdAt: SAMPLE.createdAt, id: SAMPLE.id });
  });

  it('编码字段顺序固定为 createdAt 在前、id 在后', () => {
    // api-contract 侧 JSON.stringify 的键序同样是 { createdAt, id }；
    // 顺序变了就会产生不同的字节，破坏已发出的链接。
    expect(SAMPLE_ENCODED).toBe(
      Buffer.from(`{"createdAt":"${SAMPLE.createdAt}","id":"${SAMPLE.id}"}`, 'utf8').toString(
        'base64url',
      ),
    );
  });
});

describe('decodeCursor 拒绝非法输入（绝不静默退化成第一页）', () => {
  it('空字符串 / 超长 → CURSOR_BASE64_INVALID', () => {
    expect(() => decodeCursor('')).toThrow(InvalidCursorError);
    expect(() => decodeCursor('a'.repeat(513))).toThrow(InvalidCursorError);
  });

  it('含非 base64url 字符 → CURSOR_BASE64_INVALID', () => {
    // Node 的 base64url 解码是宽松的（会跳过非法字符），必须先正则挡住，
    // 否则 '%%%' 会被解成空串并落到 CURSOR_JSON_INVALID，报错信息失真。
    expect(() => decodeCursor('%%%')).toThrow(/非 base64url 字符/);
    expect(() => decodeCursor('abc+def')).toThrow(/非 base64url 字符/);
    expect(() => decodeCursor('abc/def')).toThrow(/非 base64url 字符/);
  });

  it('合法 base64url 但不是 JSON → CURSOR_JSON_INVALID', () => {
    expect(() => decodeCursor(Buffer.from('not json', 'utf8').toString('base64url'))).toThrow(
      /不是合法的 JSON/,
    );
  });

  it('JSON 但载荷缺字段 → CURSOR_PAYLOAD_INVALID', () => {
    const noId = Buffer.from('{"createdAt":"2026-01-01T00:00:00.000Z"}', 'utf8').toString(
      'base64url',
    );
    expect(() => decodeCursor(noId)).toThrow(/缺少合法的 createdAt 或 id/);

    const badTime = Buffer.from('{"createdAt":"昨天","id":"abc"}', 'utf8').toString('base64url');
    expect(() => decodeCursor(badTime)).toThrow(/缺少合法的 createdAt 或 id/);
  });

  it('错误码可用于日志分类', () => {
    try {
      decodeCursor('%%%');
      expect.unreachable('应当抛出 InvalidCursorError');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCursorError);
      expect((error as InvalidCursorError).code).toBe('CURSOR_BASE64_INVALID');
    }
  });
});

describe('encodeCursor 拒绝非法载荷', () => {
  it('缺少字段或时间格式不对时报 CURSOR_PAYLOAD_INVALID', () => {
    expect(() => encodeCursor({ createdAt: 'nope', id: 'abc' })).toThrow(InvalidCursorError);
    expect(() => encodeCursor({ createdAt: SAMPLE.createdAt } as never)).toThrow(
      InvalidCursorError,
    );
  });
});

describe('buildCursorPage', () => {
  const toCursorItem = (item: { no: number }) => ({
    createdAt: '2026-01-01T00:00:00.000Z',
    id: String(item.no),
  });

  it('条数 <= limit 时没有下一页且 nextCursor 为 null', () => {
    const page = buildCursorPage({ items: [{ no: 1 }, { no: 2 }], limit: 5, toCursorItem });
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('条数 > limit 时截断并以最后一条生成游标', () => {
    const page = buildCursorPage({
      items: [{ no: 3 }, { no: 2 }, { no: 1 }],
      limit: 2,
      toCursorItem,
    });
    expect(page.items.map((item) => item.no)).toEqual([3, 2]);
    expect(page.hasMore).toBe(true);
    expect(decodeCursor(page.nextCursor ?? '')).toEqual({
      createdAt: '2026-01-01T00:00:00.000Z',
      id: '2',
    });
  });

  it('恰好等于 limit 时仍视为没有下一页（调用方须多取一条）', () => {
    const page = buildCursorPage({ items: [{ no: 1 }, { no: 2 }], limit: 2, toCursorItem });
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('limit 越界直接抛 RangeError，不静默截断', () => {
    expect(() => buildCursorPage({ items: [], limit: 0, toCursorItem })).toThrow(RangeError);
    expect(() => buildCursorPage({ items: [], limit: MAX_PAGE_SIZE + 1, toCursorItem })).toThrow(
      RangeError,
    );
    expect(() => buildCursorPage({ items: [], limit: 1.5, toCursorItem })).toThrow(RangeError);
  });

  it('默认值与技术方案 §7.1 一致：默认 20、最大 100', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    expect(MAX_PAGE_SIZE).toBe(100);
  });
});
