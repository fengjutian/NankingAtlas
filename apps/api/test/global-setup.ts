import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 集成测试的全局准备（Vitest `globalSetup`）。
 *
 * AGENTS.md §7.1 要求「API 权限和事务有真实数据库集成测试」；
 * 本项目 P1-01.a 起使用 SQLite（用户决策），故对真实 SQLite 库跑。
 *
 * 流程：删旧库 → 建空库 → 在空库上执行**真实的 Prisma 迁移**。
 *
 * 为什么调 CLI 而不自己解析 migration.sql：
 *   P3 的空间索引迁移含 `CREATE VIRTUAL TABLE ... USING rtree(...)`，
 *   手写的「按分号切语句」会把虚拟表定义切坏（`incomplete input`）。
 *   Prisma 有完整 SQL 解析器，而「迁移可在测试库从零执行」正是
 *   AGENTS.md §7.5 要验证的东西。
 */

const REPO_ROOT = join(process.cwd(), '..', '..');
const DB_DIR = join(process.cwd(), 'prisma-test');
const DB_FILE = join(DB_DIR, 'integration.db');
const SCHEMA_PATH = join(REPO_ROOT, 'packages', 'database', 'prisma', 'schema.prisma');
const PRISMA_BIN_DIR = join(REPO_ROOT, 'packages', 'database', 'node_modules', '.bin');

/**
 * 测试用 DATABASE_URL。
 *
 * 必须是**绝对路径**：Prisma 5 把 SQLite `file:` 相对路径解析到
 * schema.prisma 所在目录（`packages/database/prisma`）而非进程 cwd，
 * 相对路径会让建库位置和 Prisma 连接位置不一致（Error code 14）。
 */
export function integrationDatabaseUrl(): string {
  return `file:${DB_FILE.replace(/\\/gu, '/')}`;
}

/**
 * 定位 Prisma CLI。
 *
 * pnpm 的依赖符号链接到 `.pnpm` 虚拟存储，root `node_modules/.bin` 下
 * **没有** prisma —— 它属于 `packages/database`，要从那个包的 `.bin` 找。
 */
function resolvePrismaBin(): string {
  const entries = readdirSync(PRISMA_BIN_DIR);
  // pnpm 在 .bin 下只生成无扩展名的 POSIX shim（Windows 上需要 shell 才能跑）。
  const hit =
    entries.find((name) => name === 'prisma.cmd') ?? entries.find((name) => name === 'prisma');
  if (hit === undefined) {
    throw new Error(`cannot locate prisma CLI in ${PRISMA_BIN_DIR}`);
  }
  return join(PRISMA_BIN_DIR, hit);
}

export function setup(): void {
  // 1. 清理
  rmSync(DB_DIR, { recursive: true, force: true });
  mkdirSync(DB_DIR, { recursive: true });

  // 2. 空库上跑真实迁移
  const bin = resolvePrismaBin();
  // Windows 上 .bin 下的 shim 是 shell 脚本，必须经 shell 执行；
  // 否则 spawnSync 直接 ENOENT。非 Windows 时 shell 仍可用但多余，
  // 用 process.platform 判断避免不必要的 shell。
  const useShell = process.platform === 'win32';
  execFileSync(
    useShell ? 'cmd' : bin,
    useShell
      ? ['/c', bin, 'migrate', 'deploy', '--schema', SCHEMA_PATH]
      : ['migrate', 'deploy', '--schema', SCHEMA_PATH],
    {
      stdio: 'pipe',
      shell: !useShell && bin.endsWith('.cmd'),
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: integrationDatabaseUrl(),
      },
    },
  );
}

export function teardown(): void {
  rmSync(DB_DIR, { recursive: true, force: true });
}
