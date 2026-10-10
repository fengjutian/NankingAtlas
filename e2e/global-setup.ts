import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * E2E 全局准备（Playwright `globalSetup`）。
 *
 * 流程与 `apps/api/test/global-setup.ts` 相同：删旧库 → 空库 → 跑**真实迁移**。
 * 差别只在位置：E2E 用 `packages/database/prisma/e2e/e2e.db`，
 * 与 dev.db / integration.db 三者物理隔离。
 *
 * ## 为什么必须调 Prisma CLI
 *
 * 空间索引迁移含 `CREATE VIRTUAL TABLE ... USING rtree(...)`。
 * 手写「按分号切语句」会把虚拟表定义切坏（`incomplete input`）。
 * 而「迁移可在空库从头执行」正是 AGENTS.md §7.5 要求验证的事。
 *
 * ## 为什么 DATABASE_URL 必须是绝对路径
 *
 * Prisma 5 把 SQLite `file:` 相对路径解析到 **schema.prisma 所在目录**，
 * 不是进程 cwd。相对路径会让「建库位置」和「API 连接位置」不一致，报 Error code 14。
 * 这条已在集成测试里踩过一次。
 */
const REPO_ROOT = resolve(process.cwd());
const DB_DIR = join(REPO_ROOT, 'packages', 'database', 'prisma', 'e2e');
const DB_FILE = join(DB_DIR, 'e2e.db');
const SCHEMA_PATH = join(REPO_ROOT, 'packages', 'database', 'prisma', 'schema.prisma');
const PRISMA_BIN_DIR = join(REPO_ROOT, 'packages', 'database', 'node_modules', '.bin');

export function e2eDatabaseUrl(): string {
  return `file:${DB_FILE.replace(/\\/gu, '/')}`;
}

/**
 * 定位 Prisma CLI。
 *
 * pnpm 把依赖符号链接进 `.pnpm` 虚拟存储，root `node_modules/.bin` 下
 * **没有** prisma —— 它属于 `packages/database`，要从那个包的 `.bin` 找。
 */
function resolvePrismaBin(): string {
  const entries = readdirSync(PRISMA_BIN_DIR);
  const hit =
    entries.find((name) => name === 'prisma.cmd') ?? entries.find((name) => name === 'prisma');
  if (hit === undefined) {
    throw new Error(`cannot locate prisma CLI in ${PRISMA_BIN_DIR}`);
  }
  return join(PRISMA_BIN_DIR, hit);
}

export default function globalSetup(): void {
  // Windows 上 SQLite 文件被上一次的 API 进程持有时，rmSync 会 EPERM。
  // 反复 `pnpm test:e2e` 是常态，不能要求人手动杀进程。
  // 先尝试删；被占用就把库文件挪到回收名（成功后由下次运行清走），
  // 让本次仍能建出干净库。
  try {
    rmSync(DB_DIR, { recursive: true, force: true });
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EBUSY') {
      throw error;
    }
    rmSync(`${DB_DIR}.stale-${String(process.pid)}`, { recursive: true, force: true });
  }
  mkdirSync(DB_DIR, { recursive: true });
  // 上一轮遗留的 .stale-* 目录一并清掉（正常情况下为空）。
  for (const entry of readdirSync(join(REPO_ROOT, 'packages', 'database', 'prisma'))) {
    if (entry.startsWith('e2e.stale-')) {
      rmSync(join(REPO_ROOT, 'packages', 'database', 'prisma', entry), {
        recursive: true,
        force: true,
      });
    }
  }

  const bin = resolvePrismaBin();
  // Windows 上 .bin 下是 shell shim，必须经 cmd /c，否则直接 ENOENT。
  const useShell = process.platform === 'win32';
  execFileSync(
    useShell ? 'cmd' : bin,
    useShell
      ? ['/c', bin, 'migrate', 'deploy', '--schema', SCHEMA_PATH]
      : ['migrate', 'deploy', '--schema', SCHEMA_PATH],
    {
      stdio: 'pipe',
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
    },
  );

  // 迁移后灌演示账号（admin/reviewer/editor）。
  //
  // seed 是幂等的，且只写 DRAFT + 「示例/待核验」内容 —— E2E 里发布的
  // 内容全部由用例自己创建并显式走审核发布链路，不会与 seed 数据混淆。
  //
  // Windows 上 `pnpm` 是 pnpm.cmd，直接 spawnSync('pnpm') 会 ENOENT，
  // 必须走 shell（与上面 prisma 的处理同因）。
  const seedShim = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  execFileSync(seedShim, ['--filter', '@nanking-atlas/database', 'seed'], {
    stdio: 'pipe',
    shell: process.platform === 'win32',
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
  });

  // 重新构建 web，且**必须**在构建期注入 E2E 的 API 地址。
  //
  // `NEXT_PUBLIC_*` 被 Next 静态内联进产物：给 `next start` 传这些变量是无效的，
  // 页面用的仍是上次 build 时的地址。表现是页面走进 `network` 分支渲染
  // 「内容接口暂时无法连接」，而后端完全正常 —— 极难定位。
  //
  // 已实测确认：shell env 的优先级**高于** `apps/web/.env.local`，
  // 构建产物里只会出现这里传入的 4100，不会出现 .env.local 里的 4000。
  // 因此必须由 globalSetup 自己 build，不能复用开发机上的旧产物
  // （旧产物里烘的是 localhost:4000，指向另一个进程）。
  execFileSync(seedShim, ['--filter', '@nanking-atlas/web', 'build'], {
    stdio: 'pipe',
    shell: process.platform === 'win32',
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_ENV: 'test',
      NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4100',
      // 故意不给底图 Key：/map 会降级为纯列表，E2E 不依赖第三方瓦片。
      NEXT_PUBLIC_AMAP_KEY: '',
    },
  });
}

export function globalTeardown(): void {
  // 保留 e2e.db 便于失败后人工排查；CI 上是即用即丢的一次性目录。
  try {
    rmSync(DB_DIR, { recursive: true, force: true });
  } catch {
    // 仍被 API 进程占用时静默跳过：残留的 e2e/ 已在 .gitignore 内，
    // 下一轮 globalSetup 会重新清理，不应因此把一次成功的 E2E 判为失败。
  }
}
