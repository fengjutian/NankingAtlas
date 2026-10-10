# Nanking Atlas 完整技术实现方案

版本：1.1  
状态：实施基线  
日期：2026-10-10  
需求来源：[`PRODUCT_REQUIREMENTS.md`](PRODUCT_REQUIREMENTS.md)

> **数据层已由 ADR 取代**：本文档原先的 PostgreSQL/PostGIS 选型已被
> [`adr/0001-sqlite-data-layer.md`](adr/0001-sqlite-data-layer.md) 取代为
> **SQLite + R\*Tree**。标注「已由 ADR-0001 取代」的行保留原始记录，不再是实施依据。
> 地图选型（Leaflet / 高德）不在该 ADR 范围内。

## 1. 实施目标与边界

首期交付一个可持续运营的城市文化内容平台，而不是一次性展示站。系统必须打通“编辑建稿 → 来源与版权补全 → 提交审核 → 审核通过 → 发布 → 公开站点更新 → 可追溯修订”的完整链路，并提供可降级的互动地图。

MVP 包含公开站、独立管理后台、统一 API、SQLite（空间索引用 R\*Tree）、对象存储、内容审核、审计、搜索、地图、备份和监控。社区、支付、原生 App、自动 AI 发布、大规模知识图谱均不在 MVP 范围。

## 2. 不可变架构决策

| 层 | 选型 | 实施决定 |
| --- | --- | --- |
| Monorepo | pnpm workspace + Turborepo | 一个仓库，三个可独立部署应用，共享契约与配置 |
| 公开站 | Next.js、React、TypeScript、Tailwind CSS | App Router；公开内容优先服务端渲染/静态再验证；地图仅客户端加载 |
| 管理后台 | React、Vite、TypeScript、Tailwind CSS、shadcn/ui | 静态 SPA；所有写入经 API；不得直连数据库 |
| API | NestJS、TypeScript、REST | `/api/v1`；模块化单体；OpenAPI 为接口事实来源 |
| 数据库 | **SQLite** | 权威数据源；事务、约束在服务端执行；空间索引用 R\*Tree（见 [ADR-0001](adr/0001-sqlite-data-layer.md)）。~~PostgreSQL + PostGIS~~ 已由 ADR-0001 取代 |
| ORM | Prisma | 常规 CRUD 与迁移；R\*Tree 虚表经由受审查的 SQL migration 建立、由应用层显式重建（触发器不能写虚表） |
| 编辑器 | Tiptap | 保存受控 JSON 文档；服务端白名单校验；渲染时二次净化 |
| 地图 | **Leaflet**（渲染）+ **高德 JS API 2.0**（数据） | 底图用 OSM 标准瓦片（WGS-84），高德只做地理编码。详见 [ADR-0003](adr/0003-leaflet-render-amap-data.md) |
| 文件 | S3 兼容对象存储 | 浏览器只使用 API 签发的短期上传凭证；元数据入库 |
| 搜索 | **SQLite `LIKE` + 通配符转义** | 首期不引入 Elasticsearch；无 `pg_trgm` 相似度。~~PostgreSQL + `pg_trgm`~~ 已由 ADR-0001 取代 |

除非 ADR 经维护者批准，不得替换上述技术栈，不得提前拆微服务、引入消息队列或独立搜索集群。

## 3. 仓库结构

```text
apps/
  web/                 # Next.js 公开站
  admin/               # Vite 管理后台
  api/                 # NestJS API
packages/
  api-contract/        # OpenAPI 生成的客户端与 DTO 类型
  database/            # Prisma schema、迁移、seed
  eslint-config/       # 共享 lint 规则
  tsconfig/            # 共享 strict 配置
  ui/                  # 无业务状态的共享视觉组件与 tokens
  validation/          # 可共享的纯校验规则
docs/
  adr/                 # 架构决策记录（ADR-0001：SQLite + R*Tree 数据层）
  runbooks/            # 发布、回滚、备份恢复、事故处理
  PRODUCT_REQUIREMENTS.md
  TECHNICAL_IMPLEMENTATION.md
  IMPLEMENTATION_BACKLOG.md
.github/workflows/     # CI
```

依赖方向固定为 `apps → packages`。`packages` 之间禁止环依赖；`web` 和 `admin` 禁止导入 API 内部代码或 Prisma client。跨应用契约来自 OpenAPI 生成物，不能手写两套漂移的 DTO。

## 4. 运行时与请求边界

```text
访客 → Netlify/CDN → Web → Public API → SQLite（R\*Tree 空间索引）
编辑人员 → Admin → Authenticated API ─┬→ SQLite（需持久卷，见 ADR-0001 §5.2）
                                      └→ S3-compatible storage
发布事件 → API transaction → cache/revalidation request → Web
```

- Web 只读取 `published` 且到达发布时间的内容。
- Admin 只通过 HTTPS API 工作。
- API 是认证、授权、状态流转、审计和数据完整性的唯一执行者。
- 数据库和对象存储不公开暴露管理凭据。
- 缓存是优化层，不是权威数据源；MVP 可无 Redis 运行。

## 5. 领域模型

### 5.1 核心枚举

```text
ContentType = ARTICLE | PLACE | PERSON | EVENT | ARCHITECTURE | TRADITION | TOPIC | ROUTE
ContentStatus = DRAFT | IN_REVIEW | APPROVED | PUBLISHED | ARCHIVED
Role = EDITOR | REVIEWER | ADMIN
SourceKind = BOOK | JOURNAL | ARCHIVE | WEBSITE | INTERVIEW | FIELD_NOTE | OTHER
LocationAccuracy = EXACT | APPROXIMATE | AREA_ONLY | UNKNOWN
VerificationStatus = UNVERIFIED | PARTIAL | VERIFIED | DISPUTED
RightsStatus = UNKNOWN | LICENSED | PUBLIC_DOMAIN | FAIR_USE_REVIEWED | OWNED | RESTRICTED
```

### 5.2 表与职责

| 表 | 关键字段/约束 |
| --- | --- |
| `users` | id、email unique、password_hash、display_name、disabled_at、timestamps |
| `user_roles` | `(user_id, role)` unique；角色由管理员维护 |
| `contents` | id UUID、type、slug unique、title、subtitle、summary、body_json、status、language、version、created_by、updated_by、published_at、archived_at、timestamps |
| `places` | content_id PK/FK、address、lon REAL、lat REAL、accuracy、verification_status；无可靠坐标时 lon/lat 必须为空。空间索引为独立 R\*Tree 虚表 `places_rtree`（不在 Prisma model 中表达） |
| `people` | content_id PK/FK、birth_text、death_text、biography_note |
| `events` | content_id PK/FK、start_date、end_date、date_precision、date_note |
| `architectures` | content_id PK/FK、built_period、current_condition、heritage_level |
| `traditions` | content_id PK/FK、tradition_type、transmission_method |
| `topics` | content_id PK/FK、curator_note |
| `routes` | content_id PK/FK、duration_minutes、distance_meters |
| `route_stops` | route_id、place_id、position、note；`(route_id, position)` unique |
| `content_relations` | source_content_id、target_content_id、relation_type、direction_note；禁止自关联和重复关系 |
| `sources` | id、kind、title、author、publisher、publication_date、url、accessed_at、citation_text、verification_note |
| `content_sources` | content_id、source_id、claim_scope、page_reference、is_primary；组合唯一 |
| `media` | id、object_key unique、mime_type、size、width、height、checksum、creator、rights_status、license、credit_line、alt_text、created_by |
| `content_media` | content_id、media_id、usage、position、caption；组合唯一 |
| `tags` / `content_tags` | 标签 slug 唯一；连接表组合唯一 |
| `revisions` | content_id、revision_no、snapshot_json、created_by、created_at；`(content_id, revision_no)` unique，只增不改 |
| `review_actions` | content_id、action、from_status、to_status、comment、actor_id、created_at；只增不改 |
| `audit_logs` | actor_id、request_id、action、entity_type、entity_id、before_json、after_json、ip_hash、created_at；只增不改 |
| `homepage_slots` | slot_key、content_id、position、starts_at、ends_at；由后台配置 |

所有业务表使用 cuid 主键、UTC 时间和 `created_at/updated_at`。SQLite 无原生 ENUM，enum 列存为 String，取值范围由 `packages/database/src/enums.ts` 的字面量联合 + zod 在应用层保证。显示日期按用户时区格式化。删除默认软删除；revision、review action、audit log 不允许普通业务接口删除。

### 5.3 数据库强约束

- `slug` 采用小写 ASCII、数字和连字符，并全局唯一；发布后变更必须建立 redirect 记录。
- `PUBLISHED` 内容必须具备标题、摘要、正文、至少一项来源或明确的原创/采访说明。
- 使用中的图片必须有 alt、credit line 与 rights status；`UNKNOWN/RESTRICTED` 不得公开发布。
- `lon/lat` 经纬度范围必须有效；`accuracy=UNKNOWN` 时不得有精确坐标。空间查询走 R\*Tree 粗筛 + 应用层浮点精确判定两段式。
- 关系两端必须存在；关系类型由受控字典校验。
- 并发更新使用 `version` 乐观锁；冲突返回 409，不得静默覆盖。
- 所有状态变更与正文保存使用事务，并同步写 revision/review/audit 记录。

## 6. 内容状态机与权限

允许流转：

```text
DRAFT → IN_REVIEW → APPROVED → PUBLISHED → ARCHIVED
          ↓              ↓
        DRAFT          DRAFT
```

| 操作 | Editor | Reviewer | Admin |
| --- | ---: | ---: | ---: |
| 创建/编辑草稿 | 是 | 是 | 是 |
| 提交审核 | 是 | 是 | 是 |
| 审核通过/退回 | 否 | 是 | 是 |
| 发布/撤回/归档 | 否 | 是 | 是 |
| 用户和角色管理 | 否 | 否 | 是 |
| 永久删除 | 否 | 否 | 仅受控运维流程 |

服务端守卫同时检查身份、角色、资源当前状态和动作。前端隐藏按钮只是体验优化，不构成授权。审核自己的稿件在 MVP 默认禁止；如未来开放，必须以配置和审计明确记录。

发布前服务端执行 `PublicationReadiness` 校验：来源、版权、必填字段、关系完整性、坐标核实状态、正文安全、slug、SEO 元数据。任一项失败返回结构化 422，不能通过参数跳过。

## 7. API 契约

### 7.1 共同约定

- Base URL：`/api/v1`；JSON；UTF-8；时间为 ISO 8601 UTC。
- 列表采用游标分页；默认 20，最大 100。
- 每个响应返回 `X-Request-Id`；客户端可传合法 request id，否则服务端生成。
- 错误使用 `{ error: { code, message, details?, requestId } }`，生产环境不暴露堆栈。
- 写接口接收 `Idempotency-Key` 的场景：发布、上传完成确认、批量操作。
- 更新带 `If-Match`/version；版本不一致返回 `CONTENT_VERSION_CONFLICT`。

### 7.2 公开接口

```text
GET /contents?type=&tag=&cursor=&limit=
GET /contents/:slug
GET /places?bbox=&type=&q=&cursor=&limit=
GET /places/:slug
GET /topics/:slug
GET /routes/:slug
GET /search?q=&type=&cursor=&limit=
GET /homepage
GET /sitemap-index
```

公开接口只返回已发布字段，不泄露内部备注、未公开来源附件、人员邮箱或审核记录。地图查询要求合法 bbox，并有面积和结果数上限。

### 7.3 后台接口

```text
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
GET/POST /admin/contents
GET/PATCH /admin/contents/:id
POST /admin/contents/:id/submit
POST /admin/contents/:id/approve
POST /admin/contents/:id/reject
POST /admin/contents/:id/publish
POST /admin/contents/:id/archive
GET  /admin/contents/:id/revisions
GET/POST/PATCH /admin/sources
GET/POST/PATCH /admin/relations
GET/POST/PATCH /admin/media
POST /admin/media/upload-intents
POST /admin/media/:id/complete
GET/PATCH /admin/homepage-slots
GET /admin/audit-logs
GET/POST/PATCH /admin/users
```

OpenAPI 在 API CI 中生成并做 breaking-change 检查；Web/Admin 使用生成客户端。接口变更必须先更新契约与测试。

## 8. 认证与应用安全

- 密码使用 Argon2id；登录、刷新、找回操作限流；统一失败文案避免账号枚举。
- 管理后台优先使用服务端签发的短期 access token 加旋转 refresh token；refresh token 只放 `HttpOnly + Secure + SameSite` Cookie，并存储哈希与撤销状态。
- Cookie 写操作启用 CSRF 防护；CORS 仅允许配置中的公开站/后台源，禁止通配符携带凭据。
- Tiptap JSON 节点和 mark 使用白名单；URL 协议限定；公开渲染再做 XSS 净化。
- DTO 开启 whitelist 与 forbid non-whitelisted；SQL 只参数化；上传校验 MIME、魔数、大小、尺寸、扩展名，重编码图片并隔离扫描。
- Helmet、安全响应头、严格 CSP、Referrer-Policy、Permissions-Policy；生产环境关闭 Swagger 或置于管理员认证后。
- 密钥只由部署平台注入；日志不得记录密码、token、Cookie、对象存储密钥和完整个人信息。
- 审计日志覆盖登录、权限、内容写入、审核、发布、撤回、文件操作；保存策略写入运维 runbook。

## 9. 公开站实现

### 9.1 页面与渲染

| 路由 | 策略 | 关键实现 |
| --- | --- | --- |
| `/` | ISR | 后台槽位、精选、最新内容、地图入口 |
| `/chronicle`, `/living` | SSR/ISR | URL 可分享的筛选与分页 |
| `/chronicle/[slug]` | ISR | TOC、来源、实体关系、纠错入口、JSON-LD |
| `/map` | SSR shell + client map | 列表先可用，Leaflet 动态加载，bbox 查询 |
| `/places/[slug]` | ISR | 地点、精度说明、历史沿革、关联内容 |
| `/people/[slug]` 等 | ISR | 统一档案模板加类型字段 |
| `/topics/[slug]`, `/routes/[slug]` | ISR | 策展内容与有序站点 |
| `/search` | SSR | 关键词、类型筛选、无结果建议 |
| `/about`, `/sources` | static | 原则、引用、版权、纠错 |

发布成功后 API 以签名请求触发受影响路径 revalidation；失败进入重试并告警，但数据库发布事务不依赖 Netlify 成功。公开站设置合理 TTL，最终可自行收敛。

### 9.2 地图降级

- 首屏先渲染地点列表与筛选，地图块延迟加载。
- 底图脚本、瓦片或 WebGL 失败时显示明确提示，不隐藏列表。
- marker 与卡片共享 selection state；键盘选择卡片可聚焦 marker。
- 只加载当前视口 bbox 数据，移动结束后去抖请求；取消过期请求。
- 未核实或仅区域级位置不画精确点，可显示区域说明。

### 9.3 SEO 与可访问性

- 每页唯一 title、description、canonical、Open Graph、中文 `lang`。
- 文章使用 `Article`，地点使用合适的 Place JSON-LD；仅输出经过核实的数据。
- sitemap 仅含公开内容；归档或撤回后移除并正确返回 404/410 或 redirect。
- WCAG 2.2 AA 为目标：键盘操作、焦点可见、语义标题、图片 alt、表单错误关联、对比度、减少动画偏好。

## 10. 管理后台实现

- 登录后按权限生成导航，但路由仍需 API 授权。
- 内容列表支持状态、类型、作者、更新时间筛选；保存筛选至 URL。
- 编辑器分为正文、基础信息、类型字段、关系、来源、媒体、SEO、发布检查八区。
- 自动保存采用防抖草稿保存和乐观锁；冲突时展示差异并要求人工选择，不做 last-write-wins。
- 离开未保存页面前警告；所有成功/失败提供可访问反馈。
- 审核界面展示当前稿、上一版本、来源、版权、争议注记和 readiness 结果；退回理由必填。
- 媒体上传走 intent → direct upload → complete 三步；未完成对象定期清理。
- 审计页只读，支持受限筛选和分页，不提供普通删除按钮。

## 11. 搜索实现

- 建立规范化搜索文档：标题、别名、摘要、正文纯文本、标签、地点名。
- 中文初期使用 `LIKE` + 转义通配符（`ESCAPE '\'`）与受控关键词组合；无 trigram 相似度，按命中字段、发布时间排序。~~标题/别名 `pg_trgm`、ILIKE~~ 已由 ADR-0001 取代。
- 必须转义用户输入的 `%` 与 `_`，否则一次请求可拖回全部已发布内容。
- 查询长度 2–100；转义通配符；限制耗时；无结果返回推荐标签而不是虚构答案。
- 记录匿名化查询词、耗时、结果数，用于决定是否引入中文分词或专用搜索服务。

## 12. 图片与版权链路

1. Admin 向 API 申请 upload intent，提交预期类型、大小、checksum。
2. API 鉴权后签发短期、限定 key/type/size 的上传地址。
3. 客户端直传对象存储，再向 API complete。
4. 后台任务校验对象、提取尺寸、生成 WebP/AVIF 衍生图；原图按授权策略保存。
5. 编辑补充创作者、来源、许可、credit、alt；readiness 检查通过后才能公开引用。

禁止把附件中的外链示意图直接当作正式资产上线。所有首批媒体必须有人工作版权核验。

## 13. 可观测性、备份与恢复

- `/health/live` 只检查进程；`/health/ready` 检查数据库和必要依赖，不泄露细节。
- 结构化 JSON 日志含 timestamp、level、service、environment、requestId、route、status、duration；个人信息脱敏。
- 指标：请求量、p50/p95/p99、5xx、登录失败、发布失败、DB pool、慢查询、上传失败、revalidation 失败。
- SQLite 文件级备份，使用 `.backup` 或 `VACUUM INTO`（WAL 模式下直接拷贝 `.db` 会得到不一致快照）；**无 PITR**，RPO = 距上次备份的间隔；对象存储开启版本化/生命周期；配置与迁移纳入版本控制。详见 `docs/RUNBOOK.md`。
- SQLite 无连接池，`db_pool_*` 类指标不适用；以文件大小增长与慢查询替代（见 `docs/OPERATIONS.md`）。
- 每季度在隔离环境做恢复演练，记录 RPO/RTO 实测。未做恢复验证不能声称“已备份可恢复”。

## 14. 环境与配置

环境：local、test、staging、production，数据与凭据完全隔离。提交 `.env.example` 但不提交真实值。

```text
NODE_ENV
APP_ENV
WEB_ORIGIN
ADMIN_ORIGIN
API_PUBLIC_URL
DATABASE_URL
AUTH_ACCESS_SECRET
AUTH_REFRESH_SECRET
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
MAP_TILE_URL
MAP_ATTRIBUTION
REVALIDATION_URL
REVALIDATION_SECRET
```

配置在启动时以 schema 校验；缺少生产必需项立即失败。开发种子数据必须显著标记为演示内容，不能迁入生产。

## 15. CI/CD 与发布

每个 PR 执行：安装锁定依赖 → format check → lint → TypeScript → unit tests → API integration tests → build → migration lint → dependency/secret scan。依赖扫描门禁为 `pnpm audit --prod --audit-level high`（只卡生产依赖；dev 依赖处置见 [ADR-0002](adr/0002-dependency-vulnerability-policy.md)）。主分支额外构建三个部署产物和 E2E smoke。

发布顺序：

1. 备份与迁移兼容性检查。
2. 执行向后兼容的数据库迁移（单一受控 job）。
3. 部署 API，完成 readiness/smoke。
4. 部署 Admin 与 Web 预览，跑 E2E/视觉检查。
5. 切生产流量并观察指标。
6. 数据回填与破坏性清理放在后续独立发布。

回滚优先回滚应用；数据库使用 expand/contract 迁移，避免依赖不可逆即时回滚。每次上线必须有变更说明、验证结果、负责人和回滚条件。

## 16. 测试策略与质量门槛

| 层 | 范围 |
| --- | --- |
| 单元 | 状态机、RBAC、readiness、slug、日期精度、版权与坐标规则 |
| 集成 | API + 真实 SQLite 数据库（迁移 SQL 在空库真实执行，含 R\*Tree 虚表）；事务、并发、空间查询、审计 |
| 契约 | OpenAPI schema、生成客户端、错误码、分页 |
| 组件 | 编辑器表单、冲突处理、地图/列表联动、错误状态 |
| E2E | 登录、建稿、补来源、送审、退回/通过、发布、公开可见、撤回 |
| 安全 | 未认证、越权、IDOR、CSRF、XSS、SQL 注入、恶意上传、限流 |
| 无障碍 | axe + 键盘人工检查 |
| 性能 | Lighthouse；公开 API 和 bbox 搜索压测；指标以 staging 实测定基线 |

合并门槛：相关测试通过、无新增高危漏洞、迁移可在测试库从零执行、文档同步。不得用跳过测试、删除断言、`any` 或吞异常来制造绿色结果。

## 17. 关键验收场景

1. Editor 可创建草稿但调用 publish 返回 403；Reviewer 可审核发布，审计记录完整。
2. 无来源或版权未知的内容发布返回 422，明确列出缺项。
3. 两人同时编辑，后保存者得到 409 和版本信息，原修改不被覆盖。
4. 已发布地点出现在地图和列表；无坐标/未核实地点不出现精确 marker。
5. 地图服务失败时列表、筛选和详情链接仍可用。
6. 发布后公开 URL、SEO、sitemap 和关联内容正确；撤回后不可继续公开访问。
7. 所有受保护接口在未登录时 401、权限不足时 403，且不泄露资源细节。
8. 备份能在隔离环境恢复，并形成带时间和结果的演练记录。

## 18. 分阶段交付定义

- P0：workspace、三个应用、共享配置、CI、品牌 tokens、静态首页、健康检查；本地一条命令启动。
- P1：数据库迁移、认证/RBAC、内容/来源/媒体、版本与审核、后台 MVP；完整审核链可测试。
- P2：公开首页、栏目、详情、专题、SEO、revalidation；发布内容可稳定访问。
- P3：SQLite R\*Tree bbox 查询、地图联动、搜索、路线、降级；地图验收场景通过。
- P4：安全/E2E/性能、备份恢复、监控、staging、生产 runbook、首批核验内容。

每个阶段只有在代码、迁移、测试、文档和验收证据全部存在时才算完成。

## 19. 未决事项与决策时点

以下问题不阻塞 P0，但必须在对应阶段开始前由维护者确认并记录 ADR：

- P1 前：API/数据库（SQLite 需带持久卷的主机）/Object storage 实际托管商、邮件/通知供应商、账号初始化流程。
- P2 前：正式域名、纠错入口接收方式、隐私与版权文本负责人。
- P3 前：合法可用的底图供应商、配额、attribution 与中国大陆坐标/合规策略。
- P4 前：备份保留周期、RPO/RTO、日志保留期、生产告警接收人、ICP备案/等保等适用性评估。

代理不得替用户购买服务、创建付费资源、发布生产环境或假定这些事项已经批准。

