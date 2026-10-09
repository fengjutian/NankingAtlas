/**
 * OpenAPI 共享契约。
 *
 * P1 阶段：承载跨 app 的共享类型与 zod 契约 —— 统一错误码、游标分页、
 * 幂等 / 乐观锁请求头、成功响应包装。P1-11 会在此基础上补全 DTO 与生成客户端。
 *
 * 设计原则：
 * - 后端 API 与前端 web/admin 只通过本包交换类型与枚举；
 * - 禁止 web/admin 直接 import `@nanking-atlas/api` 内部模块。
 * - 禁止反向：本包不能 import 任何 `@nanking-atlas/api` 内部或 `apps/*`。
 * - 对外类型必须可 JSON 序列化：时间统一用 ISO `string`，不出现 `Date`。
 *
 * `requestIdSchema` / `RequestId` 继续从 `@nanking-atlas/validation` 透传，
 * 保持 P0 起就固定的前后端 request id 契约来源不变。
 */
export { requestIdSchema } from '@nanking-atlas/validation';
export type { RequestId } from '@nanking-atlas/validation';

export {
  API_ERROR_CODE_HTTP_STATUS,
  API_ERROR_CODES,
  apiErrorResponseSchema,
  createApiError,
  httpStatusForApiErrorCode,
  type ApiErrorCode,
  type ApiErrorResponse,
} from './errors.js';

export {
  CursorError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildCursorPage,
  cursorQuerySchema,
  cursorSchema,
  decodeCursor,
  encodeCursor,
  pageSizeSchema,
  type CursorErrorCode,
  type CursorPage,
  type CursorPayload,
} from './pagination.js';

export {
  IDEMPOTENCY_KEY_HEADER,
  IF_MATCH_HEADER,
  REQUEST_ID_HEADER,
  buildResponseHeaders,
  createSuccessResponse,
  idempotencyKeySchema,
  ifMatchSchema,
  parseIfMatchVersion,
  type IdempotencyHeaders,
  type RequestIdHeaders,
  type SuccessResponse,
  type VersionHeaders,
} from './common.js';

// ---------------------------------------------------------------------------
// P1-11：OpenAPI 生成契约
//
// `generated/api-client.ts` 由 `apps/api/scripts/generate-openapi.ts` 从
// `apps/api/src/openapi.ts` 推导产出，禁止手工编辑。
//
// 追加而非替换：上面所有手写导出保持不变，向后兼容；web/admin 应优先从本包
// 导入 DTO 类型（AGENTS.md §6.3「跨应用类型来自 OpenAPI 生成契约」）。
// ---------------------------------------------------------------------------

export * from './generated/api-client.js';
