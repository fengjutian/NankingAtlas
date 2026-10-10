# Nanking Atlas 开发任务清单

规则：按依赖顺序实施；每项完成必须附代码、测试和验证结果。`[ ]` 只有在验收条件实际满足后才能改为 `[x]`。

> 数据层相关任务的 PostgreSQL/PostGIS 表述已被
> [`adr/0001-sqlite-data-layer.md`](adr/0001-sqlite-data-layer.md) 取代为 SQLite + R\*Tree，
> 下文相关行已同步修订。

## P0 工程基础

- [ ] P0-01 初始化 pnpm workspace、Turborepo、根脚本和单一 lockfile。
- [ ] P0-02 创建 `apps/web`、`apps/admin`、`apps/api`，确保独立 build/dev/test。
- [ ] P0-03 创建共享 strict tsconfig、ESLint、Prettier 和环境变量校验。
- [ ] P0-04 创建 `api-contract`、`database`、`ui`、`validation` 包及依赖边界检查。
- [ ] P0-05 配置 CI：format、lint、typecheck、test、build、secret scan。
- [ ] P0-06 实现品牌 tokens、响应式导航、页面 shell、404/错误/加载状态。
- [ ] P0-07 实现公开站静态首页原型和管理后台 shell。
- [ ] P0-08 实现 API request-id、统一错误、live/ready health、结构化日志。
- [ ] P0-09 提供 `.env.example`、本地启动文档和无秘密的开发配置。

验收：新环境按 README 可启动三应用；lint/typecheck/test/build 全通过；无真实密钥。

## P1 内容与后台

- [ ] P1-01 建立 SQLite 本地环境、Prisma schema 和初始迁移。
- [ ] P1-02 实现 users、roles、登录、刷新、登出、禁用与限流。
- [ ] P1-03 实现服务端 RBAC/resource guard 及 401/403 安全测试。
- [ ] P1-04 实现 contents 与类型扩展 CRUD、slug、乐观锁和软删除。
- [ ] P1-05 实现 sources、relations、tags 及完整性约束。
- [ ] P1-06 实现 Tiptap JSON schema、白名单校验和安全渲染。
- [ ] P1-07 实现 revisions、review_actions、audit_logs 只增记录。
- [ ] P1-08 实现状态机、审核界面、退回理由和 publication readiness。
- [ ] P1-09 实现 upload intent、对象确认、元数据与版权校验。
- [ ] P1-10 实现后台列表、编辑器八区、自动保存和冲突 UI。
- [ ] P1-11 生成 OpenAPI 与前端客户端，加入 breaking change 检查。

验收：E2E 完成建稿—来源—送审—退回/通过—发布；Editor 无法绕过权限；修订与审计可追溯。

## P2 公开网站

- [ ] P2-01 实现 public content/homepage API，仅返回已发布内容。
- [ ] P2-02 实现首页可配置槽位与后台配置。
- [ ] P2-03 实现文化志、生活录列表与统一档案详情模板。
- [ ] P2-04 实现文章详情 TOC、来源、关系、版权和纠错入口。
- [ ] P2-05 实现地点、人物、事件、建筑、专题、路线详情。
- [ ] P2-06 实现 metadata、canonical、OG、JSON-LD、robots、sitemap。
- [ ] P2-07 实现签名 revalidation、失败重试与告警。
- [ ] P2-08 完成响应式、WCAG AA 自动检查与键盘人工验收。

验收：后台发布可在稳定 URL 访问；撤回正确失效；SEO 与移动端验收通过。

## P3 地图与发现

- [ ] P3-01 实现 SQLite R\*Tree point、bbox、距离查询与空间索引。
- [ ] P3-02 实现 `/map` 列表优先、Leaflet 延迟加载和底图配置。
- [ ] P3-03 实现类型筛选、搜索、marker/card 双向联动和 URL 状态。
- [ ] P3-04 实现地图错误/离线降级、请求取消、视口查询限制。
- [ ] P3-05 实现 SQLite 搜索索引、相关度、别名和无结果建议。
- [ ] P3-06 实现路线有序站点与地图展示。
- [ ] P3-07 完成地图键盘、读屏和移动手势测试。

验收：已核实地点正确联动；不可靠坐标不显示精确点；底图失败不阻断内容访问。

## P4 上线与运营

- [ ] P4-01 建立 staging 与 production 隔离配置和部署流程。
- [ ] P4-02 完成应用安全测试、依赖扫描、上传攻击测试和修复。
- [ ] P4-03 完成核心 E2E、视觉回归、Lighthouse 和 API 压测基线。
- [ ] P4-04 配置日志、指标、告警和仪表盘。
- [ ] P4-05 配置数据库与对象存储备份，在隔离环境恢复并记录结果。
- [ ] P4-06 编写发布、回滚、恢复、密钥轮换、事故处理 runbook。
- [ ] P4-07 核验域名、HTTPS、CORS/CSP、底图许可、隐私与版权文本。
- [ ] P4-08 导入经过史实、坐标、来源和版权人工核验的首批内容。

验收：16 项产品验收清单全部有证据；生产发布经过明确人工批准；监控与恢复演练有效。

