# Nanking Atlas 运维 Runbook

版本：1.0
状态：P4-06 交付
日期：2026-10-09
适用范围：`nanking-atlas` monorepo（pnpm workspace + Turborepo）

本文档描述**发布、回滚、备份恢复、密钥轮换、事故处理**的标准作业流程，并明确列出必须人工批准的操作点。

配套文档：[`OPERATIONS.md`](OPERATIONS.md)（日常运维：日志、指标、告警、数据体检）。

## 0. 现状声明（先读这一节）

以下事实在当前仓库中**尚未具备**，本文档不会假装它们已经可以执行。凡标注「未配置 / 待接入」的内容，在具备对应基础设施前不得当作可运行流程使用。

| 能力                      | 现状                                                    | 依据                                                |
| ------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| staging / production 隔离 | **未配置**。仓库只有本地 `.env.example`，无部署平台配置 | `.env.example`（api/web/admin）                     |
| CI 流水线                 | 已配置（GitHub Actions）                                | `.github/workflows/ci.yml`                          |
| Prometheus / OTel 指标    | **未接入**                                              | 全仓库无相关依赖                                    |
| 告警与仪表盘              | **未配置**                                              | 全仓库无相关配置                                    |
| 对象存储（S3）            | **未接入**，无 S3 SDK 依赖                              | `apps/api/src/modules/media/media.service.ts:17-22` |
| 自动备份任务              | **未配置**，无备份脚本                                  | `package.json` 无 backup 类 script                  |
| 恢复演练记录              | **未执行**                                              | —                                                   |

> 依据技术方案 §13：「未做恢复验证不能声称『已备份可恢复』」。本文档提供流程，但**不声称**已演练。

### 0.1 组件与端口

| 应用           | 包名                   | 开发端口 | 生产产物                      | 生产启动命令                             |
| -------------- | ---------------------- | -------- | ----------------------------- | ---------------------------------------- |
| 公开站 web     | `@nanking-atlas/web`   | 3000     | `apps/web/.next`              | `pnpm --filter @nanking-atlas/web start` |
| 管理后台 admin | `@nanking-atlas/admin` | 5173     | `apps/admin/dist`（静态文件） | 无生产启动脚本，须由静态服务器/CDN 托管  |
| API            | `@nanking-atlas/api`   | 4000     | `apps/api/dist`               | `node dist/main.js`                      |

注意：`pnpm --filter @nanking-atlas/api start` 实际执行 `tsx src/main.ts`，是**直接跑 TypeScript 源码**，不是生产启动方式。生产必须先 `pnpm build`，再 `node dist/main.js`。

## 1. 发布流程（P4-01）

### 1.1 环境隔离

四个环境定义在 `apps/api/src/lib/env.ts:17`：`development` / `test` / `staging` / `production`。

#### SQLite 数据文件必须物理隔离

本项目数据层是 **SQLite 单文件**（`packages/database/prisma/schema.prisma:23-26`，`provider = "sqlite"`）。这带来一条与 PostgreSQL 方案截然不同的硬约束：

> **staging 与 production 绝不能共用同一个 `.db` 文件。**

原因：SQLite 没有连接级权限隔离，共用文件意味着 staging 的任何写操作（含 seed、调试脚本、迁移重放）会直接污染生产数据，且无法用账号权限兜底。

数据库文件分配（TODO：存放位置与卷需人工决策，见 §7）：

| 环境        | 建议 `DATABASE_URL`                       | 实际值                                                                                      |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| development | `file:../packages/database/prisma/dev.db` | 已固定于 `apps/api/.env.example:26`                                                         |
| test        | 绝对路径                                  | 由 `apps/api/vitest.integration.config.ts:25-28` 注入 `apps/api/prisma-test/integration.db` |
| staging     | **TODO**                                  | 待人工决定独立卷/路径                                                                       |
| production  | **TODO**                                  | 待人工决定独立卷/路径                                                                       |

约束：

1. 生产 `DATABASE_URL` 必须是**绝对路径**。Prisma 5 把相对 `file:` 路径解析到 `schema.prisma` 所在目录，而非进程 cwd，用相对路径会静默指向错误的库（该坑已在 `apps/api/vitest.integration.config.ts:16-24` 踩过并记录）。
2. 生产数据与本地 `.env` 完全隔离：本地 `.env` 指向 `dev.db`，**不含任何生产凭据**；生产密钥只由部署平台注入，不得落盘到仓库内任何 `.env`。
3. `.db-wal` / `.db-shm` 是主库文件的附属文件，必须与 `.db` 同目录、同备份单元（见 §3）。

#### 各环境变量取值差异

仅列 `apps/api/src/lib/env.ts` 实际校验的变量（表中变量名与代码一一对应）。

| 变量                       | development                               | test                                                            | staging            | production               |
| -------------------------- | ----------------------------------------- | --------------------------------------------------------------- | ------------------ | ------------------------ |
| `APP_ENV`                  | `development`                             | `test`                                                          | `staging`          | `production`             |
| `NODE_ENV`                 | `development`                             | `test`                                                          | `production`       | `production`             |
| `API_PORT`                 | `4000`                                    | 由 vitest 决定                                                  | TODO               | TODO                     |
| `WEB_ORIGIN`               | `http://localhost:3000`                   | 不校验                                                          | TODO               | TODO（正式站域名）       |
| `ADMIN_ORIGIN`             | `http://localhost:5173`                   | 不校验                                                          | TODO               | TODO（后台域名）         |
| `LOG_LEVEL`                | `info`                                    | `debug`（`vitest.integration.config.ts:58`）                    | TODO               | TODO                     |
| `REQUEST_ID_HEADER`        | `x-request-id`                            | `x-request-id`                                                  | `x-request-id`     | `x-request-id`           |
| `DATABASE_URL`             | `file:../packages/database/prisma/dev.db` | 注入                                                            | TODO               | TODO（绝对路径，独立库） |
| `AUTH_ACCESS_SECRET`       | dev 占位值                                | 测试常量                                                        | **TODO：平台注入** | **TODO：平台注入**       |
| `AUTH_REFRESH_SECRET`      | dev 占位值                                | 测试常量                                                        | **TODO：平台注入** | **TODO：平台注入**       |
| `AUTH_ACCESS_TTL_SECONDS`  | `900`                                     | 默认                                                            | TODO               | TODO                     |
| `AUTH_REFRESH_TTL_SECONDS` | `1209600`                                 | 默认                                                            | TODO               | TODO                     |
| `AUTH_LOGIN_RATE_LIMIT`    | `5`                                       | `1000`（集成测试放宽，见 `vitest.integration.config.ts:63-65`） | TODO               | **保持 5 或更低**        |
| `REVALIDATION_SECRET`      | dev 占位值                                | 默认                                                            | **TODO：平台注入** | **TODO：平台注入**       |
| `REVALIDATION_URL`         | 可不填（则跳过 revalidation）             | 不填                                                            | TODO               | **必填，否则启动失败**   |

`WEB_ORIGIN` / `ADMIN_ORIGIN` 直接决定 CORS 白名单（`apps/api/src/main.ts:27-46`），两者均为空则 `enableCors` 不会被调用，前端跨域请求会失败。

技术方案 §14 中列出的 `API_PUBLIC_URL`、`S3_ENDPOINT`、`S3_REGION`、`S3_BUCKET`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`MAP_TILE_URL`、`MAP_ATTRIBUTION` **在当前代码中没有被 `env.ts` 校验，也没有任何代码读取**。其中 S3 系列因为对象存储未接入而确实不存在（见 §0）；其余变量在接入对应功能前不得写入配置文档当作已生效。

#### 生产启动的 fail-fast 条件

`apps/api/src/lib/env.ts:164-208` 会在启动期直接抛错，进程退出，不会带病启动：

1. `APP_ENV != test` 且缺 `DATABASE_URL`。
2. `APP_ENV == production` 时，以下四项任一不满足即失败：
   - `AUTH_ACCESS_SECRET` 不得等于 dev 占位值 `dev-only-insecure-access-secret-please-override`
   - `AUTH_REFRESH_SECRET` 不得等于 dev 占位值 `dev-only-insecure-refresh-secret-please-override`
   - `REVALIDATION_SECRET` 不得等于 dev 占位值 `dev-only-insecure-revalidation-secret-override`
   - `REVALIDATION_URL` 必须配置
3. 三个 secret 均要求 **≥ 32 字符**。

生成 secret 的方式（`.env.example:31` 给出的官方方式）：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 1.2 发布前检查清单

逐条执行，**任一失败即阻断发布**。以下命令均已对照 `package.json` 核实存在。

```bash
# 1. 格式（CI 第 1 关）
pnpm format:check

# 2. 静态检查
pnpm lint
pnpm typecheck

# 3. 测试
pnpm test
pnpm test:integration

# 4. 构建三个应用
pnpm build
```

补充项（`openapi:*` **只存在于 `@nanking-atlas/api` 包**，仓库根目录没有这两个 script，必须带 `--filter`）：

```bash
pnpm --filter @nanking-atlas/api openapi:generate
pnpm --filter @nanking-atlas/api openapi:check-breaking
```

**契约门禁**：`openapi:check-breaking` 会把 `apps/api/openapi.json` 与 `openapi/baseline.json` 比对（`apps/api/scripts/check-openapi-breaking.ts:34-35`）。发现破坏性变更即 exit 1 并逐条列出差异。**基线不一致即阻断发布**，不得用 `--update` 顺手刷新基线绕过 —— `--update` 只能在契约变更有意为之、且已同步更新 Web/Admin 客户端与测试后使用。

生成 Prisma client 与迁移状态检查（数据库包）：

```bash
pnpm --filter @nanking-atlas/database prisma:generate
pnpm --filter @nanking-atlas/database prisma:migrate:deploy
```

迁移必须在**空库上**可重放 —— CI 已通过 `apps/api/test/global-setup.ts` 在空库执行真实迁移 SQL 覆盖这一点。

**Seed 禁止事项**：

> `pnpm --filter @nanking-atlas/database seed` **绝不允许在 staging 与 production 执行**。

`packages/database/prisma/seed.ts` 写入的演示账号使用硬编码公开密码 `nanking-atlas-demo-2026`（`seed.ts:33`），内容一律 `DRAFT` 并标注「示例 / 待核验」。该命令仅用于本地与 CI。生产迁移流程中不得出现 `seed`。

### 1.3 启动顺序

有依赖关系，不可并行启动：

1. **先迁移数据库**：`pnpm --filter @nanking-atlas/database prisma:migrate:deploy`（SQLite 单写者模型，迁移必须串行、单一受控 job）。
2. **再启 API**：`node dist/main.js`（工作目录 `apps/api`，因为 `DATABASE_URL` 相对路径的解析基准是 cwd）。
3. **再启 web**：`pnpm --filter @nanking-atlas/web start`。
4. **最后发布 admin**：`apps/admin/dist` 为静态产物，交由静态服务器/CDN 托管。

API 依赖数据库；web 依赖 API（`NEXT_PUBLIC_API_BASE_URL`）；admin 依赖 API（`VITE_API_BASE_URL`）。API 未就绪时，web 会走「内容暂不可用」降级而非报错（`apps/web/.env.example:7-8`）。

### 1.4 发布后验证

1. **存活探针**（不查任何依赖）：

   ```bash
   curl -i http://<api-host>:4000/health/live
   ```

   期望 `200` + `{"status":"ok","service":"api"}`。

2. **就绪探针**（ping 数据库）：

   ```bash
   curl -i http://<api-host>:4000/health/live
   curl http://<api-host>:4000/health/ready
   ```

   期望 body 中 `"status":"ok"` 且 `"checks":{"process":"ok","database":"ok"}`。

   > **重要**：`/health/ready` 在数据库不可用时返回的是 **HTTP 200** + `"status":"degraded"`（`apps/api/src/common/health/health.controller.ts:47-53`），它不设置 503。因此把 `/health/ready` 配成只看 HTTP 状态码的探针**是无效的**，必须解析 body 的 `status` 字段。

   两个 health 端点都挂在顶层而非 `/api/v1` 下（`apps/api/src/main.ts:21-23` 显式 exclude）。

3. **公开站冒烟**：首页、`/chronicle`、`/map` 可访问；一张已发布内容的详情页返回 200。
4. **后台冒烟**：登录成功，后台内容列表可加载。
5. **发布闭环验证**：新建一条内容走完建稿 → 送审 → 审核 → 发布，确认公开站可见。

   > 见 §5.2：当前 API 与 web 的 revalidation 请求头**不一致**，此步骤很可能失败，属已知缺陷。

## 2. 回滚流程

### 2.1 代码回滚

**前提**：

1. 回滚的代码版本必须与目标数据库 schema 兼容。由于 SQLite 无 down migration（§2.2），**代码回滚的前提是数据库未发生破坏性变更**。
2. 回滚同样受 §1.2 检查清单约束 —— 回滚到的主干也必须通过 `pnpm format:check` / `lint` / `typecheck` / `test` / `test:integration` / `build`。

**方式**：

1. 切回上一个已知的良好提交（`git revert` 或部署平台回滚到上一个构建产物）。
2. 按 §1.3 的顺序重启：API → web → admin。
3. 执行 §1.4 的发布后验证。

**Web 缓存注意事项**：公开站是 ISR + revalidation 架构。代码回滚后，已缓存的页面不会自动失效，需要额外触发 revalidation 或等待 TTL 自然收敛。若回滚涉及内容展示逻辑，应主动让相关路径失效。

### 2.2 数据库回滚

> **SQLite + Prisma 没有 down migration。迁移一旦应用即不可逆，只能从发布前备份还原。**

`packages/database/prisma/migrations/` 下的迁移是**只增不改**的：

- 当前已有 4 个迁移目录：`20261009093605_init`、`20261009094500_refresh_token_hash_unique`、`20261009130000_place_spatial_index`、`20261009195000_homepage_slots`。
- 迁移文件一旦提交即视为**已应用**，**不得删除、不得修改**。删除已提交的迁移会让新环境与生产环境的 schema 产生分叉。
- Prisma 用 `_prisma_migrations` 表记录已应用迁移；删除记录行来「假装回滚」会导致 schema 与记录不一致，禁止这么做。

**因此，唯一可靠的回滚路径是备份还原**（详见 §3）：

1. 停止 API 进程（写者必须停止，否则 SQLite 可能持续持有锁）。
2. 从**发布前**的备份还原 `.db` 文件。
3. 重启 API。
4. 执行 §1.4 验证。

### 2.3 回滚决策

技术方案 §15 要求每次上线记录「变更说明、验证结果、负责人和回滚条件」。回滚条件必须在发布**前**写定，而不是出事后判断。典型回滚触发条件：

- `/health/ready` 持续 `degraded`。
- 5xx 比例显著上升。
- 公开站核心页面（首页、详情、地图）任一不可访问。
- 登录链路不可用。

## 3. 备份与恢复（P4-05）

### 3.1 SQLite 备份的正确做法

> **不要在数据库运行时直接拷贝 `.db` 文件。**

SQLite 支持 WAL 模式，此时数据可能部分存在于 `.db`、部分存在于同目录的 `.db-wal`。直接拷贝 `.db` 会得到**不一致快照**：缺失尚在 WAL 中未 checkpoint 的事务，恢复后数据静默丢失，且 `PRAGMA integrity_check` 也可能通过 —— 这类损坏不会在备份时被发现，只会在恢复后表现为「少了几条内容」。

必须使用以下两种方式之一：

**方式 A：`VACUUM INTO`（SQLite 3.27+）—— 本项目脚本采用**

```bash
# packages/database 目录下执行；输出默认到 packages/database/backups/
DATABASE_URL='file:/abs/path/to/dev.db' pnpm --filter @nanking-atlas/database backup [输出目录]
```

等价于 `VACUUM INTO '<绝对路径>'`，但通过 Prisma 发同一条 SQL：**零新增依赖**，
且与应用自身的连接方式完全一致。脚本会额外产出同名 `.json` 清单，记录
sha256、字节数、journal 模式与各关键表行数 —— 清单是恢复演练能做行数比对的前提。

**方式 B：`.backup` 命令（在线热备）**

需本机有 `sqlite3` CLI：

```bash
sqlite3 "<db-path>.db" ".backup '/backup/dir/nanking-atlas-$(date +%Y%m%d-%H%M%S).db'"
```

优点：可在数据库运行时执行，自动处理一致性。

> ⚠️ **`sqlite3` CLI 在开发机实测不在 PATH 里**。原先本节只记录 sqlite3 命令，
> 等于「文档里有、跑不通」。现在方式 A 不依赖它，是默认选择；
> 方式 B 仅在确认有 CLI 的环境使用。
>
> 另注意：`packages/database/backups/` 已被 `.gitignore` 排除。
> 那里是**整个数据库的副本**（含用户 email 与审计日志），绝不能提交进版本库。

### 3.2 备份频率与保留策略

保留周期属于技术方案 §19 列出的「P4 前必须由维护者确认」事项，当前**未定**。下表是建议值，**需人工批准后生效**（TODO）：

| 项目     | 建议值                                                             | 状态 |
| -------- | ------------------------------------------------------------------ | ---- |
| 频率     | 每日 1 次全量                                                      | TODO |
| 保留     | 每日 7 份 + 每周 4 份 + 每月 6 份                                  | TODO |
| RPO      | 24 小时（每日备份）                                                | TODO |
| RTO      | 需实测确定                                                         | TODO |
| 存放位置 | **TODO：需人工决定**（必须异地，不能只放在同一台机器的另一个目录） | TODO |
| 加密     | **TODO：备份含用户账号与哈希，应加密存放**                         | TODO |

### 3.3 对象存储备份

> **当前未接入 S3，暂无可备份内容。**

`apps/api/src/modules/media/media.service.ts:17-22` 明确说明：S3 尚未接入，该模块不含任何 S3 SDK 依赖，也不做网络上传。接入 S3 属于「连接外部服务」，必须人工批准（见 §6）。

对象存储的版本化 / 生命周期 / 备份策略在 S3 接入并获批之后再补写，不预先编造流程。

### 3.4 恢复演练

**当前状态：已于 2026-10-10 在本地开发库上实际执行过一次，结论通过。**
演练命令：

```bash
DATABASE_URL='file:/abs/path/to/dev.db' \
  pnpm --filter @nanking-atlas/database restore-drill backups
```

脚本会：校验备份 sha256 → **复制**到隔离目录 → `PRAGMA integrity_check` →
逐表比对行数 → 把结果写成 `backups/_drill/drill-result.json`。

#### 演练记录（2026-10-10，开发库）

| 项                | 结果                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| 备份              | `nanking-atlas-20261010-075135.db`（356352 字节，journal=delete）                                |
| sha256 校验       | 一致                                                                                             |
| `integrity_check` | `ok`                                                                                             |
| 行数比对          | 全部一致：contents 5、revisions 3、review_actions 10、audit_logs 28、users 3、media 0、sources 4 |
| **结论**          | **通过**                                                                                         |
| 记录文件          | `packages/database/backups/_drill/drill-result.json`                                             |

> ⚠️ **演练暴露过一个真实缺陷，值得记住**：脚本第一版**根本没复制备份文件**，
> 只是让 Prisma 连一个不存在的路径 —— SQLite 会**建出一个空库**并返回。
> 而空库的 `integrity_check` 同样是 `ok`。
> 也就是说：**只做完整性检查的恢复演练会给出一个虚假的通过结论。**
> 必须同时做行数比对，才能发现这种「恢复了个空库」的情况。
> （本次是被行数比对抓出来的 —— 报错 `no such table: contents`。）

#### 安全护栏

演练目标路径由 `isSafeDrillTarget()` 硬校验：**与线上库同路径直接拒绝执行**。
一次「演练」若覆盖了生产库、而备份本身不完整，就是数据事故。

#### 尚未覆盖的部分（不能声称已完成）

以上是**本地开发库**的一次演练。以下项仍未验证：

- **生产 / staging 环境的恢复**（需先确定部署形态，见 §3.5 与技术方案 §19）。
- **对象存储备份与恢复**（§3.3，未接入对象存储）。
- **RPO / RTO 实测值**：技术方案 §13 要求记录，本次未测量。
  当前备份频率未定（§3.2 待批准），RPO 无法给出有意义的数字。

#### 完整验收标准（技术方案 §17 第 8 项）

除上述脚本自动完成的项（sha256、完整性、行数）外，还需人工确认：

1. `prisma migrate status` 显示 schema 已是最新版本。
2. 启动 API 后 `/health/ready` 返回 `"status":"ok"` 且 `checks.database == "ok"`。
3. 用恢复库中的账号通过 `/auth/login` 拿到 access token
   （验证 Argon2id 哈希与 refresh token 哈希表完整）。
4. 已发布内容的公开详情 URL 返回 200。

## 4. 密钥轮换（P4-06）

三个 secret 的作用与轮换影响**完全不同**，不可一概而论。以下结论均已对照代码核实。

### 4.1 `AUTH_ACCESS_SECRET`

**作用**：access token 的 HMAC-SHA256 签名密钥（`apps/api/src/lib/token.ts:40-42`）。token 是自签 HS256 JWT，claims 为 `sub` / `roles` / `iat` / `exp` / `jti`。

**轮换影响（两个，均为已核实）**：

1. **所有已签发的 access token 立即失效**。签名密钥变化后，旧 token 校验必然落到 `bad_signature`（`token.ts:97-99`）。不过 default 15 分钟 TTL（`AUTH_ACCESS_TTL_SECONDS=900`）意味着**影响会在 15 分钟内自然消退** —— 但客户端会先经历一轮「401 → 刷新 → 成功」。若同时轮换 refresh secret，则无此缓冲。

2. **审计日志的 IP 哈希连续性断裂**。`hashIp()` 用 `AUTH_ACCESS_SECRET` 做 HMAC（`apps/api/src/lib/token.ts:185-187`）。轮换后，**轮换前后写入的 `audit_logs.ip_hash` 不可互相比较** —— 同一个 IP 在轮换前后会得到两个不同的哈希值。若依赖 IP 哈希做「同一 IP 的行为串联」分析（撞库检测、异常登录排查），必须知道这个断点。轮换前后的哈希值之间不存在换算关系，**无法通过任何手段恢复等价性**。

**轮换步骤**：

1. 生成新 secret（§1.1 的 `node -e` 命令）。
2. 在部署平台更新 `AUTH_ACCESS_SECRET`。
3. 重启 API 进程（env 在模块加载期读取，改环境变量必须重启才生效）。
4. 通知使用者：登录可能出现一次 401，重新登录即可。
5. **记录审计断点时间**，供后续日志分析参考。

### 4.2 `AUTH_REFRESH_SECRET`

> **轮换 `AUTH_REFRESH_SECRET` 不会影响任何已有会话，用户无需重新登录。**

这一结论已通过代码核实，不是推测：

- refresh token 是 **opaque 随机串**，由 `randomBytes(32)` 生成（`apps/api/src/lib/token.ts:155-157`），不是签名令牌。
- 数据库里只存它的 **sha256 十六进制哈希**（`hashRefreshToken`，`token.ts:160-162`），查询键是该哈希（`apps/api/src/modules/auth/auth.service.ts:144-148`）。
- **整个签发与校验链路中没有任何 secret 参与。** `AUTH_REFRESH_SECRET` 仅在 `apps/api/src/lib/env.ts` 中被声明、校验和导出，未被任何 token 逻辑读取。

因此它当前是一个**预留但未使用**的变量 —— 轮换它是一次无运行时影响的操作。仍然必须轮换的理由只有一个：`env.ts:184-189` 规定生产环境不得使用 dev 占位值，所以生产必须注入真实值，而真实值需要按周期轮换以免长期固定。

**若确实需要强制所有用户重新登录**（例如怀疑 refresh token 泄露），正确做法不是轮换这个 secret，而是撤销数据库中所有活跃 refresh token —— 代码已内置重放检测逻辑，旧 token 被重放时会自动撤销该用户的**全部**活跃 token（`auth.service.ts:154-159`）。这条路径需要人工批准（生产数据操作，见 §6）。

### 4.3 `REVALIDATION_SECRET`

**作用**：API 签名 revalidation 请求的 HMAC 密钥，**API 与 web 必须使用同一个值**（`apps/api/src/modules/content-revalidation/revalidation.ts:115`；`apps/web/src/lib/api.ts:528`）。签名输入为 `<timestamp>.<body>`。

**轮换影响**：轮换后两侧必须**同时**更新，否则：

- web 未更新而 API 已更新 → web 端 `POST /api/revalidate` 全部返回 401 `INVALID_SIGNATURE`（`apps/web/src/app/api/revalidate/route.ts:66-68`）。
- 若 web 未配置该 secret → 端点返回 **503 `REVALIDATION_NOT_CONFIGURED`**，且**绝不降级放行**（`route.ts:43-50`）。

**轮换步骤**：

1. 生成新 secret。
2. **同时**更新 API 的 `REVALIDATION_SECRET` 与 web 的 `REVALIDATION_SECRET`，缺一不可。
3. 两个应用都要重启 / 重新部署。
4. 验证：发布一条内容，观察公开站是否收敛。

**注意**：生产环境下 `env.ts:200-206` 强制要求 `REVALIDATION_URL` 必须配置，缺失直接启动失败。

### 4.4 轮换顺序与通知

**轮换顺序**（有依赖时必须遵守）：

1. `REVALIDATION_SECRET` —— 必须 API 与 web 同步更新，两侧都要重启。
2. `AUTH_REFRESH_SECRET` —— 无运行时影响，可随时独立执行。
3. `AUTH_ACCESS_SECRET` —— 独立执行，会造成一次短暂 401 窗口。

三者之间无依赖关系，可分批进行，但 `REVALIDATION_SECRET` 内部的两侧必须原子。

**通知要求**：

- 轮换 `AUTH_ACCESS_SECRET` 前通知所有后台使用者（Editor / Reviewer / Admin），说明会有一次重新登录。
- 轮换 `REVALIDATION_SECRET` 前通知值班人员（两侧更新期间站点可能不收敛）。
- 所有轮换记录：时间、执行人、影响的 secret、验证结果。

## 5. 事故处理

### 5.0 严重级别定义

| 级别   | 定义                                                                     | 响应                     |
| ------ | ------------------------------------------------------------------------ | ------------------------ |
| **P0** | 公开站不可访问，或 API 完全不可用                                        | 立即处置，通知全部相关人 |
| **P1** | 核心链路降级：能访问但关键功能不可用（发布后不更新、地图白屏、登录失败） | 尽快处置                 |
| **P2** | 体验问题，不阻断使用                                                     | 排期修复                 |

### 5.1 登录全量 401

**症状**：后台所有用户登录失败或登录后立即被登出；`/auth/login` 返回 401。

**定位手段**：

1. 直接验证探针是否正常 —— 这一步能把范围缩小一半：

   ```bash
   curl -i http://<api-host>:4000/health/live
   ```

2. 在 API 日志中按 `requestId` 检索（见 `OPERATIONS.md` §1）。

**最可能的原因：新增或修改端点时漏了 `@Public()`，或全局 `AuthGuard` 的判定被破坏。**

探针由基础设施发起，不携带 access token。`apps/api/src/common/health/health.controller.ts:22,28` 上两个端点都标了 `@Public()`，代码注释（`health.controller.ts:11-13`）明确记录了「忘了这行会让整个集群判定为不健康」这一历史问题。若探针也返回 401，说明 `@Public()` 装饰器或 `AuthGuard` 的放行逻辑（`apps/api/src/common/auth/roles.decorator.ts:17-18`）被改动。

**处置步骤**：

1. 若探针也 401 → 检查 `HealthController` 的 `@Public()` 是否被移除，以及 `AuthGuard` 对 `IS_PUBLIC_KEY` 的处理。
2. 若探针正常但登录 401 → 查 `INVALID_CREDENTIALS` vs `TOKEN_REVOKED`：
   - `INVALID_CREDENTIALS` → 账号或密码问题，注意限流（`AUTH_LOGIN_RATE_LIMIT` 默认 5 次/分钟/IP，连续失败会先返回 `RATE_LIMITED` 429）。
   - `TOKEN_REVOKED` → refresh token 已撤销。若日志中出现 `auth.refresh.reuse_detected`（`auth.service.ts:163`），说明检测到 refresh token 重放，该用户的**全部**活跃 token 已被强制撤销。
3. 检查是否刚轮换过 `AUTH_ACCESS_SECRET`（见 §4.1）—— 这是最容易被忽略的原因。

**何时升级**：探针也返回 401（P0）；或怀疑 refresh token 泄露（需人工批准数据操作）。

### 5.2 发布成功但站点不更新

**症状**：后台发布操作成功（返回 200），但公开站详情页仍是旧内容或 404。

**定位手段**：

1. 查 API 日志中的 revalidation 重试记录。`triggerRevalidation` 的退避序列是 250ms / 1000ms / 4000ms（`apps/api/src/modules/content-revalidation/revalidation.ts:111`），失败最多尝试 4 次，约 5 秒。
2. 手动 curl web 端点，看返回码：

   ```bash
   curl -i -X POST https://<web-host>/api/revalidate
   ```

   - `503 REVALIDATION_NOT_CONFIGURED` → web 侧未配置 `REVALIDATION_SECRET`。
   - `401 INVALID_SIGNATURE` → 签名校验失败。

**当前已知的真实缺陷（发布前就应知晓）**：

API 与 web 的 revalidation 协议**不一致**，这会让上述流程必然失败：

| 项         | API（`apps/api/src/modules/content-revalidation/revalidation.ts`） | Web（`apps/web/src/lib/api.ts:466-467,507`）                    |
| ---------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| 请求头     | 单个 `x-nla-signature`（`revalidation.ts:122`）                    | 两个独立头：`x-revalidate-timestamp` + `x-revalidate-signature` |
| 时间戳单位 | **秒**（`revalidation.ts:114`）                                    | **毫秒**（与 `nowMs` 比较，`api.ts:512`）                       |
| 签名格式   | 裸 hex（`<秒>:<hex>`，`revalidation.ts:115`）                      | `sha256=<hex>` 前缀（`api.ts:507` 正则强制）                    |

Web 读取的 `x-revalidate-timestamp` 头 API 从不发送，因此 `verifyRevalidationSignature` 在第一步就返回 `missing`（`api.ts:504-506`），端点返回 **401 `INVALID_SIGNATURE`**。**这是代码缺陷，不是配置问题**，修改需要同时动 API 与 Web 两个应用，属于 P4 修复项，不在本 runbook 的文档范围内。

**处置步骤（缺陷修复前的临时手段）**：

1. 确认 `REVALIDATION_SECRET` 两侧一致。
2. 依赖 ISR 的 TTL 自然收敛 —— 公开站页面会在 TTL 到期后自行更新，无需人工干预。
3. 若内容必须立即可见，通过发布平台手动触发该路径的重新验证。

**何时升级**：内容发布后长时间不更新（超过 TTL 仍不更新），说明不只是收敛问题，需排查数据层。

### 5.3 `/map` 白屏或无 marker

**症状**：`/map` 页面空白，或地图加载了但没有任何地点标记。

**定位手段**：向 bbox 查询接口发请求，核对返回条数：

```bash
curl "http://<api-host>:4000/api/v1/places?bbox=118.7,31.9,119.0,32.2"
```

**最可能的原因：R\*Tree 索引未重建。**

本项目用 SQLite 内置 R\*Tree 虚表替代 PostGIS（迁移 `20261009130000_place_spatial_index`）。关键限制写在 `places-query.service.ts` 与迁移注释中：**SQLite 不允许触发器直接写虚表**，所以 `places_ai/au/ad` 三个触发器只维护普通表 `place_rtree_ids`（`migration.sql:46-65`），而虚表 `places_rtree` 必须由应用层显式重建（`places-query.service.ts:248-261`）。因此直接写库、导入数据或历史遗留数据都可能造成映射表有数据但虚表为空 —— 此时 bbox 查询经 `JOIN places_rtree`（`places-query.service.ts:209-210`）返回空集，表现为「地图上什么都没有」。

**处置步骤**：

1. 用 ADMIN 角色调用重建端点（`places-search.controller.ts:163-167`，需 ADMIN 权限）：

   ```bash
   curl -X POST -H "Authorization: Bearer <admin-access-token>" \
     http://<api-host>:4000/api/v1/admin/places/reindex
   ```

2. 重建是 O(n) 全表操作，**不要**挂在读路径上（`places-search.controller.ts:159-162` 明确说明）。
3. 若重建后仍无数据，检查 `place_rtree_ids` 是否有记录 —— 空表说明坐标本身没写入。

**次要原因**：底图服务失败。此时列表应仍然可用（技术方案 §9.2 要求底图失败不隐藏列表）；若列表也没数据，则不是底图问题，回到第 1 步。

**何时升级**：重建索引无法恢复；或 `place_rtree_ids` 为空（数据层问题，需人工决策是否补数据）。

### 5.4 `database is locked` / SQLITE_BUSY

**症状**：API 日志出现 `SQLITE_BUSY` 或 `database is locked`，接口返回 5xx。

**原因**：SQLite 是**单写者**模型。并发写入会互相阻塞。集成测试因此强制串行执行（`apps/api/vitest.integration.config.ts:50` 的 `fileParallelism: false`）。生产中的常见触发源：

- 迁移与 API 同时运行（迁移必须串行、单一受控 job，见 §1.3）。
- 备份任务（`.backup` 为长读事务）与写入重叠。
- 多个 API 实例同时写同一个 `.db` 文件。

**定位手段**：

1. 确认是否只有一个 API 实例在写。SQLite **不支持多实例水平扩展写** —— 扩副本前必须先换数据库，这是架构级限制。
2. 查看 journal mode：

   ```bash
   sqlite3 "<db-path>.db" "PRAGMA journal_mode;"
   ```

   `wal` 模式下读写可并发，锁等待显著减少。

**处置步骤**：

1. 确认是否有并发的迁移或备份任务在跑，等待其结束。
2. 若锁在合理时间内自动释放，属正常竞争，观察即可。
3. 确认写入方唯一：停止多余实例。
4. 长期方案：调整 journal mode 需人工批准（生产数据/配置操作）。

**何时升级**：锁持续不释放；或出现多实例写入的架构需求（需 ADR）。

## 6. 升级与人工批准点

依据 `AGENTS.md` §8：以下操作**必须人工确认**，AI 编码代理不得自行执行。

### 6.1 必须人工批准的操作清单

| 操作                                         | 为什么必须人工批准             |
| -------------------------------------------- | ------------------------------ |
| 生产环境发布                                 | 对外服务变更，影响真实用户     |
| 生产数据操作（撤销 token、手工改数据、清库） | 数据不可逆，且可能破坏审计追溯 |
| 连接外部服务（S3、监控、邮件、短信）         | 涉及凭据、可能产生费用         |
| 破坏性数据库操作（drop/truncate/删列/删表）  | 数据不可恢复                   |
| 证书与 DNS 变更                              | 影响全站可达性                 |
| 域名注册与 ICP 备案相关操作                  | 涉及主体资质与法规             |
| 购买服务、创建付费资源                       | 产生真实费用                   |
| 密钥轮换（生产）                             | 影响全量用户会话               |
| 执行 seed（任何非本地环境）                  | 会写入演示数据污染真实库       |
| 迁移重放或修改已提交的迁移                   | schema 分叉风险                |

### 6.2 AI 代理不得自行执行的清单

- 不得自行部署到生产环境。
- 不得自行连接或配置外部服务（S3 / 监控 / DNS / 邮件）。
- 不得自行执行生产数据的增删改。
- 不得自行执行破坏性数据库迁移。
- 不得自行轮换生产密钥。
- 不得自行在 staging / production 执行 seed。
- 不得自行购买资源或变更付费配置。
- 不得自行修改或删除 `packages/database/prisma/migrations/` 下已提交的迁移。
- 不得自行把未人工核验的历史内容标记为已核验或直接发布（AGENTS.md §3）。

### 6.3 需要记录的发布信息

技术方案 §15 要求每次上线记录：变更说明、验证结果、负责人、回滚条件。缺任一项，该次发布记录视为不完整。

## 7. 待人工决策事项

以下事项**不能由 AI 代理决定**，需要维护者拍板后才能补全本文档中的 TODO：

1. **部署平台与托管形态**：staging / production 部署在哪里？SQLite 数据库文件存放在哪类持久卷？
2. **备份保留策略与异地存放位置**：§3.2 表中的频率、RPO/RTO、保留期均为建议值，未获批准。
3. **SQLite 库文件路径与备份执行方式**：目标环境是否有 `sqlite3` CLI？若无，是否接受新增备份脚本？
4. **生产告警接收人**：技术方案 §19 要求在 P4 前确定，当前无人接收告警（告警本身也未配置）。
5. **日志保留期与脱敏策略**：`OPERATIONS.md` 中列出的 `redact` 配置尚未实现，是否在 P4 内补上。
