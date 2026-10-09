/**
 * 数据库包入口（P1-01 落地）。
 *
 * 提供：
 *   - PrismaClient 类型与 enum 的重导出；调用方按需 `import { Prisma, PrismaClient } from '@nanking-atlas/database'`。
 *   - DATABASE_PACKAGE_NAME 常量（用于日志/审计中的来源标识）。
 *   - 共享 DatabaseError 分类（应用层错误 → Prisma 错误码）。
 *
 * 不在本包实例化 PrismaClient：实例化由 apps/api/src/lib/prisma.ts 完成，
 * 以避免 NestJS 热重载产生多 client 库连接。schema 与迁移同样在本包内（prisma/）。
 *
 * 边界规则：本包**仅可**被 apps/api 导入；web/admin 禁止 import。
 * 由 ESLint `no-restricted-imports` 强制执行（参见 packages/eslint-config/boundaries.js）。
 */

// 必须先跑 `pnpm --filter @nanking-atlas/database prisma:generate` 才会有可解析的类型。
// 生成位置：packages/database/node_modules/.prisma/client（参见 schema.prisma）。
export type {
  PrismaClient,
  Prisma,
  UserRole,
  ContentType,
  ContentStatus,
  Language,
  VerificationStatus,
  PlaceAccuracy,
  SourceKind,
  MediaRightsStatus,
  MediaUsage,
  ReviewActionKind,
  RelationType,
} from '@prisma/client';

export { DATABASE_PACKAGE_NAME } from './constants.js';
export { DatabaseError, DatabaseErrorCode } from './errors.js';
export { isUniqueConstraintError, isForeignKeyConstraintError } from './prisma-errors.js';