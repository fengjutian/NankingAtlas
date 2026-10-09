import { readdirSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '@nanking-atlas/database';

/**
 * 集成测试的全局准备（Vitest `globalSetup`）。
 *
 * AGENTS.md §7.1 要求「API 权限和事务有真实数据库集成测试」；
 * 本项目 P1-01.a 起使用 SQLite（用户决策），故对真实 SQLite 库跑。
 *
 * 流程：
 *   1. 删掉上一轮遗留的测试库文件
 *   2. 新建空库
 *   3. **按顺序执行 `prisma/migrations` 下每个目录的 `migration.sql`** —— 即真实迁移 SQL
 *
 * 为什么不用 `prisma migrate deploy` 子进程：
 *   pnpm workspace 里 Prisma CLI 是符号链接到 `.pnpm` 虚拟存储，
 *   在 Windows 下从 vitest 进程里 spawn 路径极不稳定（ENOENT）。
 *   直接读迁移 SQL 并用 Prisma client 的 `$executeRawUnsafe` 逐条执行，
 *   验证的仍是**迁移文件本身的正确性**（能建出可用的表、能被 Prisma 用），
 *   而且没有额外依赖。
 */

const DB_DIR = join(process.cwd(), 'prisma-test');
const DB_FILE = join(DB_DIR, 'integration.db');
const MIGRATIONS_DIR = join(
  process.cwd(),
  '..',
  '..',
  'packages',
  'database',
  'prisma',
  'migrations',
);

/**
 * 测试用 DATABASE_URL。
 *
 * 必须是**绝对路径**：Prisma 5 把 SQLite `file:` 相对路径解析到
 * schema.prisma 所在目录（`packages/database/prisma`）而非进程 cwd。
 * 相对路径会让建库位置和 Prisma 连接位置不一致。
 */
export function integrationDatabaseUrl(): string {
  return `file:${DB_FILE.replace(/\\/gu, '/')}`;
}

/** 迁移目录名（按字典序 = 时间序）。 */
function migrationDirs(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export async function setup(): Promise<void> {
  // 1. 清理
  rmSync(DB_DIR, { recursive: true, force: true });
  mkdirSync(DB_DIR, { recursive: true });

  // 2. 空库上按序执行全部迁移 SQL
  const client = new PrismaClient({ datasources: { db: { url: integrationDatabaseUrl() } } });
  try {
    for (const dirName of migrationDirs()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, dirName, 'migration.sql'), 'utf8');
      // 按分号切分逐条执行。迁移 SQL 里没有存储过程/触发器定义，
      // 因此分号切分是安全的。
      for (const statement of splitStatements(sql)) {
        await client.$executeRawUnsafe(statement);
      }
    }
  } finally {
    await client.$disconnect();
  }
}

export function teardown(): void {
  rmSync(DB_DIR, { recursive: true, force: true });
}

/**
 * 拆 SQL 语句。
 *
 * 处理字符串字面量与 `--` 注释，避免把注释里的分号也切了。
 * 迁移文件由本仓库自己维护，不含触发器/函数，故无需处理 BEGIN...END。
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i] ?? '';
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        current += char;
      }
      continue;
    }

    if (inString) {
      current += char;
      if (char === "'") {
        // 连续两个单引号 = 转义的单引号，不结束字符串
        if (next === "'") {
          current += next;
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (char === '-' && next === '-') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }

    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail.length > 0) {
    statements.push(tail);
  }
  return statements;
}