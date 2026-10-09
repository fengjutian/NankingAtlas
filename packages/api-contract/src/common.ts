import { z } from 'zod';

import { requestIdSchema, type RequestId } from '@nanking-atlas/validation';

/**
 * 幂等键。
 *
 * 用于发布、上传完成确认、批量操作：客户端重试时复用同一个 key，服务端据此
 * 返回首次的结果而不是重复执行。字符集刻意保守（ASCII 字母数字与 `._:-`），
 * 避免日志 / 存储里的转义歧义。
 */
export const idempotencyKeySchema = z.string().min(8).max(255).regex(/^[A-Za-z0-9._:-]+$/u);

/** 弱 ETag，仅接受 `W/"<version>"` 形式。 */
export const ifMatchSchema = z.string().regex(/^W\/"[^"]{1,64}"$/u);

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IF_MATCH_HEADER = 'if-match';
export const REQUEST_ID_HEADER = 'x-request-id';

/** 每个响应都要带的关联 ID。 */
export interface RequestIdHeaders {
  requestId: RequestId;
}

export interface IdempotencyHeaders {
  idempotencyKey: string;
}

/** 解析后的乐观锁条件：原始 If-Match 头 + 用于 409 比对的版本号。 */
export interface VersionHeaders {
  ifMatch: string;
  version: number;
}

export interface SuccessResponse<T> {
  data: T;
  requestId: RequestId;
}

export function createSuccessResponse<T>(data: T, requestId: RequestId): SuccessResponse<T> {
  return { data, requestId };
}

/**
 * 从弱 ETag 解析版本号：`W/"3"` -> `3`。
 *
 * 非法格式抛错而不是回落到 0：把坏 If-Match 当成"版本 0"会让更新静默命中
 * 陈旧版本，违反 AGENTS.md §5.5 的乐观锁要求。
 */
export function parseIfMatchVersion(header: string): number {
  const parsed = ifMatchSchema.safeParse(header);
  if (!parsed.success) {
    throw new TypeError(`If-Match 必须是弱 ETag 形式 W/"<version>"，收到: ${header}`);
  }

  const rawVersion = parsed.data.slice(3, -1);
  const version = Number(rawVersion);

  if (!Number.isSafeInteger(version) || version < 0) {
    throw new TypeError(`If-Match 中的版本号必须是非负安全整数，收到: ${rawVersion}`);
  }

  return version;
}

/** 从请求头构造统一的响应头集合（小写键名，与 Node 的 raw headers 对齐）。 */
export function buildResponseHeaders(requestId: RequestId): Record<string, string> {
  const validated = requestIdSchema.safeParse(requestId);
  if (!validated.success) {
    throw new TypeError('requestId 不符合契约，无法写入响应头');
  }

  return { [REQUEST_ID_HEADER]: validated.data };
}