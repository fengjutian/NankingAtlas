# Nanking Atlas 日常运维手册

版本：1.0
状态：P4-06 交付
日期：2026-10-09
适用范围：`nanking-atlas` monorepo

本文档覆盖**日志、指标、告警、仪表盘、数据体检**。发布 / 回滚 / 备份恢复 / 密钥轮换 / 事故处理见 [`RUNBOOK.md`](RUNBOOK.md)。

## 0. 现状总览（先读）

| 能力                             | 状态                                   |
| -------------------------------- | -------------------------------------- |
| 结构化日志（`nestjs-pino`）      | **已实现**                             |
| requestId 串联                   | **已实现**                             |
| 日志脱敏（pino `redact`）        | **未实现** —— 当前无 `redact` 配置     |
| Prometheus / OpenTelemetry 指标  | **未接入** —— 无相关依赖               |
| 告警规则与接收通道               | **未配置**                             |
| 仪表盘                           | **未配置**                             |
| 日志聚合与检索后端（ELK / Loki） | **未接入**                             |
| 对象存储                         | **未接入**（`media.service.ts:17-22`） |

本文档对「未接入」的部分只给建议，不写不存在的命令或链接。

## 1. 日志

### 1.1 输出形态

API 使用 `nestjs-pino` + `pino-http`，配置在 `apps/api/src/app.module.ts:18-48`。

**开发环境**（`APP_ENV` 不是 `production` 也不是 `test`）走 `pino-pretty`，输出单行人类可读日志：

```text
[09:37:15.123] INFO: request completed
```

**生产与测试环境**输出**结构化 JSON**，可直接被日志系统采集。

`test` 环境被显式排除在 pretty 之外，原因写在 `app.module.ts:23-25`：`pino-pretty` 是 worker-thread transport，在 vitest 里会抛 `unable to determine transport target`。

### 1.2 `LOG_LEVEL`

取值范围由 `apps/api/src/lib/env.ts:29-32` 用 zod 枚举固定：

| 值       | 含义                       |
| -------- | -------------------------- |
| `fatal`  | 进程即将终止               |
| `error`  | 5xx 及严重错误             |
| `warn`   | 4xx                        |
| `info`   | 正常请求完成（**默认值**） |
| `debug`  | 调试细节                   |
| `trace`  | 最细粒度                   |
| `silent` | 完全静音                   |

默认 `info`。集成测试刻意设为 `debug`（`apps/api/vitest.integration.config.ts:56-58`），因为排查「500 但看不到原因」时 5xx 堆栈是唯一线索。

**生产建议值**：`info`。设为 `debug` 或 `trace` 会显著放大日志量与磁盘占用。

日志级别与 HTTP 状态的映射由 `customLogLevel` 决定（`app.module.ts:38-42`）：

```text
有异常 或 status >= 500  → error
status >= 400            → warn
其他                      → info
```

### 1.3 错误日志的内容

`GlobalExceptionFilter`（`apps/api/src/common/http/global-exception.filter.ts:64-70`）的记录策略：

- **5xx**：记录完整堆栈到服务端日志。
- **4xx**：只记录简要，不记堆栈 —— 避免日志被错误请求刷爆。

生产环境**不返回**堆栈、SQL、文件路径或密钥给客户端：未知异常统一映射为 500 + `INTERNAL_ERROR` + 固定文案「服务器内部错误，请稍后重试」（`global-exception.filter.ts:190-194`）。

### 1.4 日志脱敏要求

技术方案 §8 要求：「日志不得记录密码、token、Cookie、对象存储密钥和完整个人信息」。审计日志中的 IP 已做匿名化：`hashIp()` 用 `AUTH_ACCESS_SECRET` 做 HMAC 而非裸哈希（`apps/api/src/lib/token.ts:178-187`），避免 IPv4 的 2^32 取值空间被彩虹表反查。

> **当前实现缺口（TODO）**：`nestjs-pino` 配置（`app.module.ts:18-48`）中**没有设置 `redact`**，全仓库 grep `redact` 无匹配。
>
> 这意味着 pino 的默认行为会记录完整的请求对象。当前之所以没有泄露密码，是因为登录密码在 `@Body()` DTO 层面就不被回写日志、且 refresh token 只走 HttpOnly Cookie；但**这是一层偶然的保护，不是显式的脱敏配置**。任何新增的、把敏感字段放进请求头的接口（如未来的 API Key、Bearer token 透传）都会立即进入日志。

**建议补齐的脱敏配置（TODO，需人工批准后实现）**：在 `pinoParams.pinoHttp` 中增加 `redact`，至少覆盖：

```text
req.headers.authorization
req.headers.cookie
req.headers['x-nla-signature']
req.headers['x-revalidate-signature']
res.headers['set-cookie']
```

在补齐之前，运维人员应假定日志中可能出现请求头，对外分享日志片段前必须人工检查。

### 1.5 requestId 串联

这是当前**唯一已实现的跨服务排障链路**。

**工作方式**：

1. `RequestIdMiddleware`（`apps/api/src/common/request-id/request-id.middleware.ts`）对 `forRoutes('*')` 生效，把 requestId 写入 `res.locals.requestId`。
2. header 名由 `REQUEST_ID_HEADER` 配置，默认 `x-request-id`。客户端传入合法值则沿用，否则服务端生成；格式限定为 ASCII 字母、数字、连字符、下划线，长度 ≤ 64（`env.ts:34-44`）。
3. 每行日志都带 `requestId`：`customProps` 从 `res.locals` 读取（`app.module.ts:44-46`）。
4. 错误响应体里也带：`{ error: { code, message, requestId } }`（`global-exception.filter.ts:228-238`）。
5. CORS 配置把该 header 加入 `allowedHeaders` 并通过 `exposedHeaders` 暴露给浏览器（`apps/api/src/main.ts:36-44`），保证前端能读到这个值。

**使用方式**：

1. 用户在后台看到报错 → 复制响应里的 `requestId`。
2. 在 API 日志中按该 id 检索，即可拿到该次请求的完整上下文。

```bash
# 从 API 日志中按 requestId 检索（需先接入日志检索后端，或在本地直接 grep）
grep "<requestId>" api.log
```

**跨服务追踪的现状**：Web 端的 revalidation 端点也读取 `x-request-id`（`apps/web/src/app/api/revalidate/route.ts:41`）并在响应头回传。但 API 发起 revalidation 请求时（`revalidation.ts:118-126`）**并未设置 `x-request-id` 头**，因此这一跳的链路目前是断的（TODO）。

## 2. 指标

### 2.1 当前状态：未接入

> **本仓库没有 Prometheus、OpenTelemetry 或任何指标采集依赖。** 全仓库无 `@opentelemetry/*`、`prom-client` 等包，API 也未暴露 `/metrics` 端点。

技术方案 §13 要求采集：请求量、p50/p95/p99、5xx、登录失败、发布失败、DB pool、慢查询、上传失败、revalidation 失败。**这些当前全部不存在。**

### 2.2 建议的最小指标集（待接入）

以下是**建议**，不是已实现的配置。接入前需先批准引入可观测性依赖（AGENTS.md §6.5 要求说明用途、维护性与许可）。

**HTTP 请求层**：

| 指标                            | 类型      | 标签                        | 用途               |
| ------------------------------- | --------- | --------------------------- | ------------------ |
| `http_requests_total`           | counter   | `route`, `method`, `status` | 请求量与错误率     |
| `http_request_duration_seconds` | histogram | `route`, `method`           | P95 / P99 延迟     |
| `http_5xx_total`                | counter   | `route`                     | 5xx 比例告警的分子 |

`route` 标签必须用**路由模板**（如 `/api/v1/contents/:slug`）而非真实 URL —— 用真实 URL 会让 slug 变成高基数标签，导致指标系统爆炸。

**认证层**：

| 指标                      | 类型    | 标签                              | 用途                        |
| ------------------------- | ------- | --------------------------------- | --------------------------- |
| `auth_login_total`        | counter | `result`（`success` / `failure`） | 登录失败率 = 撞库检测的核心 |
| `auth_refresh_total`      | counter | `result`                          | 检测 refresh token 异常刷新 |
| `auth_rate_limited_total` | counter | `route`                           | 限流触发次数                |

**内容链路层**：

| 指标                            | 类型      | 标签         | 用途                                |
| ------------------------------- | --------- | ------------ | ----------------------------------- |
| `content_publish_total`         | counter   | `result`     | 发布成功 / 失败                     |
| `publication_not_ready_total`   | counter   | `issue_type` | 内容质量问题分布（缺来源 / 版权等） |
| `revalidation_total`            | counter   | `result`     | revalidation 失败次数               |
| `revalidation_duration_seconds` | histogram | —            | revalidation 耗时                   |

**数据层**：

| 指标                        | 类型      | 用途                     |
| --------------------------- | --------- | ------------------------ |
| `db_query_duration_seconds` | histogram | 慢查询定位               |
| `db_file_size_bytes`        | gauge     | SQLite 文件增长（见 §5） |

**关于 SQLite 的说明**：技术方案 §13 提到「DB pool」指标，这是 PostgreSQL 概念。SQLite **没有连接池**，每次查询是进程内直接文件访问。因此 `db_pool_*` 一类指标对当前数据层无意义，不应照搬。真正有意义的替代是文件大小增长与慢查询（见 §5）。

### 2.3 接入前必须回答的问题（TODO）

1. 用什么采集器？`prom-client`（Node 原生，最轻）还是 OTel SDK（生态更全但依赖更重）？
2. 指标暴露在哪：`/metrics` 端点，还是由平台 sidecar 抓取？
3. `/metrics` 是否需要鉴权？公开暴露会泄露流量与路由结构。
4. 存储与保留期？（TODO，需人工决策）

## 3. 告警

### 3.1 当前状态：未配置

> **没有任何告警规则、告警通道或接收人。** 无人会在站点挂掉时被通知。

技术方案 §19 要求「P4 前确定生产告警接收人」—— 该事项**尚未确定**。

### 3.2 建议的告警规则（待接入）

以下阈值为**建议初值**，需在 staging 实测基线后调整（技术方案 §16：「指标以 staging 实测定基线」）。

| 告警                   | 建议条件                                             | 级别 | 对应事故           |
| ---------------------- | ---------------------------------------------------- | ---- | ------------------ |
| 站点不可访问           | `/health/live` 连续 3 次探测失败                     | P0   | §5.1 RUNBOOK       |
| API 依赖降级           | `/health/ready` body 的 `status != "ok"` 持续 2 分钟 | P1   | 数据库不可用       |
| 5xx 比例突增           | 5xx / 总请求 > 5%，窗口 5 分钟                       | P1   | 代码缺陷或数据损坏 |
| 登录失败率突增         | 登录失败 / 登录总数 > 50%，窗口 5 分钟               | P1   | **撞库**           |
| 限流触发频繁           | `auth_rate_limited_total` 增速突增                   | P2   | 撞库或爬虫         |
| revalidation 失败      | `revalidation_total{result="failure"}` 持续增长      | P1   | §5.2 RUNBOOK       |
| 磁盘 / DB 文件增长异常 | `db_file_size_bytes` 单日增幅超阈值                  | P1   | 见 §5              |
| 发布校验失败激增       | `publication_not_ready_total` 激增                   | P2   | 内容质量流程问题   |

> **注意**：`/health/ready` 的探测必须解析 body 的 `status` 字段。`apps/api/src/common/health/health.controller.ts:47-53` 在数据库不可用时返回的是 **HTTP 200 + `"status":"degraded"`**，不设置 503。只看状态码的探针会永远判定为健康。

### 3.3 接收通道（TODO）

告警发到哪里需要人工决策，当前**没有任何通道**：

- 邮件？企业微信 / 钉钉？短信？
- 接收人是谁（技术方案 §19 要求 P4 前确定）？
- P0 与 P1 是否需要不同通道 / 不同升级路径？

**在通道确定之前，唯一可靠的告警手段是人工轮询**：

```bash
curl -s http://<api-host>:4000/health/ready
```

## 4. 仪表盘

### 4.1 当前状态：未配置

> **没有任何仪表盘。** 本文档不提供链接，因为确实不存在可链接的地址。

### 4.2 建议的仪表盘布局（待接入后搭建）

搭建时的分区建议，按「先看可用性、再看质量」的顺序：

**面板 1 — 可用性（最高优先级）**

- `GET /health/live` 与 `/health/ready` 状态时间线（`/ready` 需解析 body）
- 请求量趋势（按状态码分色）
- 5xx 比例曲线

**面板 2 — 延迟**

- P50 / P95 / P99 延迟（按路由分组）
- 慢查询 Top N

**面板 3 — 认证与安全**

- 登录成功率 / 失败率
- 429 限流触发次数
- `auth.refresh.reuse_detected` 审计事件计数（重放检测命中）

**面板 4 — 内容链路**

- 发布成功 / 失败趋势
- `publication_not_ready` 失败原因分布
- revalidation 成功率与耗时

**面板 5 — 数据层（SQLite 特有）**

- DB 文件大小趋势
- journal mode（静态展示即可）
- 备份成功率与最近一次备份时间

**面板 6 — 空间索引**

- bbox 查询耗时（`/api/v1/places`）
- R\*Tree 索引条目数 vs `place_rtree_ids` 行数（两者背离即索引未重建，见 RUNBOOK §5.3）

## 5. 数据体检

SQLite 与 PostgreSQL 的运维手段差别很大，本节只写 SQLite 适用且真实可执行的检查。

### 5.1 完整性检查

```bash
sqlite3 "<db-path>.db" "PRAGMA integrity_check;"
```

期望输出单行 `ok`。

出现错误信息时会列出具体问题。**恢复演练（RUNBOOK §3.4）后必须执行此项** —— 它能发现部分（但非全部）文件损坏。

`integrity_check` 只覆盖数据库文件本身的结构完整性。**它无法检测「备份时丢了 WAL 中未 checkpoint 的事务」这类问题** —— 那类损坏在结构上完全合法，只能靠行数核对发现。

### 5.2 journal mode 检查

```bash
sqlite3 "<db-path>.db" "PRAGMA journal_mode;"
```

| 返回值     | 含义                   | 运维影响                                                      |
| ---------- | ---------------------- | ------------------------------------------------------------- |
| `delete`   | 回滚日志模式           | 写操作持有排他锁；并发读写阻塞                                |
| `truncate` | 同上，日志文件截断复用 | 同上                                                          |
| `persist`  | 同上，日志文件持久化   | 同上                                                          |
| `wal`      | 预写日志               | **读写可并发**，锁竞争显著减少；产生 `-wal` / `-shm` 附属文件 |

**与备份的强关联**：`wal` 模式下数据可能部分存在于 `.db-wal` 中，**直接拷贝 `.db` 文件会得到不一致快照**。这正是 RUNBOOK §3.1 要求使用 `.backup` 或 `VACUUM INTO` 的原因。备份时必须确认当前 journal mode。

修改 journal mode 属于生产数据 / 配置操作，**需人工批准**。

### 5.3 文件大小与增长

```bash
# 数据库主文件
ls -lh "<db-path>.db"

# WAL 附属文件（wal 模式下存在）
ls -lh "<db-path>.db-wal" "<db-path>.db-shm"
```

关注点：

- **主文件持续增长但不收缩**：SQLite 删除数据后不会自动缩小文件空间。空间在文件内被标记为可复用，但 `ls` 看到的文件大小不变。
- **`-wal` 文件异常大**：说明有长时间未关闭的读事务，或 checkpoint 未能进行。WAL 文件持续增长需要干预。
- **磁盘占用**：主文件 + WAL 文件总和需纳入磁盘容量监控。

需要压缩时使用 `VACUUM`（会重写整个库，**需停机窗口与人工批准**），或 `VACUUM INTO` 产出一个紧凑的新文件再切换。

### 5.4 慢查询分析

**API 侧的 bbox 查询**（`apps/api/src/modules/places/places-query.service.ts:199-221`）是当前最值得关注的查询，它经 R\*Tree 虚表做粗筛：

```sql
EXPLAIN QUERY PLAN
SELECT p.content_id, c.slug, c.title
  FROM places_rtree r
  JOIN place_rtree_ids m ON m.rid = r.id
  JOIN places p ON p.content_id = m.content_id
  JOIN contents c ON c.id = p.content_id
 WHERE r.max_lon >= 1187000
   AND r.min_lon <= 1190000
   AND r.max_lat >= 3190000
   AND r.min_lat <= 3220000
   AND c.status = 'PUBLISHED'
   AND c.archived_at IS NULL;
```

**判读要点**：

1. **是否命中 R\*Tree**：执行计划中应出现 `VIRTUAL TABLE INDEX 3`（或类似 rtree 索引标识）。若显示为对 `places_rtree` 的全表扫描，说明 R\*Tree 没起作用。
2. **`place_rtree_ids` 关联是否走索引**：迁移中建了 `place_rtree_ids_content_id_idx`（`20261009130000_place_spatial_index/migration.sql:38`），计划中应体现为索引查找。
3. **坐标放大因子**：R\*Tree 用整型，坐标放大 10000 倍（`COORD_SCALE`，约 11 m 精度）。粗筛可能带进 bbox 外 ±11 m 的点，最终判定在应用层用浮点比较（`places-query.service.ts:223-233`）。

**索引健康自查**：

```bash
sqlite3 "<db-path>.db" "SELECT COUNT(*) FROM places_rtree;"
sqlite3 "<db-path>.db" "SELECT COUNT(*) FROM place_rtree_ids WHERE lon IS NOT NULL AND lat IS NOT NULL;"
```

> 两者数量**明显背离**（例如虚表为 0 而映射表非空）即说明索引未重建，对应 RUNBOOK §5.3 的事故处置。注意二者**不必严格相等**：`place_rtree_ids` 中 `lon` 或 `lat` 为 NULL 的行会被 `rebuildIndex()` 的 `WHERE lon IS NOT NULL AND lat IS NOT NULL` 过滤掉，因此虚表条目数应当**小于等于**过滤后的映射表行数。

### 5.5 完整性体检清单

建议的定期检查（频率待人工确定）：

```bash
# 1. 结构完整性
sqlite3 "<db-path>.db" "PRAGMA integrity_check;"

# 2. journal mode（决定备份方式）
sqlite3 "<db-path>.db" "PRAGMA journal_mode;"

# 3. 空间索引一致性
sqlite3 "<db-path>.db" "SELECT
  (SELECT COUNT(*) FROM places_rtree) AS rtree_rows,
  (SELECT COUNT(*) FROM place_rtree_ids WHERE lon IS NOT NULL AND lat IS NOT NULL) AS map_rows;"

# 4. 文件大小
ls -lh "<db-path>.db" "<db-path>.db-wal" "<db-path>.db-shm" 2>/dev/null

# 5. 迁移状态（确认 schema 已是最新）
pnpm --filter @nanking-atlas/database exec prisma migrate status
```

第 3 项中若 `rtree_rows < map_rows`，说明有坐标变更后未触发 `rebuildIndex()`，用 ADMIN 角色调用 `POST /api/v1/admin/places/reindex` 修复（RUNBOOK §5.3）。

## 6. 待人工决策事项

1. **可观测性方案选型**：指标采集器（`prom-client` vs OTel SDK）、暴露方式、鉴权策略。引入新依赖需按 AGENTS.md §6.5 说明用途与许可。
2. **告警接收人与通道**：技术方案 §19 要求 P4 前确定，当前无人接收。
3. **日志脱敏补齐**：`redact` 配置缺失（§1.4），是否在 P4 内补上并加测试。
4. **日志保留期与聚合后端**：日志目前只落在进程 stdout，无聚合与检索后端。
5. **数据体检频率**：§5.5 清单的执行频率（每日 / 每周）未确定。
