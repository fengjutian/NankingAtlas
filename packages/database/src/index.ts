/**
 * 数据库包入口（SQLite 方案 P1-01.a 落地）。
 *
 * 提供：
 *   - PrismaClient 类型与值的重导出；调用方按需 `import { PrismaClient } from '@nanking-atlas/database'`。
 *   - 应用层 enum 字面量联合（来自 ./enums.ts，因为 SQLite 没有原生 ENUM）。
 *   - DATABASE_PACKAGE_NAME 常量（用于日志/审计中的来源标识）。
 *   - 共享 DatabaseError 分类 + Prisma 错误码识别工具。
 *
 * 不在本包实例化 PrismaClient：实例化由 apps/api/src/lib/prisma.ts 完成，
 * 以避免 NestJS 热重载产生多 client 库连接。schema 与迁移同样在本包内（prisma/）。
 *
 * 边界规则：本包**仅可**被 apps/api 导入；web/admin 禁止 import。
 * 由 ESLint `no-restricted-imports` 强制执行（参见 packages/eslint-config/boundaries.js）。
 */

// 必须先跑 `pnpm --filter @nanking-atlas/database prisma:generate` 才会有可解析的类型。
// 生成位置：packages/database/node_modules/.prisma/client（参见 schema.prisma）。
//
// PrismaClient 既是类型也是值（class），分别 re-export。
// 类型侧由 `import type` 消费；值侧由 apps/api/src/lib/prisma.ts 的单例包装函数 new。
export { PrismaClient } from '@prisma/client';

export {
  USER_ROLES,
  CONTENT_TYPES,
  CONTENT_STATUSES,
  LANGUAGES,
  VERIFICATION_STATUSES,
  PLACE_ACCURACIES,
  SOURCE_KINDS,
  MEDIA_RIGHTS_STATUSES,
  MEDIA_USAGES,
  REVIEW_ACTION_KINDS,
  RELATION_TYPES,
} from './enums.js';
export type {
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
} from './enums.js';

export { DATABASE_PACKAGE_NAME } from './constants.js';
export { DatabaseError, DatabaseErrorCode } from './errors.js';
export { isUniqueConstraintError, isForeignKeyConstraintError } from './prisma-errors.js';