import { z } from 'zod';

import { requestIdSchema, type RequestId } from '@nanking-atlas/validation';

/**
 * API 错误码全集（TECHNICAL_IMPLEMENTATION §7.1 + AGENTS.md §4）。
 *
 * 这是数组而不是 Record 的原因：
 * - `z.enum(API_ERROR_CODES)` 需要只读字符串数组；
 * - P1-11 生成 OpenAPI 时需要稳定的顺序来产出 enum 列表；
 * - 遍历 / 断言覆盖全部错误码时无需 `Object.keys()`。
 *
 * 命名规则：只使用大写蛇形；区分大小写。禁止复用同一个 code 表达不同语义，
 * 也禁止为了兼容旧命名保留同义 code（例如 `UNAUTHENTICATED` 已被
 * `UNAUTHORIZED` 取代）。
 */
export const API_ERROR_CODES = [
  // 通用
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  // 内容
  'CONTENT_VERSION_CONFLICT',
  'CONTENT_SLUG_TAKEN',
  'CONTENT_STATE_INVALID',
  // 发布前校验
  'PUBLICATION_NOT_READY',
  // 认证
  'INVALID_CREDENTIALS',
  'TOKEN_EXPIRED',
  'TOKEN_REVOKED',
  'ACCOUNT_DISABLED',
  // 上传
  'UPLOAD_INVALID',
  'UPLOAD_NOT_FOUND',
  'UPLOAD_MIME_MISMATCH',
  'MEDIA_RIGHTS_NOT_CLEARED',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * 错误码 → HTTP 状态码的唯一映射。
 *
 * 分配原则：
 * - 400：请求本身格式/编码不合法（multipart 损坏、扩展名与 MIME 不符）；
 * - 401：缺少或无法证明身份（凭据错误、token 过期 / 吊销）；
 * - 403：身份已知但无权（角色不足、账号被停用）；
 * - 404：资源不存在，或存在但对当前调用方不可见；
 * - 409：与当前资源状态冲突（乐观锁失败、slug 撞车、非法状态跳转）；
 * - 422：请求格式合法但违反业务规则（必填缺失、发布前校验未通过、版权未清）；
 * - 429：限流；
 * - 500：未预期错误；503：依赖不可用。
 */
export const API_ERROR_CODE_HTTP_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  CONTENT_VERSION_CONFLICT: 409,
  CONTENT_SLUG_TAKEN: 409,
  CONTENT_STATE_INVALID: 409,
  PUBLICATION_NOT_READY: 422,
  INVALID_CREDENTIALS: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_REVOKED: 401,
  ACCOUNT_DISABLED: 403,
  UPLOAD_INVALID: 400,
  UPLOAD_NOT_FOUND: 404,
  UPLOAD_MIME_MISMATCH: 400,
  MEDIA_RIGHTS_NOT_CLEARED: 422,
};

/**
 * 错误响应形状：`{ error: { code, message, details?, requestId } }`。
 *
 * - `requestId` 与响应头 `x-request-id` 一致，前端报错时用于报障；
 * - `details` 只放结构化、可序列化的字段级错误信息，禁止塞堆栈或 SQL；
 * - 全部字段可 JSON 序列化，不出现 Date / Map 等运行时类型。
 */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown> | undefined;
    requestId: RequestId;
  };
}

/**
 * 与 {@link ApiErrorResponse} 一一对应的运行时校验。
 *
 * `code` 必须是 {@link API_ERROR_CODES} 内的值，避免前端把任意字符串当错误码
 * 做分支判断；`requestId` 复用 validation 的权威 schema。
 */
export const apiErrorResponseSchema: z.ZodType<ApiErrorResponse> = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string().min(1),
    details: z.record(z.unknown()).optional(),
    requestId: requestIdSchema,
  }),
});

/**
 * 构造错误响应体。
 *
 * `details` 是可选参数且签名上不带 `| undefined`，配合
 * `exactOptionalPropertyTypes` 强制调用方**省略**该参数而不是显式传
 * `undefined`，避免产出 `details: undefined` 这种会污染 JSON 快照的字段。
 */
export function createApiError(
  code: ApiErrorCode,
  message: string,
  requestId: RequestId,
  details?: Record<string, unknown>,
): ApiErrorResponse {
  const error: ApiErrorResponse['error'] =
    details === undefined
      ? { code, message, requestId }
      : { code, message, requestId, details };

  return { error };
}

/**
 * 读取错误码对应的 HTTP 状态码。未知 code 由类型系统挡住，
 * 运行时若被强转绕过则回落到 500（对外不暴露内部细节）。
 */
export function httpStatusForApiErrorCode(code: ApiErrorCode): number {
  return API_ERROR_CODE_HTTP_STATUS[code] ?? 500;
}