# @nanking-atlas/database

Prisma schema、迁移、seed 与共享类型。**仅 `apps/api` 可导入**；web/admin 不可直接 import 本包以保持"前端不连数据库"的架构约束。

## 范围

- ⏳ P1-01：建立 `prisma/schema.prisma`，定义 contents/users/places/... 等表与 PostGIS 扩展
- ⏳ P1-01：建立初始版本化迁移，验证空库与已有测试数据都能升级
- ⏳ P1-01：seed 入口（仅 dev，且显著标记"示例/待核验"）

## 边界规则

| 允许 | 禁止 |
| --- | --- |
| `apps/api` import 本包 | `web`/`admin` import 本包 |
| 本包 export 只来自 `src/index.ts` | 本包 import `apps/*` 或 `@nanking-atlas/api` 内部 |
