import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import {
  DRILL_TABLES,
  backupFileName,
  resolveDatabasePath,
  toSqlLiteral,
  type BackupManifest,
} from '../src/backup.js';

/**
 * 数据库备份（P4-05）。
 *
 * ## 为什么用 `VACUUM INTO` 而不是拷贝文件
 *
 * WAL 模式下数据可能一部分在 `.db`、一部分在 `.db-wal`。
 * 直接 `cp .db` 会得到**不一致快照**：缺失尚未 checkpoint 的事务。
 * 更糟的是这种损坏 `PRAGMA integrity_check` 也可能通过 ——
 * 只会在恢复后表现为「内容少了几条」，那时已经晚了。
 *
 * `VACUUM INTO` 由 SQLite 自己完成，产出一致快照，且不需要停服。
 *
 * ## 不依赖 sqlite3 CLI
 *
 * RUNBOOK §3.1 原本记录的是 `sqlite3 "..." "VACUUM INTO ..."`。
 * 但 sqlite3 不在多数环境的 PATH 里（开发机实测没有），
 * 一条跑不通的命令写在 runbook 里等于没有备份。这里改用 Prisma 发同一条 SQL，
 * 零新增依赖、且与应用的连接方式一致。
 *
 * 用法：
 *   pnpm --filter @nanking-atlas/database backup [输出目录]
 *
 * ⚠️ 本脚本**只读**源库，绝不写回，不会损坏数据。
 */

/** schema.prisma 所在目录 —— Prisma 解析相对 `file:` 路径的基准。 */
const PRISMA_DIR = resolve(process.cwd(), 'prisma');

function fail(message: string): never {
  console.error(`[backup] ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    fail('缺少 DATABASE_URL');
  }

  const sourcePath = resolveDatabasePath(databaseUrl, PRISMA_DIR);
  if (!statSync(sourcePath, { throwIfNoEntry: false })?.isFile()) {
    fail(`找不到数据库文件：${sourcePath}（DATABASE_URL=${databaseUrl}）`);
  }

  const outDir = process.argv[2] !== undefined ? resolve(process.argv[2]) : resolve('backups');
  mkdirSync(outDir, { recursive: true });

  const fileName = backupFileName(new Date());
  const backupPath = join(outDir.replace(/\\/gu, '/'), fileName);
  mkdirSync(dirname(backupPath), { recursive: true });

  const prisma = new PrismaClient();
  try {
    const journalRows =
      await prisma.$queryRawUnsafe<readonly { journal_mode: string }[]>('PRAGMA journal_mode');
    const journalMode = journalRows[0]?.journal_mode ?? 'unknown';

    // VACUUM INTO 目标已存在会直接报错；那是**保护**而不是故障，不覆盖。
    await prisma.$executeRawUnsafe(`VACUUM INTO ${toSqlLiteral(backupPath)}`);

    const tableCounts: Record<string, number> = {};
    for (const table of DRILL_TABLES) {
      const rows = await prisma.$queryRawUnsafe<readonly { n: bigint }[]>(
        `SELECT COUNT(*) AS n FROM ${table}`,
      );
      tableCounts[table] = Number(rows[0]?.n ?? 0n);
    }

    const bytes = statSync(backupPath).size;
    const sha256 = createHash('sha256').update(readFileSync(backupPath)).digest('hex');

    const manifest: BackupManifest = {
      createdAt: new Date().toISOString(),
      sourcePath,
      fileName,
      bytes,
      sha256,
      journalMode,
      tableCounts,
    };
    writeFileSync(`${backupPath}.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    console.log(`[backup] 完成：${backupPath}`);
    console.log(`[backup] 大小 ${bytes} 字节，journal=${journalMode}`);
    console.log(`[backup] sha256 ${sha256}`);
    console.log(`[backup] 清单 ${backupPath}.json`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
