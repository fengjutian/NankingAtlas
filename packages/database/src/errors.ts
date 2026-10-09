/**
 * 数据库层错误类型。
 *
 * 仅作为应用层到 HTTP 层的错误契约，不直接代表 Prisma 原生错误。
 * Prisma 抛出的 PrismaClientKnownRequestError 由 ./prisma-errors.js 的判定函数识别。
 */

export enum DatabaseErrorCode {
  UNIQUE_VIOLATION = 'DB_UNIQUE_VIOLATION',
  FOREIGN_KEY_VIOLATION = 'DB_FOREIGN_KEY_VIOLATION',
  NOT_FOUND = 'DB_NOT_FOUND',
  VERSION_CONFLICT = 'DB_VERSION_CONFLICT',
  UNKNOWN = 'DB_UNKNOWN',
}

export class DatabaseError extends Error {
  public readonly code: DatabaseErrorCode;
  public readonly cause?: unknown;

  constructor(code: DatabaseErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.cause = cause;
  }
}
