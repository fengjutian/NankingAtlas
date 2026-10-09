# @nanking-atlas/api-contract

OpenAPI 共享契约包。后端 NestJS API 与前端 web/admin 之间交换的 DTO、错误码、客户端类型都从这里导入。

## 范围

- ✅ P0-04 已落地：错误码枚举与最小错误响应形状（占位）
- ⏳ P1-11 计划：接入 OpenAPI 生成器（`openapi-typescript` 或等价工具），输出真实 DTO 与 fetch 客户端
- ⏳ P1-11 计划：加入 breaking-change 检测（CI 中跑）

## 边界规则

| 允许                                                   | 禁止                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `apps/*`、`packages/*` import 本包                     | 本包 import `apps/*`                                                           |
| 本包导出只来自 `src/index.ts` 与未来 `src/generated/*` | `web`/`admin` import `@nanking-atlas/api` 内部模块或 `@nanking-atlas/database` |

边界规则由根级 ESLint flat config 的 `no-restricted-imports` 强制执行。
