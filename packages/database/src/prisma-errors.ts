/**
 * Prisma 错误识别工具。
 *
 * PrismaClientKnownRequestError 的 code 取值见：
 *   https://www.prisma.io/docs/orm/reference/error-reference#error-codes
 *
 * 仅识别 schema.prisma 中已使用到的几种；新增类型时再补。
 */

interface MaybePrismaKnownError {
  code?: string;
  meta?: Record<string, unknown>;
  name?: string;
}

function isPrismaKnownError(err: unknown): err is MaybePrismaKnownError & { code: string } {
  return Boolean(
    err &&
    typeof err === 'object' &&
    'code' in (err as MaybePrismaKnownError) &&
    typeof (err as MaybePrismaKnownError).code === 'string' &&
    (err as MaybePrismaKnownError).name === 'PrismaClientKnownRequestError',
  );
}

/** P2002 — unique constraint violation。用于 409 CONFLICT。 */
export function isUniqueConstraintError(err: unknown): boolean {
  return isPrismaKnownError(err) && err.code === 'P2002';
}

/** P2003 — foreign key constraint violation。用于 409 / 400。 */
export function isForeignKeyConstraintError(err: unknown): boolean {
  return isPrismaKnownError(err) && err.code === 'P2003';
}
