# Nanking Atlas（金陵风物志）

南京城市文化数字档案、互动街巷地图与城市生活记录平台。

## 项目文档

- [产品需求基线](docs/PRODUCT_REQUIREMENTS.md)：用户提供的原始完整需求，作为范围与验收依据。
- [技术实现方案](docs/TECHNICAL_IMPLEMENTATION.md)：架构决策、数据模型、接口、安全、测试、部署与阶段交付方案。
- [开发任务清单](docs/IMPLEMENTATION_BACKLOG.md)：可直接领取、逐项验收的工程任务。
- [AI 开发约束](AGENTS.md)：MiniMax 及其他编码代理必须遵循的强制规则。
- [MiniMax 开发执行手册](docs/MINIMAX_IMPLEMENTATION_GUIDE.md)：可直接交给 MiniMax 的执行流程、提示词、门禁和交付模板。

## 当前状态

P0-01 ~ P0-09 已交付：三应用骨架、共享 strict 配置与依赖边界、CI、品牌 tokens、响应式 shell、公开站静态首页、API request-id / 健康检查 / 结构化日志、本地启动文档。

**P1-01 ~ P1-10 已实现并通过验证**（SQLite 方案，见下方"数据层"章节的功能差异说明）：

| 任务  | 内容                                                              | 验证                                   |
| ----- | ----------------------------------------------------------------- | -------------------------------------- |
| P1-01 | Prisma schema（25 表）+ 迁移 + seed                               | `migrate deploy` 在空库成功；seed 幂等 |
| P1-02 | Argon2id 密码、登录/刷新/登出、refresh 旋转与重放检测、限流       | 23 条集成用例                          |
| P1-03 | AuthGuard（401）+ RolesGuard（403，fail-closed）                  | 401/403 真实 HTTP 断言                 |
| P1-04 | 内容 CRUD + 7 种类型扩展 + slug + 乐观锁（409）+ 软删除           | 并发更新 409 断言                      |
| P1-05 | sources / relations / tags + 自关联与重复拒绝                     | 完整性约束断言                         |
| P1-06 | Tiptap JSON 白名单 + 安全渲染（`@nanking-atlas/validation`）      | 59 条用例（XSS / `javascript:` 绕过）  |
| P1-07 | revisions / review_actions / audit_logs 事务内只增                | 事务一致性断言                         |
| P1-08 | 状态机 + 退回理由 + publication readiness（422 结构化）           | 非法流转 403；缺来源 422               |
| P1-09 | upload intent + 对象确认 + MIME 魔数 / 版权校验                   | 21 条校验用例                          |
| P1-10 | 后台列表、编辑器八区、自动保存（debounce + 并发保护）、冲突对话框 | 67 条用例                              |
| P1-11 | OpenAPI 生成与 breaking-change 检查                               | 见 CI                                  |

**P1-11（OpenAPI）尚在进行中。** 下一阶段为 P2（公开站真实数据接入、SEO、revalidation）。

## 仓库结构

```text
apps/
  web/                 # Next.js 公开站
  admin/               # Vite + React 管理后台
  api/                 # NestJS API
packages/
  eslint-config/       # 共享 ESLint flat config
  tsconfig/            # 共享 strict TypeScript 配置
  database/            # Prisma schema、迁移与 client 单例（P1-01.a 起，SQLite 方案）
docs/
  PRODUCT_REQUIREMENTS.md
  TECHNICAL_IMPLEMENTATION.md
  IMPLEMENTATION_BACKLOG.md
  MINIMAX_IMPLEMENTATION_GUIDE.md
```

依赖方向固定为 `apps → packages`，`packages` 之间禁止环依赖。

## 本地开发（P0-01 ~ P0-03 完成态）

环境要求：

- Node.js `>= 20.18 < 25`（参见 `.nvmrc`）
- pnpm `>= 11`（参见 `package.json#packageManager`）

```bash
# 1. 安装依赖（启用 pnpm 工作区）
pnpm install

# 2. 复制每个应用的环境变量样例（开发环境默认值，仅本地）
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local

# 3. 根级质量命令（Turbo 编排）
pnpm format:check   # Prettier 校验
pnpm lint           # ESLint
pnpm typecheck      # TypeScript strict
pnpm test           # Vitest
pnpm build          # 构建三个应用

# 4. 并行启动三个应用的 dev server（web/admin/api）
pnpm dev
```

各应用独立运行：

```bash
pnpm --filter @nanking-atlas/web dev
pnpm --filter @nanking-atlas/admin dev
pnpm --filter @nanking-atlas/api start:dev
```

### 本地 API 健康检查与 Request ID（P0-08 落盘）

API 监听 `API_PORT`（默认 `4000`），同时暴露两组端点：

| 端点                | 用途                                              | 前缀           |
| ------------------- | ------------------------------------------------- | -------------- |
| `GET /health/live`  | 仅证明进程存活（k8s liveness）                    | 不带 `/api/v1` |
| `GET /health/ready` | 启动期就绪检查，附带 `appEnv` 与 `checks.process` | 不带 `/api/v1` |
| 业务端点            | 受 `/api/v1` 前缀约束                             | `/api/v1/...`  |

最小冒烟（API dev 启动后另开终端）：

```bash
curl -s http://localhost:4000/health/live | head -c 200
curl -s http://localhost:4000/health/ready | head -c 200
```

Request ID 默认读取请求头 `x-request-id`，缺失时由 API 生成 16 字节 base64url。响应头会原样回传（命中客户端传入则复用）：

```bash
curl -i -H 'x-request-id: dev-smoke-001' http://localhost:4000/health/ready | head -n 20
```

所有请求都会通过 `nestjs-pino` 写出结构化日志（dev 环境 `pino-pretty`，prod JSON），日志级别由 `LOG_LEVEL` 控制。客户端传入的 request id 会随每条日志一起出现。

### 本地数据库（SQLite 方案，P1-01.a 落盘）

数据层使用 Prisma SQLite provider，**无 Docker / 无 PostGIS / 无 pg_trgm**。
数据库文件由 Prisma 在首次 `migrate dev` 时创建。默认路径：

| 文件     | 路径                               | 用途                     |
| -------- | ---------------------------------- | ------------------------ |
| 本地开发 | `packages/database/prisma/dev.db`  | 默认 DATABASE_URL 指向   |
| 单测     | `packages/database/prisma/test.db` | vitest 注入；CI 即用即丢 |

生成 client + 迁移：

```bash
pnpm --filter @nanking-atlas/database prisma:generate
pnpm --filter @nanking-atlas/database prisma:migrate:dev --name init
```

P1-01.b 起会生成：

- `packages/database/prisma/dev.db` —— 本地开发库
- `packages/database/prisma/migrations/<timestamp>_init/migration.sql` —— 首个迁移
- `packages/database/prisma/migrations/migration_lock.toml` —— Prisma 迁移锁

集成测试库（CI 与 Vitest）按相同路径生成 `test.db`，命令：

```bash
DATABASE_URL='file:./test.db' pnpm --filter @nanking-atlas/database prisma:migrate:deploy
```

P1-02 起 seed 填充演示数据。全部标注「示例 / 待核验」，状态一律 `DRAFT`（**未发布**），坐标留空、来源标 `未核验`：

```bash
pnpm --filter @nanking-atlas/database seed
```

演示账号（仅本地与 CI，生产禁止执行 seed）：

| 邮箱                  | 角色     | 密码                      |
| --------------------- | -------- | ------------------------- |
| `admin@demo.local`    | ADMIN    | `nanking-atlas-demo-2026` |
| `reviewer@demo.local` | REVIEWER | `nanking-atlas-demo-2026` |
| `editor@demo.local`   | EDITOR   | `nanking-atlas-demo-2026` |

seed 是幂等的：`seed-auth.integration.spec.ts` 通过子进程跑真实 seed 命令验证，并校验 seed 与 API 的 Argon2id 参数一致 —— 不一致则登录失败。

### 测试

```bash
pnpm test                # 单元测试
pnpm test:integration    # API 集成测试（真实 SQLite 库 + 全局守卫 + 异常过滤器）
```

集成测试由 `apps/api/test/global-setup.ts` 在**空库上执行真实迁移 SQL** 建库，验证「迁移可在全新数据库执行」（AGENTS.md §7.5）。

应用层 enum：因 SQLite 没有原生 ENUM，所有 enum 列实际存为 String。
应用层通过 `@nanking-atlas/database` 的字面量联合 + zod 校验保证取值范围
（见 `packages/database/src/enums.ts`）。

**与 PostgreSQL 版本的功能差异**（需要在 P3 任务里补偿）：

- 无空间查询：`places.lon / lat` 浮点列；P3 地图的 bbox 检索改用 SQLite R*Tree 虚表（在 P3 子任务里单独写 migration）。
- 无 pg_trgm 中文相似度：P3 搜索降级为 LIKE + 应用层分词；FTS5 留作 P3 子任务。
- 无 UUID / citext / pgcrypto：id 改 `cuid()`，email 应用层 lowercase。

## 阶段门禁

- P0 门禁：三个应用可独立运行；根级质量命令通过；开发配置无秘密。
- P1 门禁：真实数据库和服务端权限有效；审核发布链路通过集成/E2E；审计可追溯。
- P2 门禁：发布内容从后台到公开站闭环；SEO、撤回和响应式验证通过。
- P3 门禁：真实 PostGIS bbox 查询；地图/列表联动和失败降级通过。
- P4 门禁：安全、性能、监控、备份恢复和上线 runbook 有真实证据。

前一阶段未满足时，可以为后续做不破坏兼容性的准备，但不能宣称后续阶段已经交付。

## CI

PR 与 push 到 `main` 都会触发 `.github/workflows/ci.yml`：

1. `install` — `pnpm install --frozen-lockfile`
2. `format` — `pnpm format:check`
3. `lint` — `pnpm lint`（含跨包依赖边界 `no-restricted-imports`）
4. `typecheck` — `pnpm typecheck`
5. `test` — `pnpm test`（P1-01.a 起：SQLite 方案无需 service container；DATABASE_URL 由 job env 注入 `file:./packages/database/prisma/test.db`）
6. `build` — `pnpm build`，产物上传为 artifact
7. `secret-scan` — gitleaks（AGENTS.md §4.6：禁止提交真实密钥）

合并前 6 步全部必须通过。P0 阶段 `secret-scan` 是只读基线，命中即失败。
