/**
 * OpenAPI 共享契约。
 *
 * P0-04 阶段：仅暴露后端与前端约定的错误码枚举与最小响应形状作为占位，
 * 真正的 OpenAPI 生成物（DTO / client）在 P1-11 落地。
 *
 * 设计原则：
 * - 后端 API 与前端 web/admin 只通过本包交换类型与枚举；
 * - 禁止 web/admin 直接 import `@nanking-atlas/api` 内部模块。
 * - 禁止反向：本包不能 import 任何 `@nanking-atlas/api` 内部或 `apps/*`。
 *
 * RequestId 重新导出 `@nanking-atlas/validation` 的 schema，作为前后端 request id
 * 格式契约的权威来源。P0 阶段 `validation` 与 `api-contract` 都依赖 zod；后续
 * P1-11 把 OpenAPI 生成物补全后，本包可改为只导出从 OpenAPI 派生的类型。
 */
export { requestIdSchema, type RequestId } from '@nanking-atlas/validation';

/**
 * API 错误码。所有接口的 error.code 必须取自这里（区分大小写）。
 *
 * 占位集仅供 P0 验证导入链路；具体 code 集合在 P1-04 之后随各接口收敛。
 */
export const API_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONTENT_VERSION_CONFLICT: 'CONTENT_VERSION_CONFLICT',
  PUBLICATION_READINESS_FAILED: 'PUBLICATION_READINESS_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const);

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/**
 * API 错误响应的最小形状。完整 OpenAPI schema 在 P1-11 落地。
 */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    requestId: RequestId;
  };
}
