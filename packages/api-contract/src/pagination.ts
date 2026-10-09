import { z } from 'zod';

/** 列表默认条数（TECHNICAL_IMPLEMENTATION §7.1）。 */
export const DEFAULT_PAGE_SIZE = 20;

/** 单页上限；超过一律拒绝，不做静默截断。 */
export const MAX_PAGE_SIZE = 100;

export const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE);

export const cursorSchema = z.string().min(1).max(512).optional();

/** 游标承载的排序位置：`createdAt` 降序 + `id` 兜底，保证全序且可复现。 */
export interface CursorPayload {
  createdAt: string;
  id: string;
}

const cursorPayloadSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().min(1).max(128),
});

/**
 * 非法游标的结构化错误。
 *
 * 游标是客户端可控输入，解析失败必须能区分原因（base64 损坏 / JSON 损坏 /
 * 载荷字段不合法），否则无法给出可操作的错误提示。
 */
export type CursorErrorCode =
  'CURSOR_BASE64_INVALID' | 'CURSOR_JSON_INVALID' | 'CURSOR_PAYLOAD_INVALID';

export class CursorError extends Error {
  readonly code: CursorErrorCode;

  constructor(code: CursorErrorCode, message: string) {
    super(message);
    this.name = 'CursorError';
    this.code = code;
  }
}

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const BASE64URL_LOOKUP: ReadonlyMap<string, number> = new Map(
  [...BASE64URL_ALPHABET].map((char, index) => [char, index]),
);

/**
 * 该包同时被 web/admin（浏览器）消费，浏览器没有 `Buffer` 也没有
 * `atob` 的稳定类型，因此 base64url 自行实现，只依赖 TextEncoder/TextDecoder。
 */
function base64UrlChar(index: number): string {
  const char = BASE64URL_ALPHABET[index];
  if (char === undefined) {
    throw new RangeError(`base64url 索引越界: ${index}`);
  }
  return char;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const byte0 = bytes[i] ?? 0;
    const hasByte1 = i + 1 < bytes.length;
    const hasByte2 = i + 2 < bytes.length;
    const byte1 = hasByte1 ? (bytes[i + 1] ?? 0) : 0;
    const byte2 = hasByte2 ? (bytes[i + 2] ?? 0) : 0;

    out += base64UrlChar(byte0 >> 2);
    out += base64UrlChar(((byte0 & 0x03) << 4) | (byte1 >> 4));
    if (hasByte1) {
      out += base64UrlChar(((byte1 & 0x0f) << 2) | (byte2 >> 6));
    }
    if (hasByte2) {
      out += base64UrlChar(byte2 & 0x3f);
    }
  }
  return out;
}

function decodeBase64Url(value: string): Uint8Array {
  if (value.length % 4 === 1) {
    throw new CursorError('CURSOR_BASE64_INVALID', '游标长度不是合法的 base64url 长度');
  }

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of value) {
    const sextet = BASE64URL_LOOKUP.get(char);
    if (sextet === undefined) {
      throw new CursorError('CURSOR_BASE64_INVALID', `游标包含非 base64url 字符: ${char}`);
    }
    buffer = (buffer << 6) | sextet;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return Uint8Array.from(bytes);
}

/**
 * 编码游标：base64url(JSON)，无 padding。
 *
 * 刻意不透明——客户端不应解析游标内容，只应原样回传，这样服务端后续可以
 * 自由升级载荷结构而不破坏已发出的链接。
 */
export function encodeCursor(payload: CursorPayload): string {
  const validated = cursorPayloadSchema.safeParse(payload);
  if (!validated.success) {
    throw new CursorError('CURSOR_PAYLOAD_INVALID', '游标载荷不合法，无法编码');
  }

  const json = JSON.stringify({ createdAt: validated.data.createdAt, id: validated.data.id });
  return encodeBase64Url(new TextEncoder().encode(json));
}

/**
 * 解码游标。非法输入一律抛出 {@link CursorError}，**不返回 null** ——
 * 让调用方无法静默忽略坏游标而悄悄退化成第一页。
 */
export function decodeCursor(cursor: string): CursorPayload {
  const lengthChecked = cursorSchema.safeParse(cursor);
  if (!lengthChecked.success || lengthChecked.data === undefined) {
    throw new CursorError('CURSOR_BASE64_INVALID', '游标长度必须在 1..512 之间');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(lengthChecked.data)));
  } catch (error) {
    if (error instanceof CursorError) {
      throw error;
    }
    throw new CursorError('CURSOR_JSON_INVALID', '游标不是合法的 JSON');
  }

  const validated = cursorPayloadSchema.safeParse(parsed);
  if (!validated.success) {
    throw new CursorError('CURSOR_PAYLOAD_INVALID', '游标载荷缺少合法的 createdAt 或 id');
  }

  return { createdAt: validated.data.createdAt, id: validated.data.id };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * 组装游标页。
 *
 * 约定：**多取一条判断 `hasMore` 的职责在调用方（repo 层）**。调用方应查询
 * `limit + 1` 条并把结果原样传入：
 * - 传入条数 > limit → 还有下一页，截断到 limit 条并以最后一条生成 nextCursor；
 * - 传入条数 <= limit → 没有下一页，nextCursor 必须是 null。
 */
export function buildCursorPage<T>(args: {
  items: T[];
  limit: number;
  toCursorItem: (item: T) => CursorPayload;
}): CursorPage<T> {
  const { items, limit, toCursorItem } = args;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new RangeError(`limit 必须是 1..${MAX_PAGE_SIZE} 之间的整数，收到 ${limit}`);
  }

  if (items.length <= limit) {
    return { items: [...items], nextCursor: null, hasMore: false };
  }

  const pageItems = items.slice(0, limit);
  const lastItem = pageItems[limit - 1];
  if (lastItem === undefined) {
    throw new RangeError(`limit=${limit} 时截断结果为空，无法生成 nextCursor`);
  }

  return {
    items: pageItems,
    nextCursor: encodeCursor(toCursorItem(lastItem)),
    hasMore: true,
  };
}

export const cursorQuerySchema = z.object({
  cursor: cursorSchema,
  limit: pageSizeSchema,
});
