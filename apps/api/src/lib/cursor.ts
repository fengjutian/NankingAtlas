import { z } from 'zod';

/**
 * 服务端游标编解码（技术方案 §7.1「列表采用游标分页；默认 20，最大 100」）。
 *
 * ## 为什么这里有一份独立实现
 *
 * 仓库边界规则（`packages/eslint-config/boundaries.js` + AGENTS.md §6.3）明确
 * **API 不得依赖 `@nanking-atlas/api-contract`** —— 依赖方向是「api 生成契约，
 * web/admin 消费契约」。而 `api-contract` 里已有一份等价的游标实现
 * （`packages/api-contract/src/pagination.ts`），那份是给浏览器侧用的手写
 * base64url，因为浏览器没有 `Buffer`。
 *
 * 两份实现**必须字节兼容**：载荷固定为 `base64url(JSON)`，无 padding，
 * 字符集 `A-Za-z0-9-_`。Node 的 `Buffer.toString('base64url')` 正是这一格式，
 * 与手写实现输出一致。`cursor.test.ts` 用固定期望值锁住这一点 —— 任何一边改动
 * 格式都会让那边的测试变红。
 */

/** 与 `api-contract` / `apps/api/src/openapi.ts` 保持一致。 */
export const DEFAULT_PAGE_SIZE = 20;

/** 单页上限；超过一律拒绝，不做静默截断。 */
export const MAX_PAGE_SIZE = 100;

export interface CursorPayload {
  createdAt: string;
  id: string;
}

export type CursorErrorCode = 'CURSOR_BASE64_INVALID' | 'CURSOR_JSON_INVALID' | 'CURSOR_PAYLOAD_INVALID';

/** 游标不合法。调用方（异常过滤器）应映射为 400 VALIDATION_FAILED。 */
export class InvalidCursorError extends Error {
  readonly code: CursorErrorCode;

  constructor(code: CursorErrorCode, message: string) {
    super(message);
    this.name = 'InvalidCursorError';
    this.code = code;
  }
}

const cursorPayloadSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().min(1).max(128),
});

/**
 * 编码游标：`base64url(JSON)`，无 padding。
 *
 * 载荷刻意不透明 —— 客户端不应解析，只应原样回传，服务端后续才能自由升级
 * 结构而不破坏已发出的链接。
 */
export function encodeCursor(payload: CursorPayload): string {
  const validated = cursorPayloadSchema.safeParse(payload);
  if (!validated.success) {
    throw new InvalidCursorError('CURSOR_PAYLOAD_INVALID', '游标载荷不合法，无法编码');
  }
  return Buffer.from(
    JSON.stringify({ createdAt: validated.data.createdAt, id: validated.data.id }),
    'utf8',
  ).toString('base64url');
}

/**
 * 解码游标。非法输入一律抛出 {@link InvalidCursorError}，**不返回 null** ——
 * 让调用方无法静默忽略坏游标而悄悄退化成第一页。
 */
export function decodeCursor(cursor: string): CursorPayload {
  if (cursor.length < 1 || cursor.length > 512) {
    throw new InvalidCursorError('CURSOR_BASE64_INVALID', '游标长度必须在 1..512 之间');
  }
  // Node 的 base64url 解码是宽松的：会跳过非法字符。先用严格正则挡住，
  // 否则 `%%%` 这类输入会被解成空串并落到下一个分支，报错信息失真。
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new InvalidCursorError('CURSOR_BASE64_INVALID', '游标包含非 base64url 字符');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      throw error;
    }
    throw new InvalidCursorError('CURSOR_JSON_INVALID', '游标不是合法的 JSON');
  }

  const validated = cursorPayloadSchema.safeParse(parsed);
  if (!validated.success) {
    throw new InvalidCursorError('CURSOR_PAYLOAD_INVALID', '游标载荷缺少合法的 createdAt 或 id');
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
 * 约定：**多取一条判断 `hasMore` 的职责在调用方（查询层）**。调用方应查询
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