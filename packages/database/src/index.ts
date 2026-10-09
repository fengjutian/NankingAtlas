/**
 * 数据库包入口。
 *
 * P0-04 阶段：本包不导出任何运行时值，仅作为占位与依赖边界检查目标。
 * P1-01 之后将：
 *   - 添加 `prisma/schema.prisma`，定义 contents/users/places/... 等表
 *   - 暴露生成的 PrismaClient 类型
 *   - 提供 seed 入口（仅 dev 标记为"示例/待核验"）
 *
 * 设计原则：
 * - 本包**仅可**被 `apps/api` 导入，**禁止**被 web/admin 直接 import。
 * - 边界规则由根级 ESLint flat config 的 `no-restricted-imports` 强制执行。
 */

export const DATABASE_PACKAGE_NAME = '@nanking-atlas/database' as const;