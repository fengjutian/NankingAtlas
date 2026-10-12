# Nanking Atlas 完整功能开发与 MiniMax 执行手册

版本：1.0  
状态：开发执行基线（不代表功能已完成）  
更新日期：2026-10-12  
适用仓库：`NankingAtlas`  
适用代理：MiniMax、Codex 及其他编码代理

## 0. 文档目的

本文档把产品需求、技术约束、当前代码现状和未完成工作整理为可逐项验收的开发计划，并提供可以直接交给 MiniMax 的提示词。

本文档不能代替以下强制文件。任何代理开始工作前，必须完整阅读：

1. `AGENTS.md`
2. `docs/PRODUCT_REQUIREMENTS.md`
3. `docs/TECHNICAL_IMPLEMENTATION.md`
4. `docs/IMPLEMENTATION_BACKLOG.md`
5. `docs/MINIMAX_IMPLEMENTATION_GUIDE.md`
6. `docs/adr/0001-sqlite-data-layer.md`
7. `docs/adr/0002-dependency-vulnerability-policy.md`
8. `docs/adr/0003-leaflet-render-amap-data.md`
9. 当前任务涉及的代码、测试、迁移和运维文档

本文档遵循以下真实性原则：

- “存在代码”不等于“完成验收”。
- “存在界面”不等于“已经持久化”。
- “存在测试文件”不等于“测试已经通过”。
- “存在 Runbook”不等于“生产基础设施已经配置”。
- `docs/IMPLEMENTATION_BACKLOG.md` 当前未勾选的项目，不得仅因本文档的分析而改为完成。
- 所有历史内容、坐标、来源和版权必须经过人工核验，AI 不得自动发布。

---

## 1. 已批准架构与不可擅自变更事项

### 1.1 固定技术栈

| 范围     | 固定选型                                   |
| -------- | ------------------------------------------ |
| Monorepo | pnpm workspace + Turborepo                 |
| 公共网站 | Next.js + React + TypeScript               |
| 管理后台 | React + Vite + TypeScript                  |
| API      | NestJS + REST + OpenAPI                    |
| 数据层   | SQLite + Prisma                            |
| 空间索引 | SQLite R\*Tree；`lon/lat` REAL 为权威值    |
| 地图     | Leaflet 负责渲染；高德提供合规地图数据     |
| 富文本   | Tiptap JSON 文档                           |
| 密码     | Argon2id                                   |
| 测试     | Vitest + 真实 SQLite 集成测试 + Playwright |

### 1.2 架构边界

```text
浏览器
├── apps/web（公开站） ──────┐
└── apps/admin（管理后台） ─┼── HTTPS/REST ── apps/api ── Prisma ── SQLite + R*Tree
                             │
                             └── 对象存储（尚未接入，需人工批准供应商）
```

必须保持：

- Web 和 Admin 不得直接访问数据库。
- API 是认证、授权、状态流转、发布校验和审计的唯一边界。
- 不得增加第二数据库或第二 ORM。
- 不得把浏览器 localStorage、静态 JSON 或内存数组作为业务持久化。
- 不得用普通经纬度全表扫描冒充 R\*Tree 空间索引。
- 不得将未核验地点显示为精确 marker。
- 未经维护者批准和 ADR，不得更换技术栈或部署架构。

### 1.3 必须人工确认的事项

遇到以下事项时，MiniMax 必须停止相关部分并请求维护者确认：

- 连接或购买对象存储、邮件、数据库、监控、告警等外部服务。
- 创建付费云资源或修改 DNS。
- 部署 staging/production。
- 执行生产数据导入、永久删除或破坏性迁移。
- 决定地图供应商许可、ICP备案、隐私条款或版权争议。
- 把未核验史实、坐标、来源或媒体标为已核验。
- 修改 SQLite + R\*Tree、Leaflet + 高德等已批准 ADR。

---

## 2. 当前实现基线

以下仅表示仓库中存在相应实现，仍需以测试和人工验收确认完成度。

### 2.1 工程基础

- pnpm workspace、Turborepo、共享 TypeScript/ESLint/Prettier 配置已存在。
- `apps/web`、`apps/admin`、`apps/api` 可独立定义构建脚本。
- `api-contract`、`database`、`ui`、`validation` 共享包已存在。
- GitHub Actions 已配置 format、lint、typecheck、unit/integration、build、E2E、依赖扫描和 secret scan。
- 三个应用均有环境变量示例文件。

### 2.2 API 与数据

- 用户、角色、登录、刷新、退出、禁用和限流相关代码已存在。
- 服务端鉴权、角色守卫、401/403 测试基础已存在。
- 内容 CRUD、slug、软删除、乐观锁和状态机已存在。
- 来源、标签、关系 API 已存在。
- revision、review action、audit log 数据模型及写入链路已存在。
- 发布 readiness 和签名 revalidation 已存在。
- SQLite 迁移、R\*Tree 索引、地点查询、搜索和路线查询代码已存在。
- OpenAPI 文档、生成客户端和 breaking-change 检查脚本已存在。

### 2.3 管理后台

- 登录、会话恢复、内容列表、内容编辑、自动保存和 409 冲突界面已存在。
- 多内容类型的专属字段编辑已存在。
- 审核状态操作和 readiness 展示已存在。
- 来源、标签、关系和媒体意图的基础操作入口已存在。

### 2.4 公开网站

- 首页、文化志、生活录、搜索、地图和多类型详情路由已存在。
- 来源、关系、版权、TOC、SEO、robots、sitemap 和 JSON-LD 基础已存在。
- 地图列表、Leaflet 渲染、筛选、URL 状态、错误降级和地址检索基础已存在。
- 内容生命周期和地图相关 Playwright 测试已存在。

### 2.5 明确仍是占位或未接入

- 媒体上传尚未连接真实对象存储。
- 后台正文尚未接入真正的 Tiptap 编辑器。
- Revision 历史尚无读取端点和后台展示。
- 来源关联仍需要手填来源 ID，缺少检索选择器。
- 监控、指标、告警和仪表盘尚未接入。
- staging/production 环境隔离尚未配置。
- 自动异地备份和生产恢复演练尚未完成。
- 首批正式内容尚需人工完成史实、来源、版权和坐标核验。

---

## 3. 开发总原则

### 3.1 一次只做一个可验证切片

每轮任务应满足：

- 有唯一任务编号。
- 有明确允许修改目录。
- 有明确排除范围。
- 有可自动验证的验收条件。
- 有失败状态、空状态、权限状态和并发状态。
- 完成后可以独立提交，不依赖一组未完成的半成品。

禁止一次要求 MiniMax “完成整个项目”或同时修改多个无关模块。

### 3.2 固定实现顺序

每个业务切片必须按以下顺序：

1. 阅读强制文档和当前实现。
2. 检查 `git status --short`，保护用户已有修改。
3. 声明范围、依赖、风险和验收条件。
4. 先更新契约、schema/迁移和失败测试。
5. 实现 API 领域逻辑、事务、鉴权和审计。
6. 更新 OpenAPI 和生成客户端。
7. 实现 Admin/Web UI 的 loading、empty、error、forbidden、conflict、success 状态。
8. 运行受影响测试。
9. 运行 format、lint、typecheck、test、build。
10. 检查差异、秘密泄露和无关修改。
11. 按 `AGENTS.md` 模板如实汇报。

### 3.3 缺陷修复顺序

1. 写一个能够稳定复现问题的测试。
2. 确认测试在修复前失败且原因正确。
3. 实现最小修复。
4. 确认新测试通过。
5. 运行相关回归测试。

禁止通过删除、跳过、放宽断言或修改验收标准让测试变绿。

---

## 4. 功能开发路线图

优先级说明：

- P0：阻塞内容生产或安全闭环，优先开发。
- P1：MVP 运营必需。
- P2：上线质量和可维护性。
- P3：后续增强。

## 5. P0：后台内容生产闭环

### FD-001 Revision 历史读取与展示

目标：让编辑和审核人员查看不可变的内容历史，而不是只写不读。

依赖：现有 `Revision`、`ReviewAction`、`AuditLog` 数据模型和内容鉴权。

API：

- `GET /api/v1/admin/contents/:id/revisions`
- 支持游标或页码分页，限制最大 page size。
- 返回 revisionNo、创建时间、操作人最小展示信息、动作、原因和安全的快照摘要。
- 只有有权查看该内容的 Editor、Reviewer、Admin 可以访问。
- 不泄露密码哈希、token、Cookie、内部错误和无关用户字段。

Admin：

- 在审核区展示版本时间线。
- 支持选择两个版本查看字段差异。
- 大正文差异应按块或节点展示，避免冻结浏览器。
- 包含 loading、empty、error、forbidden 状态。
- 历史不可编辑或删除。

测试：

- 未认证 401。
- 无权用户 403 或安全的 404 策略。
- revision 顺序稳定。
- revision 不可修改和删除。
- 状态流转后 revision、review action、audit log 同事务可见。

完成定义：API、OpenAPI、客户端、Admin UI、单测、真实 SQLite 集成测试全部通过。

### FD-002 来源库检索与选择器

目标：消除后台手填来源 ID 的临时工作方式。

API：

- 新增来源列表/检索端点。
- 支持 title、author、publisher、kind 检索和分页。
- 输入长度、分页大小和排序字段使用白名单。
- 返回数据必须足够区分同名来源，但不暴露内部字段。

Admin：

- 可搜索已有来源并关联。
- 可在同一流程创建新来源。
- 明确展示来源核验备注、访问日期和主来源状态。
- 防止重复关联，并能显示服务端完整性错误。
- 不得自动把来源标记为已核验。

测试：

- 空查询、无结果、超长查询、非法分页。
- 同名来源展示。
- 重复关联冲突。
- 越权创建和关联失败。

### FD-003 Tiptap 富文本编辑器

目标：用真正的 Tiptap 编辑器替换简化正文输入区，同时保持现有 Tiptap JSON 白名单。

范围：

- 段落、H2/H3、引用、有序/无序列表、链接、图片、图注、表格。
- 键盘快捷键、撤销/重做和焦点状态。
- 粘贴内容经过白名单净化。
- URL 仅允许批准协议。
- 编辑器输出必须继续通过共享 validation 包。
- 保存失败不得丢失本地草稿。
- 与现有自动保存、AbortController 和 409 冲突流程集成。

安全：

- 不允许脚本节点、事件属性、iframe、危险 URL 或任意 HTML。
- Web 渲染与 Admin 编辑使用同一份 schema 约束。
- 不得用 `dangerouslySetInnerHTML` 绕过验证。

可访问性：

- 工具栏按钮有可读名称和 pressed 状态。
- 编辑区可以纯键盘操作。
- 校验错误与字段建立 `aria-describedby` 关系。

测试：

- 每种允许节点的保存和回显。
- 危险节点/mark/URL 被拒绝。
- 自动保存、网络失败、冲突和重试。
- 键盘操作最小 E2E。

### FD-004 真实媒体上传适配层

目标：将当前占位 upload intent 改为真实对象存储上传闭环。

人工批准点：必须先由维护者确定 S3 兼容供应商、区域、bucket、CORS、生命周期和费用。

实现要求：

- 定义存储接口，业务服务不得依赖供应商专有 SDK 类型。
- 服务端签发短期、最小权限上传凭证或预签名 URL。
- object key 由服务端生成，客户端不可指定任意路径。
- complete 时服务端向对象存储确认对象存在，并核对大小、MIME、checksum。
- 图片验证魔数、像素尺寸和允许格式。
- 保存 creator、rightsStatus、license、creditLine、altText。
- 未满足版权与 alt 要求的媒体不得通过 publication readiness。
- orphan upload 有过期和清理策略。

测试：

- MIME 欺骗、超限大小、checksum 不符、过期意图、重复 complete。
- Editor 可以上传，未认证和越权失败。
- 外部存储失败时数据库不进入错误完成状态。
- 测试使用明确的 fake adapter，不把 fake 声称为生产存储。

### FD-005 用户与角色管理后台

目标：让 Admin 通过 UI 管理账户，而不是只能调用 API。

功能：

- 用户列表、搜索、分页和状态筛选。
- 创建用户。
- 启用/禁用用户。
- 分配 Editor、Reviewer、Admin 角色。
- 管理员不能误操作移除系统最后一个可用 Admin；若产品尚无此规则，先写决策记录。
- 密码只在创建/重置时输入，不回显、不记录日志。
- 所有写操作显示成功、失败和 request ID。

测试：

- Editor、Reviewer 均不能进入或调用用户写接口。
- 禁用用户的 refresh token 失效。
- 未知字段被 DTO 白名单拒绝。
- 角色变更写入 audit log。

### FD-006 审计日志查询后台

目标：为管理员提供只读、可追溯的审计能力。

功能：

- 按 actor、action、entityType、entityId、时间范围筛选。
- 游标分页。
- before/after JSON 安全格式化展示。
- 日志只读，不提供普通删除和修改。
- 敏感字段在写入前脱敏，不能只在 UI 隐藏。

测试：

- 非 Admin 拒绝访问。
- 分页稳定且不重不漏。
- 密码、token、Cookie、secret 不会出现在响应。

---

## 6. P1：内容配置与公开体验闭环

### FD-007 首页槽位管理

- 为现有 homepage slot API 增加 Admin 页面。
- 支持内容搜索、槽位选择、位置排序、开始/结束时间。
- 只能选择可用于公开展示的内容；服务端最终校验。
- 冲突、过期、撤回和删除内容有明确提示。
- 首页预览不得绕过发布状态。

### FD-008 标签与关系管理

- 标签列表、创建、重命名策略、使用次数。
- 关系创建时提供内容搜索，不手填目标 ID。
- 防止自关联和违反业务规则的重复关系。
- 双向/有向关系的展示语义由服务端统一定义。
- 公开详情展示关联人物、地点、事件、建筑、专题和路线。

### FD-009 路线编排后台

- 创建路线内容并搜索已核验地点作为站点。
- 支持键盘可操作的排序；拖拽只能作为增强功能。
- 站点 position 唯一且连续。
- 删除地点时不得破坏已发布路线的追溯。
- 公开路线页展示有序列表和地图连线。
- 无可靠坐标的站点保留列表内容，但不画精确点。

### FD-010 纠错反馈闭环

- 公开站纠错表单：目标内容、问题类型、说明、可选联系方式。
- 服务端输入验证、限流、垃圾内容防护和隐私最小化。
- 后台待处理/已处理状态与负责人。
- 纠错反馈不能直接修改或发布内容。
- 若引入邮件通知或验证码，必须先获外部服务批准。

### FD-011 搜索增强

- 建立内容别名管理。
- 调整多字段权重和稳定排序。
- 支持类型、时期、标签等筛选。
- 无结果时提供拼写或相近内容建议，但不得捏造内容。
- 为典型查询建立性能基线和回归测试。

### FD-012 地图核验工作流

- 后台明确区分 `UNKNOWN`、`AREA_ONLY`、`EXACT` 等地理精度。
- 坐标来源、核验人、核验时间和备注可追溯。
- 未核验坐标不得自动升级为精确点。
- 地址检索结果只是候选，不得自动保存为已核验事实。
- 发布 readiness 必须检查地点地理状态。

### FD-013 公开站完整内容体验

- 核对所有统一档案详情模板字段。
- 完成相关内容推荐。
- 完成版权、摄影者、媒体来源展示。
- 完成外部链接安全属性。
- 完成文章表格、图片、图注和引用渲染。
- 为撤回、404、API 失败和空结果提供一致体验。

---

## 7. P2：安全、质量与可访问性

### FD-014 CSRF 与 Cookie 安全验收

- 逐项验证 refresh/logout 等 Cookie 端点的 SameSite、Secure、HttpOnly 和 Path。
- 若部署为跨站 Web/API，明确第三方 Cookie 限制和 CSRF 策略。
- CORS 只允许精确的 Web/Admin origin，不允许携带凭据的通配符。
- OPTIONS 预检行为纳入集成测试。

### FD-015 上传与富文本攻击测试

- MIME 欺骗、polyglot 文件、超大图片、压缩炸弹风险。
- `javascript:`、data URL、SVG 脚本、事件属性、嵌套危险节点。
- 文件名和 object key 路径穿越。
- 响应头下载策略和内容嗅探防护。

### FD-016 WCAG AA 验收

- 自动 axe 检查作为辅助，不替代人工验收。
- 全站键盘导航。
- 可见焦点。
- 地图列表替代路径。
- 表单错误播报。
- 对比度、缩放、reflow、减少动画。
- 读屏核对标题层级、landmark 和动态状态。

### FD-017 完整 E2E

至少覆盖：

1. 建稿 → 补来源 → 送审 → 退回 → 修改 → 通过 → 发布。
2. 发布内容在公开稳定 URL 可见。
3. 撤回后公开 URL 正确失效。
4. Editor 不能审核或发布。
5. 乐观锁冲突不覆盖他人修改。
6. 缺来源、版权、正文安全或地理核验时发布失败。
7. 媒体上传和版权校验。
8. 地图底图失败后列表仍可访问。
9. 未核验坐标不显示精确 marker。
10. API 不可用时 Web 显示降级状态。

### FD-018 性能与视觉基线

- Lighthouse 移动端和桌面基线。
- 关键页面 Core Web Vitals 预算。
- API 公开列表、搜索、bbox 和登录限流压测。
- 地图大量 marker 的性能测试。
- 关键页面视觉回归。
- 性能数据必须记录环境、数据量、命令和日期，不得伪造。

---

## 8. P3：生产运维与上线准备

### FD-019 环境隔离与部署

- development、test、staging、production 配置完全隔离。
- Web、Admin、API 独立构建和部署。
- SQLite 数据库使用持久卷，staging 与 production 不能共享文件。
- `.db`、`.db-wal`、`.db-shm` 作为同一备份单元。
- 生产迁移使用 `prisma migrate deploy`，禁止 `db push`。
- seed 不得在生产迁移中自动执行。
- 部署、DNS 和付费资源必须人工批准。

### FD-020 日志、指标与追踪

- 结构化日志统一 request ID。
- API → Web revalidation 继续传递 request ID。
- 日志脱敏规则落到代码和测试。
- 指标至少包括请求率、错误率、延迟、数据库健康、登录失败、发布失败和 revalidation 失败。
- 供应商、保留期和费用由维护者决定。

### FD-021 告警与仪表盘

- API 不可用、错误率、延迟、磁盘空间、备份失败和 revalidation 失败告警。
- 明确告警负责人和接收渠道。
- 建立 staging 告警演练记录。
- 仪表盘不得显示敏感业务内容或个人信息。

### FD-022 自动备份与恢复演练

- 使用 SQLite 一致性快照方式，不能直接复制活动数据库文件。
- 备份加密、校验和、异地保存和保留周期。
- 对象存储数据和元数据协同备份。
- 在隔离环境执行恢复。
- 验证迁移状态、API ready、登录和公开内容。
- 记录实际 RPO/RTO。
- 删除旧备份属于破坏性操作，必须有明确范围和批准。

### FD-023 正式域名与法律文本

- HTTPS、HSTS、CORS、CSP 和 canonical 域名核验。
- 地图 attribution 和供应商许可核验。
- 隐私政策、版权说明、纠错规则和联系方式由负责人批准。
- 未经确认的法律文本不得标记为正式版本。

### FD-024 首批内容上线

- 由人工核验史实、来源、引用、版权和坐标。
- 每项内容通过 Reviewer 审核和 publication readiness。
- 图片具有明确许可、署名和 alt。
- 演示/待核验数据不得进入正式发布集合。
- 导入前备份；导入脚本幂等；失败可回滚。

---

## 9. 推荐开发顺序

严格按以下顺序推进，除非维护者明确调整：

1. FD-001 Revision 历史读取与展示
2. FD-002 来源库检索与选择器
3. FD-003 Tiptap 富文本编辑器
4. FD-005 用户与角色管理后台
5. FD-006 审计日志查询后台
6. FD-007 首页槽位管理
7. FD-008 标签与关系管理
8. FD-009 路线编排后台
9. FD-011 搜索增强
10. FD-012 地图核验工作流
11. FD-013 公开站完整内容体验
12. FD-004 真实媒体上传适配层（先完成人工供应商决策）
13. FD-010 纠错反馈闭环
14. FD-014 至 FD-018 安全、可访问性、E2E 和性能
15. FD-019 至 FD-023 生产基础设施（需要人工批准）
16. FD-024 首批正式内容（必须人工核验）

排序理由：先补齐内容生产和审核可追溯性，再改善公开体验，最后连接外部基础设施并上线内容。

---

## 10. 每轮任务的通用验收门禁

### 10.1 代码门禁

- TypeScript strict，无新增 `any`、`@ts-ignore`、空 catch 或滥用非空断言。
- 无重复权限判断、状态规则或 DTO。
- Web/Admin 只依赖生成契约，不导入 API 内部模块。
- 没有未说明的新依赖。
- 没有无关文件修改。

### 10.2 API 门禁

- DTO/schema 白名单拒绝未知字段。
- 写接口服务端鉴权和授权。
- 状态和权限不能由客户端参数绕过。
- 事务覆盖业务写入、revision、review action 和 audit log。
- 409 冲突不静默覆盖。
- 错误响应无堆栈、SQL、路径或秘密。

### 10.3 UI 门禁

- loading、empty、error、forbidden、conflict、success 全覆盖。
- 语义 HTML、键盘支持、焦点状态和错误关联。
- 不能只隐藏按钮作为权限控制。
- 不使用 mock 数据冒充真实功能。

### 10.4 数据门禁

- schema 变化必须有版本化迁移。
- 空库迁移和已有测试数据升级都要验证。
- R\*Tree 索引变化需要真实迁移和查询测试。
- revision、review action、audit log 保持只增不改。

### 10.5 验证门禁

按受影响范围执行：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

涉及关键流程时还必须执行：

```bash
pnpm test:e2e
pnpm --filter @nanking-atlas/api openapi:generate
pnpm --filter @nanking-atlas/api openapi:check-breaking
```

无法运行时必须写“未运行”以及具体阻塞原因，禁止写“应该通过”。

---

## 11. MiniMax 总控提示词

以下提示词用于开始一个新的 MiniMax 会话。不要在同一轮把全部 FD 任务都交给它；每轮只替换一个任务编号。

```text
你正在开发 Nanking Atlas（金陵风物志）仓库。

你必须严格遵守仓库规则，不得为了快速交付绕过架构、安全、测试或真实性要求。

开始任何操作前，依次完整阅读：
1. AGENTS.md
2. docs/PRODUCT_REQUIREMENTS.md
3. docs/TECHNICAL_IMPLEMENTATION.md
4. docs/IMPLEMENTATION_BACKLOG.md
5. docs/MINIMAX_IMPLEMENTATION_GUIDE.md
6. docs/FUNCTION_DEVELOPMENT_PLAN.md
7. docs/adr/0001-sqlite-data-layer.md
8. docs/adr/0002-dependency-vulnerability-policy.md
9. docs/adr/0003-leaflet-render-amap-data.md
10. 本任务涉及的全部代码、测试、迁移和局部文档

本轮任务：FD-XXX <任务名称>
允许修改范围：<明确目录和文件类型>
本轮明确不做：<排除项>

必须严格按以下步骤执行：

第一步：检查现状
- 运行 git status --short，保护所有用户已有修改。
- 阅读现有实现，不得只根据文件名推测。
- 搜索 TODO、占位、mock、相关测试、API 契约和迁移。
- 判断任务是否需要外部服务、凭据、生产权限、破坏性操作或业务决策。
- 如果需要人工批准，停止相关部分并明确说明，不得自行决定。

第二步：实现前汇报
- 写出本轮精确范围。
- 写出依赖和当前已存在能力。
- 写出逐条验收条件。
- 写出安全、权限、数据迁移和回滚影响。
- 写出计划修改的文件清单。
- 只处理一个可验证切片，不得顺手重构无关代码。

第三步：先契约和测试
- API 变化先更新 OpenAPI/DTO/schema 和契约测试。
- 数据变化先写版本化迁移和迁移测试，禁止 db push。
- 缺陷修复先写能复现问题且修复前失败的测试。
- 权限功能先补未认证、越权和资源状态测试。
- 并发写入先补 409 乐观锁测试。

第四步：实现最小完整功能
- API 是权限、状态、审计和发布校验的唯一边界。
- Web/Admin 不得直连数据库。
- 写操作必须有鉴权、授权、输入白名单、错误处理和审计。
- 事务内保持正文、revision、review action、audit log 一致。
- UI 覆盖 loading、empty、error、forbidden、conflict、success。
- UI 提供语义 HTML、键盘操作和可见焦点。
- 不得用静态 JSON、localStorage、内存数组或 mock 冒充持久化。
- 不得伪造南京史实、坐标、来源、版权或许可。
- 未核验内容不得自动发布或标记为 VERIFIED。

第五步：验证
- 运行受影响模块的单元测试和真实 SQLite 集成测试。
- 涉及关键流程时运行 Playwright E2E。
- 运行 pnpm format:check、pnpm lint、pnpm typecheck、pnpm test、pnpm build。
- 涉及 API 时运行 OpenAPI 生成和 breaking-change 检查。
- 涉及迁移时验证空库升级、已有测试数据升级、应用启动和关键查询。
- 不得删除、跳过、放宽测试或修改验收标准以制造通过。

第六步：交付前检查
- 再次运行 git status --short 和 git diff。
- 确认没有覆盖用户修改。
- 确认没有秘密、token、Cookie、真实密码、生产凭据或个人敏感数据。
- 确认没有无关文件和调试产物。
- Backlog 只有在全部验收条件有真实证据时才允许勾选。

第七步：严格使用以下格式汇报，不得省略失败项：

任务编号与范围：

已实现：
- <具体功能与行为>

未实现/明确排除：
- <没有覆盖的内容>

数据与迁移：
- <schema、迁移、兼容性和验证；没有则写“无”>

安全与权限：
- <鉴权、授权、白名单、审计和敏感数据处理>

验证命令及真实结果：
- `<命令>`：通过/失败/未运行
- 失败或未运行原因：<具体原因>

变更文件：
- `<文件>`：<修改目的>

风险与阻塞：
- <真实风险、外部依赖和未验证事项>

建议下一步：
- <下一项最小任务；不得写成已完成>

如果任何验证没有实际运行，必须明确写“未运行”；禁止使用“应该通过”“基本完成”“可上线”等无证据表述。
```

---

## 12. MiniMax 单任务提示词模板

```text
严格按照 AGENTS.md、docs/MINIMAX_IMPLEMENTATION_GUIDE.md 和
docs/FUNCTION_DEVELOPMENT_PLAN.md 执行。

本轮只实施：FD-XXX <任务名称>

允许修改：
- <目录/文件>

禁止修改：
- 未列出的业务模块
- 已批准 ADR
- 产品验收标准
- 与任务无关的格式或重构

本轮不做：
- <明确排除项>

验收条件：
1. <行为条件>
2. <权限条件>
3. <错误条件>
4. <数据一致性条件>
5. <测试条件>

严格顺序：
1. 完整阅读强制文档和相关代码。
2. 检查 git status 并保护已有修改。
3. 在改代码前汇报范围、依赖、验收、风险和文件计划。
4. 先更新契约/迁移/失败测试。
5. 实现最小完整功能。
6. 运行相关单测、集成测试、E2E 和质量命令。
7. 检查 git diff、秘密泄露和无关修改。
8. 按 AGENTS.md 交付模板如实汇报。

禁止：
- 使用 any、@ts-ignore、空 catch 或批量非空断言掩盖问题。
- 删除、跳过或弱化测试。
- 用 mock/静态数据声称业务已完成。
- 仅靠前端隐藏按钮做权限控制。
- 自动发布未核验历史内容。
- 自行连接外部服务、购买资源、部署生产或执行破坏性操作。
```

---

## 13. 推荐给 MiniMax 的首轮任务提示词

建议从 FD-001 开始，因为数据模型和写入链路已经存在，切片清晰且不需要外部服务。

```text
你正在开发 Nanking Atlas（金陵风物志）。

严格按照以下文件执行，并在操作前完整阅读：
1. AGENTS.md
2. docs/PRODUCT_REQUIREMENTS.md
3. docs/TECHNICAL_IMPLEMENTATION.md
4. docs/IMPLEMENTATION_BACKLOG.md
5. docs/MINIMAX_IMPLEMENTATION_GUIDE.md
6. docs/FUNCTION_DEVELOPMENT_PLAN.md
7. docs/adr/0001-sqlite-data-layer.md
8. 当前任务涉及的 API、Admin、OpenAPI、数据库和测试代码

本轮只实施：FD-001 Revision 历史读取与展示。

允许修改范围：
- apps/api/src/modules/contents/**
- apps/api/test/integration/**
- apps/api/src/openapi.ts
- apps/api/openapi.json
- openapi/baseline.json（仅在确认非 breaking change 且生成结果正确时）
- packages/api-contract/src/generated/**
- apps/admin/src/api/**
- apps/admin/src/features/review/**
- 与本任务直接相关的测试文件

本轮明确不做：
- 不接入对象存储。
- 不实现 Tiptap 编辑器。
- 不修改内容状态机规则。
- 不修改数据库 schema，除非先证明现有 schema 无法满足且请求人工确认。
- 不修改公开网站。
- 不勾选整个 P1，只能在全部验收证据满足时更新与本任务直接对应的记录。

验收条件：
1. 新增受保护的 revision 分页读取端点。
2. 未认证返回 401；无权角色返回 403 或既定安全的资源隐藏响应。
3. 返回 revisionNo、创建时间、操作者最小信息、动作/原因和安全快照数据。
4. 排序稳定、分页有上限、非法参数被白名单验证拒绝。
5. revision 保持只读，不新增修改或删除端点。
6. OpenAPI 和生成客户端同步更新，breaking-change 检查通过。
7. Admin 审核区显示 loading、empty、error、forbidden 和正常时间线。
8. 现有状态流转、乐观锁和审核功能不回归。
9. API 单元测试、真实 SQLite 集成测试、Admin 测试、typecheck、lint、build 通过。

必须严格执行：
1. 先运行 git status --short 并阅读现有代码。
2. 在修改前列出范围、依赖、风险、逐条验收条件和文件计划。
3. 先更新 OpenAPI/类型/测试，再实现 API 和 UI。
4. 服务端完成鉴权与资源权限校验，不能只在 UI 隐藏。
5. 不得使用 mock 数据冒充 revision 历史。
6. 不得删除、跳过、放宽测试。
7. 完成后运行受影响范围的 format、lint、typecheck、test、integration、OpenAPI check 和 build。
8. 检查 git diff，确认没有秘密、无关修改或调试产物。
9. 最后严格按 AGENTS.md 的交付模板汇报，所有未运行或失败项必须如实写出。
```

---

## 14. 任务拆分检查表

将任意新需求交给 MiniMax 前，维护者应先确认：

- [ ] 是否只有一个主要用户价值？
- [ ] 是否能在一次 PR 中完整测试？
- [ ] 是否明确了允许修改范围？
- [ ] 是否明确了不做什么？
- [ ] 是否列出了未认证、越权、错误、空数据和冲突状态？
- [ ] 是否需要 schema 迁移？
- [ ] 是否需要 OpenAPI 和生成客户端更新？
- [ ] 是否需要真实 SQLite 集成测试？
- [ ] 是否需要 Playwright E2E？
- [ ] 是否涉及外部服务、费用、生产或破坏性操作？
- [ ] 是否可能触及史实、坐标、来源或版权核验？
- [ ] 是否给出了可以客观判断的完成条件？

任一关键问题没有答案时，先补充任务定义，不要让代理直接开始大规模编码。

---

## 15. 项目完成判定

项目不能仅凭页面可访问或 CI 变绿宣称完成。MVP 完成至少需要：

1. 编辑可通过后台创建和维护内容、来源、关系、媒体与地图信息。
2. Reviewer 可以审核、退回、批准、发布和撤回，Editor 无法绕过。
3. Revision、review action、audit log 可追溯且不可篡改。
4. 发布校验覆盖来源、版权、正文安全、必填字段和地理核验。
5. 公开站只展示已发布内容，撤回后正确失效。
6. 地图只显示可信坐标，并在底图失败时保持列表可用。
7. 搜索、详情、专题和路线形成内容探索闭环。
8. Web、Admin、API 独立构建和部署，环境隔离有效。
9. 安全、可访问性、E2E、性能、备份和恢复均有真实证据。
10. 首批内容经过人工史实、来源、版权和坐标核验。
11. 正式域名、地图许可、隐私和版权文本经过负责人批准。
12. 所有验证失败和外部阻塞均已解决或明确接受风险。

在这些条件没有全部满足前，只能报告当前完成范围，不能宣称“项目已完成”或“可上线”。
