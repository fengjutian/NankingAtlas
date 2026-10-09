# @nanking-atlas/validation

可跨 web/admin/api 共享的纯校验规则（zod schema）。仅依赖 zod，不依赖任何应用或运行时（无 fetch / fs / DOM）。

## 范围

- ✅ P0-04：`APP_ENV`、`slugSchema`、`requestIdSchema`
- ⏳ P1：扩展为 `contentTypeSchema` / `contentStatusSchema` / `LocationAccuracy` / `VerificationStatus` / `RightsStatus` 等枚举
- ⏳ P1：DTO 级别的复合 schema（`createContentInput`、`publicationReadinessInput` 等）放这里还是放 `api-contract`？P1-04 决定

## 边界规则

| 允许                                          | 禁止                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| web / admin / api / 其他 packages import 本包 | 本包 import `@nanking-atlas/api`、`@nanking-atlas/database`、`@nanking-atlas/api-contract`（本包应在依赖链最底层） |
| 本包仅依赖 zod                                | 本包 import 任何 `apps/*`                                                                                          |
