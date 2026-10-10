# Nanking Atlas（金陵风物志）

南京城市文化数字档案、互动街巷地图与城市生活记录平台。

## 项目文档

- [产品需求基线](docs/PRODUCT_REQUIREMENTS.md)：用户提供的原始完整需求，作为范围与验收依据。
- [技术实现方案](docs/TECHNICAL_IMPLEMENTATION.md)：架构决策、数据模型、接口、安全、测试、部署与阶段交付方案。
- [开发任务清单](docs/IMPLEMENTATION_BACKLOG.md)：可直接领取、逐项验收的工程任务。
- [AI 开发约束](AGENTS.md)：MiniMax 及其他编码代理必须遵循的强制规则。
- [MiniMax 开发执行手册](docs/MINIMAX_IMPLEMENTATION_GUIDE.md)：可直接交给 MiniMax 的执行流程、提示词、门禁和交付模板。
- [ADR-0001：数据层采用 SQLite，空间索引采用 R\*Tree](docs/adr/0001-sqlite-data-layer.md)：取代原技术方案中的 PostgreSQL/PostGIS 选型。
- [ADR-0002：依赖漏洞处置策略](docs/adr/0002-dependency-vulnerability-policy.md)：生产依赖强门禁，开发依赖分阶段。

## 当前状态

P0-01 ~ P0-09 已交付：三应用骨架、共享 strict 配置与依赖边界、CI、品牌 tokens、响应式 shell、公开站静态首页、API request-id / 健康检查 / 结构化日志、本地启动文档。

**P1-01 ~ P1-10 已实现并通过验证**（SQLite 方案，见下方"数据层"章节的功能差异说明）：

| 任务        | 内容                                                              | 验证                                     |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------- |
| P1-01       | Prisma schema（25 表）+ 迁移 + seed                               | `migrate deploy` 在空库成功；seed 幂等   |
| P1-02       | Argon2id 密码、登录/刷新/登出、refresh 旋转与重放检测、限流       | 23 条集成用例                            |
| P1-03       | AuthGuard（401）+ RolesGuard（403，fail-closed）                  | 401/403 真实 HTTP 断言                   |
| P1-04       | 内容 CRUD + 7 种类型扩展 + slug + 乐观锁（409）+ 软删除           | 并发更新 409 断言                        |
| P1-05       | sources / relations / tags + 自关联与重复拒绝                     | 完整性约束断言                           |
| P1-06       | Tiptap JSON 白名单 + 安全渲染（`@nanking-atlas/validation`）      | 59 条用例（XSS / `javascript:` 绕过）    |
| P1-07       | revisions / review_actions / audit_logs 事务内只增                | 事务一致性断言                           |
| P1-08       | 状态机 + 退回理由 + publication readiness（422 结构化）           | 非法流转 403；缺来源 422                 |
| P1-09       | upload intent + 对象确认 + MIME 魔数 / 版权校验                   | 21 条校验用例                            |
| P1-10       | 后台列表、编辑器八区、自动保存（debounce + 并发保护）、冲突对话框 | 67 条用例                                |
| P1-11       | OpenAPI 生成与 breaking-change 检查                               | 32 operations / 68 schemas               |
| P2-01       | public content API（只返回已发布字段）                            | 内部字段不外泄（字段白名单断言）         |
| P2-02       | 首页槽位 + 后台配置（仅 ADMIN）                                   | 时间窗生效 + 内容撤回后槽位自动失效      |
| P2-03~P2-06 | 文化志 / 生活录列表、六类详情、TOC、SEO、sitemap、robots          | 131 条 web 测试                          |
| P2-07       | 签名 revalidation（HMAC + 300s 防重放 + 指数退避重试）            | 篡改 / 过期 / 重放均被拒                 |
| P2-08       | 响应式与 WCAG AA（语义 HTML、焦点可见、reduced-motion）           | 组件级语义断言                           |
| P3-01       | SQLite R\*Tree 空间索引 + bbox 两段式查询                         | 触发器同步 → 索引构建 → 命中，端到端实测 |
| P3-02       | `GET /places?bbox=`（格式 / 反向 / 超范围 / 面积上限）            | 坐标不可信时不返回精确点                 |
| P3-05       | `GET /search?q=`（LIKE + 通配符转义 + 无结果建议标签）            | 输入 `%` 不会退化为全表扫描              |
| P3-06       | `GET /routes/:slug` 有序站点                                      | 按 position 排序；不可信坐标不进连线     |

**P3-02 / P3-03 / P3-04 / P3-07（`/map` 页：高德地图延迟加载、marker/card 联动、请求取消与去抖、键盘与读屏）已实现。**
底图供应商已由 Leaflet + OpenStreetMap 切换为**高德地图 Web 端 JS API 2.0**。
该变更的 ADR **尚未获得批准**，技术方案 §2 的「Leaflet」一项也尚未回写；
在维护者明确批准前，不得宣称其已批准（见 `docs/adr/0001-sqlite-data-layer.md` §7）。
下一阶段为 P4（安全审计、E2E、性能、备份恢复、上线 runbook）。

### 地图与坐标系

| 项             | 取值                                                                 |
| -------------- | -------------------------------------------------------------------- |
| 数据库存储坐标 | **WGS-84**（权威值；R\*Tree 索引、JSON-LD、来源标注都用它）          |
| 地图渲染坐标   | **GCJ-02**（高德法定坐标系）                                         |
| 转换时机       | 只在「送给高德渲染 / 从高德读回 bbox」那一步转换，**不污染权威数据** |
| 南京一带偏移量 | 约 300 米                                                            |

> ⚠️ 漏掉这一步不会报错，只会让所有点位**静默偏移约 300 米**。`apps/web/src/lib/map-coords.ts`
> 用 wandergis/coordtransform 的公开算法实现，并以其作者文档中的样例向量
> （`wgs84togcj02(116.404, 39.915) = [116.410244, 39.916404]`）作为非循环锚点钉死。

### 高德接入所需环境变量

| 变量                             | 必需                 | 说明                                                          |
| -------------------------------- | -------------------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_AMAP_KEY`           | 是（否则地图页降级） | 高德开放平台「Web 端(JS API)」类型的 Key                      |
| `NEXT_PUBLIC_AMAP_SECURITY_CODE` | 否                   | jscode 只约束地理编码 / 路径规划等 Web 服务，本项目一条都不用 |

两者都是**公开凭据**（必然出现在浏览器里），防护手段是高德控制台的**域名白名单 + 配额**。
Key 缺失时地图块整体降级为纯列表，页面不会出现无解释的白屏。

### 三个必须知道的高德坑（均为真实浏览器实测，非文档转述）

1. **CSP 必须给 `'unsafe-eval'`** —— 高德插件加载器 `window._jsload_` 内部对字符串求值。
   不给就抛 `EvalError` → `WebGLRender is not a constructor` → 底图一片灰，
   而**所有网络请求都是 HTTP 200**，极易误判成「Key 有问题」。
   放开它只放宽「能否 eval」，不放宽脚本来源（nonce + `strict-dynamic` 仍在）。

2. **jscode 不是底图的必要条件** —— 官方与多数博客都说「2.0 不配 jscode 一定白屏」，
   实测只配 Key 底图完全正常。真正需要 jscode 的是地理编码 / 路径规划等 Web 服务。
   若按官方说法把它做成硬性前置，等于白拿一张能用的地图换一张灰屏。

3. **marker `content` 里的 `<svg>` 会被剥掉** —— 高德会渲染 `<span>` 但丢弃 `<svg>`，
   视觉上退化成默认图钉、品牌色与选中态全部失效。图钉改用纯 CSS 画（`::before` 圆 +
   `::after` 三角），100% 存活。

> 上线前仍需维护者确认：技术方案 §19「底图供应商 ADR」（商用授权、配额、attribution 条款）尚未签署。

## 部署所需环境变量（P4-01）

**只部署前端、不部署 API 会让所有内容页显示「内容接口未就绪」**——这是真实踩过的坑：
Netlify 上只有 Next 前端，`GET /api/v1/places` 返回 404，而前端构建产物里
**根本没烘进 API 地址**，于是每个数据页都走 `unconfigured` 分支。
页面不会崩，但拿不到任何内容。

### web（构建时注入，`NEXT_PUBLIC_*` 会被静态内联进产物）

| 变量                             | 必需   | 说明                                                         |
| -------------------------------- | ------ | ------------------------------------------------------------ |
| `NEXT_PUBLIC_APP_ENV`            | 是     | `development` / `staging` / `production`                     |
| `NEXT_PUBLIC_API_BASE_URL`       | **是** | API 的绝对地址，如 `https://api.example.com`（无 `/api/v1`） |
| `NEXT_PUBLIC_SITE_URL`           | 否     | 站点规范域名；缺失时输出 noindex + 相对 canonical            |
| `NEXT_PUBLIC_AMAP_KEY`           | 是     | 高德 Web 端(JS API) Key；缺失时地图降级为纯列表              |
| `NEXT_PUBLIC_AMAP_SECURITY_CODE` | 否     | 见上文「高德接入所需环境变量」                               |
| `REVALIDATION_SECRET`            | 否     | 发布签名密钥，须与 API 侧一致；缺失时 revalidation 一律 503  |

### api（运行时注入）

`APP_ENV`、`API_PORT`、`WEB_ORIGIN`（须含 web 的真实来源）、`ADMIN_ORIGIN`、
`DATABASE_URL`、`AUTH_ACCESS_SECRET`、`AUTH_REFRESH_SECRET`、`REVALIDATION_SECRET`、
`REVALIDATION_URL`。完整清单见 `apps/api/.env.example`。

> ⚠️ **SQLite 与无服务器不兼容**：`DATABASE_URL` 指向本地文件，部署到 serverless
> 平台会因文件系统临时而丢数据。部署 API 需选用带持久卷的长驻主机，或先更换数据库 ——
> 后者属架构变更，需 ADR 与人工批准。

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
pnpm test:e2e            # 端到端测试（真实 API + 真实 web 构建 + Chromium）
```

集成测试由 `apps/api/test/global-setup.ts` 在**空库上执行真实迁移 SQL** 建库，验证「迁移可在全新数据库执行」（AGENTS.md §7.5）。

### 端到端测试（P4-03）

`pnpm test:e2e` 覆盖技术方案 §16 要求的链路：登录 → 建稿 → 补来源 → 送审 → 退回/通过 →
发布 → 公开可见 → 撤回，外加 401/403 与乐观锁 409。

首次运行前需要下载浏览器（一次性，约 440 MB）：

```bash
pnpm exec playwright install chromium
```

三个容易踩的坑，都已在 `e2e/global-setup.ts` 与 `playwright.config.ts` 里处理并注释：

1. **`NEXT_PUBLIC_*` 是构建期内联的**。给 `next start` 传这些变量无效；
   复用旧产物会让页面去连 `localhost:4000`，渲染「内容接口暂时无法连接」，
   而后端完全正常。所以 globalSetup 必须自己重新 build。
2. **归档后必须配 `REVALIDATION_URL`**，否则 API 不会回调 web 让缓存失效，
   详情页会继续命中 300 秒缓存，撤回后仍返回 200（软 404）。
   该 URL 必须是 `https://` 或 `http://localhost`（`apps/api/src/lib/env.ts:140` 的安全约束）。
3. **E2E 用独立的 `e2e.db`**，与 `dev.db` / `integration.db` 物理隔离，
   绝不污染开发库。

应用层 enum：因 SQLite 没有原生 ENUM，所有 enum 列实际存为 String。
应用层通过 `@nanking-atlas/database` 的字面量联合 + zod 校验保证取值范围
（见 `packages/database/src/enums.ts`）。

**与 PostgreSQL 版本的功能差异**（已在 P3 任务中完成补偿）：

- 无空间扩展：`places.lon / lat` 浮点列 + SQLite R\*Tree 虚表索引（迁移 `20261009130000_place_spatial_index`）。
  注意：SQLite 触发器不能写虚表，虚表须由应用层 `rebuildIndex()` 重建。
- 无 pg_trgm 中文相似度：搜索降级为 `LIKE` + 通配符转义；FTS5 未启用。
- 无 UUID / citext / pgcrypto：id 改 `cuid()`，email 应用层 lowercase。

## 阶段门禁

- P0 门禁：三个应用可独立运行；根级质量命令通过；开发配置无秘密。
- P1 门禁：真实数据库和服务端权限有效；审核发布链路通过集成/E2E；审计可追溯。
- P2 门禁：发布内容从后台到公开站闭环；SEO、撤回和响应式验证通过。
- P3 门禁：真实 SQLite R\*Tree bbox 查询；地图/列表联动和失败降级通过。
- P4 门禁：安全、性能、监控、备份恢复和上线 runbook 有真实证据。

前一阶段未满足时，可以为后续做不破坏兼容性的准备，但不能宣称后续阶段已经交付。

## CI

PR 与 push 到 `main` 都会触发 `.github/workflows/ci.yml`：

1. `install` — `pnpm install --frozen-lockfile`（**只用于预热 pnpm store 缓存**）
2. `format` — `pnpm format:check`
3. `lint` — `pnpm lint`（含跨包依赖边界 `no-restricted-imports`）
4. `typecheck` — `pnpm typecheck`
5. `test` — `pnpm test`（P1-01.a 起：SQLite 方案无需 service container；DATABASE_URL 由 job env 注入 `file:./packages/database/prisma/test.db`），
   随后 `pnpm test:integration`
6. `build` — `pnpm build`，产物上传为 artifact
7. `e2e` — `pnpm test:e2e`（P4-03；先 `playwright install --with-deps chromium`，
   浏览器缓存到 `~/.cache/ms-playwright`，失败时上传 HTML report）
8. `dependency-scan` — `pnpm audit --prod --audit-level high`（P4-02：只卡生产依赖；
   dev 依赖的已知高危记录在 [ADR-0002](docs/adr/0002-dependency-vulnerability-policy.md)）
9. `secret-scan` — gitleaks（AGENTS.md §4.6：禁止提交真实密钥）

合并前 8 步全部必须通过。`dependency-scan` 只拦生产依赖的高危；
dev 依赖仍有 3 critical / 7 high 已知未修，**不等于 P4-02 依赖扫描全部通过**。

> **每个 job 都要自己 `pnpm install --frozen-lockfile`**。GitHub Actions 的
> job 各自跑在全新 runner 上，`needs: install` 只保证 pnpm store 缓存已预热，
> `node_modules` **不会**跨 job 传递。`install` job 不上传 artifact，
> 因此它只是缓存预热器，不能替代各 job 自己的安装。
