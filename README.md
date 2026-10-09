# Nanking Atlas（金陵风物志）

南京城市文化数字档案、互动街巷地图与城市生活记录平台。

## 项目文档

- [产品需求基线](docs/PRODUCT_REQUIREMENTS.md)：用户提供的原始完整需求，作为范围与验收依据。
- [技术实现方案](docs/TECHNICAL_IMPLEMENTATION.md)：架构决策、数据模型、接口、安全、测试、部署与阶段交付方案。
- [开发任务清单](docs/IMPLEMENTATION_BACKLOG.md)：可直接领取、逐项验收的工程任务。
- [AI 开发约束](AGENTS.md)：MiniMax 及其他编码代理必须遵循的强制规则。
- [MiniMax 开发执行手册](docs/MINIMAX_IMPLEMENTATION_GUIDE.md)：可直接交给 MiniMax 的执行流程、提示词、门禁和交付模板。

## 当前状态

P0-01 ~ P0-09 已交付：三应用骨架、共享 strict 配置与依赖边界、CI、品牌 tokens、响应式 shell、公开站静态首页、API request-id / 健康检查 / 结构化日志、本地启动文档。`pnpm format:check / lint / typecheck / test / build` 在本机全过。

P1-01.a 已落盘：Prisma schema（P1 全部 25 张表）、`@nanking-atlas/database` Prisma client 承载层、`apps/api` Prisma 单例与 `DATABASE_URL` 校验、`docker-compose.yml`（PostGIS 16-3.4 + pg_trgm / citext / pgcrypto）。**实跑迁移尚未在本机完成**（Docker daemon 未启动，AGENTS.md §1.1 要求显式区分"已落盘"与"已实跑验证"）。下一项是 P1-02（users / roles / 登录 / 刷新 / 登出 / 限流）。

## 仓库结构

```text
apps/
  web/                 # Next.js 公开站
  admin/               # Vite + React 管理后台
  api/                 # NestJS API
packages/
  eslint-config/       # 共享 ESLint flat config
  tsconfig/            # 共享 strict TypeScript 配置
  database/            # Prisma schema、迁移与 client 单例（P1-01.a 起）
docker/
  postgres/init/       # docker compose 启动时自动执行的扩展启用脚本
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

### 本地启动 PostgreSQL/PostGIS（P1-01.a 落盘）

数据层使用 `postgis/postgis:16-3.4` 镜像，默认端口 `5432`，启用扩展：`postgis` / `pg_trgm` / `citext` / `pgcrypto` / `uuid-ossp`。默认开发凭据：

| 字段 | 默认值 |
| --- | --- |
| `POSTGRES_DB` | `nanking_atlas` |
| `POSTGRES_USER` | `nanking_atlas` |
| `POSTGRES_PASSWORD` | `nanking_atlas` |
| `POSTGRES_PORT` | `5432` |

启动本地数据库：

```bash
docker compose up -d postgres
docker compose ps        # 等待 healthcheck=healthy
docker compose logs postgres | grep -i 'database system is ready'
```

覆盖默认凭据：在仓库根建 `.env`（已被 `.gitignore` 忽略），写入：

```dotenv
POSTGRES_PASSWORD=<本地随机串>
POSTGRES_PORT=5432
```

随后生成 Prisma client 并跑迁移：

```bash
pnpm --filter @nanking-atlas/database prisma:generate
pnpm --filter @nanking-atlas/database prisma:migrate:dev
```

`apps/api/.env` 中的 `DATABASE_URL` 必须与 docker-compose 凭据一致（见 `apps/api/.env.example`）。**P1-01.a 阶段未实跑迁移**——`schema.prisma` 与 init SQL 已写入，但本机 Docker daemon 不可用，`prisma migrate dev` 验证留待 P1-01.b（实跑迁移与连通性）。

集成测试时另起一个测试库：

```bash
docker compose exec postgres createdb -U nanking_atlas nanking_atlas_test
DATABASE_URL=postgresql://nanking_atlas:nanking_atlas@localhost:5432/nanking_atlas_test?schema=public \
  pnpm --filter @nanking-atlas/database prisma:migrate:deploy
```

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
5. `test` — `pnpm test`（P1-01.b 起追加 `postgis/postgis:16-3.4` service container + DATABASE_URL 注入）
6. `build` — `pnpm build`，产物上传为 artifact
7. `secret-scan` — gitleaks（AGENTS.md §4.6：禁止提交真实密钥）

合并前 6 步全部必须通过。P0 阶段 `secret-scan` 是只读基线，命中即失败。
