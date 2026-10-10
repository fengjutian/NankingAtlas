import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import {
  DRILL_TABLES,
  compareTableCounts,
  evaluateDrill,
  isSafeDrillTarget,
  resolveDatabasePath,
  type BackupManifest,
  type CountComparison,
  type DrillResult,
} from '../src/backup.js';

/**
 * 恢复演练（P4-05）。
 *
 * ## 为什么必须真的执行
 *
 * 技术方案 §17 验收项 8：「备份能在隔离环境恢复，并形成带时间和结果的演练记录」。
 * RUNBOOK §3.4 原本只写了流程，并明确「不声称已演练」。
 * 流程文档不等于能力 —— 只有真的恢复一次并核对数据，才知道它可用。
 *
 * ## 安全护栏（最重要的一段）
 *
 * 演练**绝不允许**把恢复结果写到线上库路径上：
 * 一次「演练」若覆盖了生产库，且备份本身不完整，就是一次数据事故。
 * `isSafeDrillTarget` 是硬校验，不通过直接退出。
 *
 * 用法：
 *   pnpm --filter @nanking-atlas/database restore-drill <备份.db|备份目录>
 */

const PRISMA_DIR = resolve(process.cwd(), 'prisma');

function fail(message: string): never {
  console.error(`[restore-drill] ${message}`);
  process.exit(1);
}

/** 接受备份文件，或目录里最新的一个备份。 */
function resolveBackupPath(input: string): string {
  const target = resolve(input);
  const stat = statSync(target, { throwIfNoEntry: false });
  if (stat === undefined) {
    fail(`找不到备份：${input}`);
  }
  if (stat.isFile()) {
    return target.replace(/\\/gu, '/');
  }
  if (!stat.isDirectory()) {
    fail(`既不是文件也不是目录：${input}`);
  }
  // 目录：挑 mtime 最新的 .db（清单 JSON 排除在外）
  const candidates = readdirSync(target)
    .filter((name: string) => name.endsWith('.db'))
    .map((name: string) => ({ name, path: join(target, name) }))
    .sort((a: { path: string }, b: { path: string }) => {
      const at = statSync(a.path).mtimeMs;
      const bt = statSync(b.path).mtimeMs;
      return bt - at;
    });
  const newest = candidates[0];
  if (newest === undefined) {
    fail(`目录里没有 .db 备份：${input}`);
  }
  return newest.path.replace(/\\/gu, '/');
}

async function countTables(prisma: PrismaClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of DRILL_TABLES) {
    const rows = await prisma.$queryRawUnsafe<readonly { n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM ${table}`,
    );
    counts[table] = Number(rows[0]?.n ?? 0n);
  }
  return counts;
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (input === undefined || input.trim() === '') {
    fail('用法：pnpm --filter @nanking-atlas/database restore-drill <备份.db|备份目录>');
  }

  const backupPath = resolveBackupPath(input);
  const manifestPath = `${backupPath}.json`;
  if (!statSync(manifestPath, { throwIfNoEntry: false })?.isFile()) {
    fail(`备份缺少清单文件：${manifestPath}（没有它就无法比对行数，演练无意义）`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackupManifest;

  const drillDir = resolve(process.argv[3] ?? join('backups', '_drill'));
  rmSync(drillDir, { recursive: true, force: true });
  mkdirSync(drillDir, { recursive: true });
  const targetPath = join(drillDir.replace(/\\/gu, '/'), 'restored.db');

  // ---- 护栏：绝不覆盖线上库 ----
  const liveUrl = process.env['DATABASE_URL'] ?? manifest.sourcePath;
  const livePath = liveUrl.startsWith('file:')
    ? resolveDatabasePath(liveUrl, PRISMA_DIR)
    : manifest.sourcePath;
  if (!isSafeDrillTarget(targetPath, livePath)) {
    fail(`演练目标与线上库同路径，拒绝执行：${targetPath}`);
  }

  // 校验和：备份文件在产生后是否被改动过
  const actualSha = createHash('sha256').update(readFileSync(backupPath)).digest('hex');
  const shaOk = actualSha === manifest.sha256;
  if (!shaOk) {
    console.error(`[restore-drill] ⚠ 校验和不匹配：备份产生后可能被改动过`);
  }

  // 恢复：把备份**复制**到隔离目录后再连，绝不写回源库。
  //
  // ⚠️ 必须真的复制。少了这一步，Prisma 会指向一个不存在的路径并**建出一个空库** ——
  // 空库的 integrity_check 也是 'ok'，只靠完整性检查根本发现不了，
  // 幸好行数比对会把它抓出来。这正是演练必须真的跑一遍的原因。
  copyFileSync(backupPath, targetPath);
  const restoreClient = new PrismaClient({
    datasources: { db: { url: `file:${targetPath}` } },
  });
  let integrityCheck = 'not_run';
  let comparisons: readonly CountComparison[] = [];
  try {
    const rows =
      await restoreClient.$queryRawUnsafe<readonly { integrity_check: string }[]>(
        'PRAGMA integrity_check',
      );
    integrityCheck = rows[0]?.integrity_check ?? 'empty';

    comparisons = compareTableCounts(manifest.tableCounts, await countTables(restoreClient));
  } finally {
    await restoreClient.$disconnect();
  }

  const passed = evaluateDrill({ integrityCheck, comparisons }) && shaOk;
  const result: DrillResult = {
    performedAt: new Date().toISOString(),
    backupFile: manifest.fileName,
    targetPath,
    integrityCheck,
    comparisons,
    passed,
  };

  const recordPath = join(drillDir.replace(/\\/gu, '/'), 'drill-result.json');
  writeFileSync(recordPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`[restore-drill] 备份      ${manifest.fileName}（${manifest.createdAt}）`);
  console.log(`[restore-drill] 校验和    ${shaOk ? '一致' : '不一致 ⚠'}`);
  console.log(`[restore-drill] 完整性    ${integrityCheck}`);
  for (const item of comparisons) {
    console.log(
      `[restore-drill]   ${item.ok ? 'OK  ' : '差异'} ${item.table}：备份 ${item.expected} / 恢复 ${item.actual}`,
    );
  }
  console.log(`[restore-drill] 结论      ${passed ? '通过' : '未通过'}`);
  console.log(`[restore-drill] 记录      ${recordPath}`);

  if (!passed) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
