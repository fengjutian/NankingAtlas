# Nanking Atlas（金陵风物志）

南京城市文化数字档案、互动街巷地图与城市生活记录平台。

## 项目文档

- [产品需求基线](docs/PRODUCT_REQUIREMENTS.md)：用户提供的原始完整需求，作为范围与验收依据。
- [技术实现方案](docs/TECHNICAL_IMPLEMENTATION.md)：架构决策、数据模型、接口、安全、测试、部署与阶段交付方案。
- [开发任务清单](docs/IMPLEMENTATION_BACKLOG.md)：可直接领取、逐项验收的工程任务。
- [AI 开发约束](AGENTS.md)：MiniMax 及其他编码代理必须遵循的强制规则。
- [MiniMax 开发执行手册](docs/MINIMAX_IMPLEMENTATION_GUIDE.md)：可直接交给 MiniMax 的执行流程、提示词、门禁和交付模板。

## 当前状态

当前完成立项文档与工程约束落盘。下一阶段从 P0 工程骨架开始，按 `IMPLEMENTATION_BACKLOG.md` 顺序实施。任何代理不得将"文档完成"表述为"产品已实现"。

## 仓库结构

```text
apps/
  web/                 # Next.js 公开站
  admin/               # Vite + React 管理后台
  api/                 # NestJS API
packages/
  eslint-config/       # 共享 ESLint flat config
  tsconfig/            # 共享 strict TypeScript 配置
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

## 阶段门禁

- P0 门禁：三个应用可独立运行；根级质量命令通过；开发配置无秘密。
- P1 门禁：真实数据库和服务端权限有效；审核发布链路通过集成/E2E；审计可追溯。
- P2 门禁：发布内容从后台到公开站闭环；SEO、撤回和响应式验证通过。
- P3 门禁：真实 PostGIS bbox 查询；地图/列表联动和失败降级通过。
- P4 门禁：安全、性能、监控、备份恢复和上线 runbook 有真实证据。

前一阶段未满足时，可以为后续做不破坏兼容性的准备，但不能宣称后续阶段已经交付。