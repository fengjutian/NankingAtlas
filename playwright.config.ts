import { resolve } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

/**
 * P4-03 端到端测试配置。
 *
 * 依据：docs/TECHNICAL_IMPLEMENTATION.md §16
 *   「E2E | 登录、建稿、补来源、送审、退回/通过、发布、公开可见、撤回」
 * 与 §15「主分支额外构建三个部署产物和 E2E smoke」。
 *
 * ## 为什么独立库
 *
 * E2E 跑的是**真实 API + 真实 web + 真实浏览器**，会写库。
 * 绝不能用 dev.db —— 那样 E2E 数据会混进开发库（AGENTS.md §5.6：破坏性/污染操作需谨慎）。
 * 因此固定用 `e2e.db`，由 `globalSetup` 在**空文件**上跑真实迁移建库。
 *
 * ## 为什么跑 build 产物而不是 dev
 *
 * `next dev` 每次改文件都重编译，E2E 会因编译等待而随机超时；
 * 更重要的是 dev 模式的 CSP/HMR 行为与生产不同，测出来的东西不可信。
 * 因此用 `next build` + `next start`。
 */
const API_PORT = 4100;
/** 与 apps/web 的 `next start --port 3000` 保持一致。 */
const WEB_PORT = 3000;
/**
 * 管理后台的 E2E 端口。
 *
 * **不用 admin package.json 里 preview 脚本的 4173**：那个端口在本机被
 * LibreOffice 内置的 `python -m http.server 4173` 占着（不属本项目，不能杀）。
 * 所以 E2E 显式传 `--port`，与 web 那边「start 脚本固定端口」的约束不同处理。
 */
const ADMIN_PORT = 4175;
/** API → web 的签名 revalidation 回调（两侧必须用同一个 secret）。 */
const REVALIDATION_SECRET = 'e2e-revalidation-secret-value-long-enough';

export default defineConfig({
  testDir: './e2e/specs',
  // E2E 涉及真实起服务 + 浏览器，单线程更稳，也避免 SQLite 单写者锁冲突。
  workers: 1,
  fullyParallel: false,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] !== undefined ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI'] !== undefined ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${String(WEB_PORT)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @nanking-atlas/api start',
      url: `http://127.0.0.1:${String(API_PORT)}/health/ready`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        APP_ENV: 'test',
        NODE_ENV: 'test',
        API_PORT: String(API_PORT),
        LOG_LEVEL: 'silent',
        // 绝对路径：Prisma 5 把 SQLite file: 解析到 schema 所在目录而非 cwd，
        // 用相对路径会连到另一个库并报 Error code 14。
        DATABASE_URL: `file:${resolve('packages/database/prisma/e2e/e2e.db').replace(/\\/gu, '/')}`,
        AUTH_ACCESS_SECRET: 'e2e-access-secret-value-long-enough-over-32b',
        AUTH_REFRESH_SECRET: 'e2e-refresh-secret-value-long-enough-over-32b',
        // E2E 会多次登录（三个角色 + 重放场景），默认 5 次/分钟会误伤。
        AUTH_LOGIN_RATE_LIMIT: '1000',
        WEB_ORIGIN: `http://127.0.0.1:${String(WEB_PORT)}`,
        // 必须与下面第三个 webServer 的 admin 实际端口一致 ——
        // 它是 API 的 CORS 白名单，写错会让 admin 的所有请求被浏览器拦下。
        ADMIN_ORIGIN: `http://127.0.0.1:${String(ADMIN_PORT)}`,
        // 打通 P2-07 链路：归档后 API 签名回调 web 让缓存失效，
        // 否则详情页会继续命中 300s 的 fetch 缓存，撤回后仍返回 200。
        // 不配这一项，E2E 测到的就不是产品真实行为。
        //
        // 必须用 localhost 而非 127.0.0.1：API 的 env 校验只放行
        // `https://` 或 `http://localhost`（apps/api/src/lib/env.ts:140），
        // 这是防止把 revalidation 回调指向明文 http 的安全约束。
        REVALIDATION_SECRET,
        REVALIDATION_URL: `http://localhost:${String(WEB_PORT)}/api/revalidate`,
      },
    },
    {
      // 构建与启动放在**同一条命令**里。
      //
      // 原本把 `next build` 放在 globalSetup，实测会间歇性失败：
      // `next start` 报「找不到 .next-e2e 里的生产构建」。把两步合进同一个
      // shell 串行执行，就不存在「build 还没落盘 start 就起来了」的时序问题。
      //
      // 也不能用 `next start --port 3100` 覆盖：web 的 start 脚本已固定
      // `--port 3000`，playwright 只能校验 `url` 指向的端口。
      command: 'pnpm --filter @nanking-atlas/web build && pnpm --filter @nanking-atlas/web start',
      url: `http://127.0.0.1:${String(WEB_PORT)}`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_APP_ENV: 'test',
        // 构建期内联：给 `next start` 传是无效的，必须让 build 那一步就带上。
        NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${String(API_PORT)}`,
        // 故意不给底图 Key：/map 会降级为纯列表，E2E 不依赖第三方瓦片。
        NEXT_PUBLIC_AMAP_KEY: '',
        REVALIDATION_SECRET,
      },
    },
    {
      // 管理后台（FD-003/005/006/007/008 的真实浏览器验证）。
      //
      // 用 `build && preview` 而不是 `dev`：
      //   - dev 模式的模块加载 / 错误处理与生产不同，测出来的不可信
      //     （web 那边也是因为同样的理由用 build + start）。
      //
      // 三个细节都不是随意写的：
      //   1. `--host 127.0.0.1`：vite preview 默认只绑 localhost（IPv6 ::1），
      //      而 Playwright 探测的是 127.0.0.1（IPv4），不指定就连不上、
      //      最终以「Timed out waiting webServer」收场。
      //   2. `--port 4175`：admin preview 脚本写死 4173，而该端口在本机被
      //      LibreOffice 内置的 python http.server 占用（不属本项目，不能杀）。
      //   3. 超时给到 420s：`tsc --noEmit && vite build` 本身就要一两分钟，
      //      与 preview 串行后 300s 不够。
      command:
        'pnpm --filter @nanking-atlas/admin build && pnpm --filter @nanking-atlas/admin exec vite preview' +
        ' --host 127.0.0.1 --port ' +
        String(ADMIN_PORT) +
        ' --strictPort',
      url: `http://127.0.0.1:${String(ADMIN_PORT)}`,
      timeout: 420_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'production',
        // 构建期内联：给 preview 传无效，必须让 build 那一步就带上。
        VITE_APP_ENV: 'test',
        VITE_API_BASE_URL: `http://127.0.0.1:${String(API_PORT)}`,
      },
    },
  ],
});
