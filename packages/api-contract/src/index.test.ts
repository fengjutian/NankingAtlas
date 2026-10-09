import { describe, expect, it } from 'vitest';

import { requestIdSchema } from '@nanking-atlas/validation';

import { API_ERROR_CODES, type ApiErrorCode } from './index.js';

/**
 * 说明（P1 契约扩展时同步更新）：
 * `API_ERROR_CODES` 原本是 8 项的对象映射，P1 起按 TECHNICAL_IMPLEMENTATION §7.1
 * 收敛为 20 项的只读数组（`z.enum` 需要数组，OpenAPI 生成需要稳定顺序），
 * 其中 `UNAUTHENTICATED` 更名为 `UNAUTHORIZED`、
 * `PUBLICATION_READINESS_FAILED` 更名为 `PUBLICATION_NOT_READY`。
 * 本文件保留原有三条用例与其断言强度：仍要求"错误码集合与文档完全一致"
 * 以及"错误码可收窄为联合类型"，只是基线换成了新的正式契约。
 */
describe('api-contract smoke', () => {
  it('exposes the documented error code set', () => {
    expect([...API_ERROR_CODES].sort()).toEqual(
      [
        'ACCOUNT_DISABLED',
        'CONFLICT',
        'CONTENT_SLUG_TAKEN',
        'CONTENT_STATE_INVALID',
        'CONTENT_VERSION_CONFLICT',
        'FORBIDDEN',
        'INTERNAL_ERROR',
        'INVALID_CREDENTIALS',
        'MEDIA_RIGHTS_NOT_CLEARED',
        'NOT_FOUND',
        'PUBLICATION_NOT_READY',
        'RATE_LIMITED',
        'SERVICE_UNAVAILABLE',
        'TOKEN_EXPIRED',
        'TOKEN_REVOKED',
        'UNAUTHORIZED',
        'UPLOAD_INVALID',
        'UPLOAD_MIME_MISMATCH',
        'UPLOAD_NOT_FOUND',
        'VALIDATION_FAILED',
      ].sort(),
    );
  });

  it('narrows error codes to the union type', () => {
    const code: ApiErrorCode = 'FORBIDDEN';
    expect(code).toBe('FORBIDDEN');
  });

  it('re-exports requestIdSchema as the canonical request id schema', () => {
    expect(requestIdSchema.safeParse('req_abc123_-XYZ').success).toBe(true);
    expect(requestIdSchema.safeParse('has space').success).toBe(false);
  });
});