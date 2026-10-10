/**
 * 备份与恢复演练的纯逻辑（P4-05）。
 *
 * ## 为什么把逻辑抽出来单测
 *
 * 备份/恢复是**最容易造成不可逆损失**的操作：写错了路径就可能覆盖生产库。
 * 这类代码不能只靠"跑一次看没问题"来保证，必须让每条分支都有断言 ——
 * 尤其是路径解析，行数比对，以及"演练绝不能碰到线上库"的护栏。
 *
 * 实际的 I/O（VACUUM INTO、算校验和）在 `prisma/backup.ts` / `prisma/restore-drill.ts`。
 */

import { posix as posixPath } from 'node:path';

/**
 * 从 `DATABASE_URL` 解析出 SQLite 文件的绝对路径。
 *
 * ## 为什么必须处理相对路径
 *
 * Prisma 5 把 SQLite `file:` 的**相对路径解析到 schema.prisma 所在目录**，
 * 不是进程 cwd。于是同一个 `file:./dev.db`：
 *   - 在 `packages/database` 跑 → `packages/database/prisma/dev.db`
 *   - 在 `apps/api` 跑          → 同样是 `packages/database/prisma/dev.db`
 *
 * 这意味着 CLI 脚本拿到的 URL 可能**不含目录**（`file:./dev.db`），
 * 此时若直接当 cwd 解析，就会算出一个完全不同的路径 ——
 * 备份会静默写到一个没人知道的地方，而恢复演练则可能恢复到错误的库。
 *
 * 这里要求调用方显式传入 `baseDir`（即 schema.prisma 所在目录），
 * 把这条隐式规则变成显式参数，避免"以为解析对了"。
 */
export function resolveDatabasePath(databaseUrl: string, baseDir: string): string {
  const raw = databaseUrl.trim();
  if (!raw.startsWith('file:')) {
    throw new Error(`DATABASE_URL 不是 SQLite file: 形式：${raw}`);
  }
  let filePath = raw.slice('file:'.length);
  // 允许 file:///abs 与 file:/abs 两种写法
  filePath = filePath.replace(/^\/{1,3}/, '/');
  if (filePath === '') {
    throw new Error('DATABASE_URL 缺少数据库文件路径');
  }
  const isAbsolute = posixPath.isAbsolute(filePath) || /^[A-Za-z]:[/\\]/u.test(filePath);
  if (isAbsolute) {
    return filePath.replace(/\\/gu, '/');
  }
  // 相对路径：按 baseDir 解析（显式传入，不依赖 cwd）
  return posixPath.join(baseDir.replace(/\\/gu, '/'), filePath.replace(/\\/gu, '/'));
}

/** 备份文件命名：`nanking-atlas-YYYYMMDD-HHmmss.db`。可预测、便于按时间排序。 */
export function backupFileName(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(
    now.getUTCHours(),
  )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `nanking-atlas-${stamp}.db`;
}

/**
 * `VACUUM INTO` 的目标路径 SQL 字面量。
 *
 * 必须转义单引号：路径里出现 `'` 会拼出坏 SQL，而这种错误表现为
 * 「备份命令报错」，很难联想到是文件名问题。
 */
export function toSqlLiteral(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

export interface BackupManifest {
  readonly createdAt: string;
  readonly sourcePath: string;
  readonly fileName: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly journalMode: string;
  /** 备份时各关键表行数 —— 恢复演练据此判断"数据没少"。 */
  readonly tableCounts: Readonly<Record<string, number>>;
}

/**
 * 需要比对行数的关键表。
 *
 * 选这些是因为它们承载不可再生的业务事实：内容、修订、审核动作、审计日志。
 * 只比对总行数没有意义 —— 删掉 100 条 audit_logs、补 100 条假数据，
 * 总数一样但数据已经错了。
 */
export const DRILL_TABLES: readonly string[] = [
  'contents',
  'revisions',
  'review_actions',
  'audit_logs',
  'users',
  'media',
  'sources',
];

/** 行数比对结果。 */
export interface CountComparison {
  readonly table: string;
  readonly expected: number;
  readonly actual: number;
  readonly ok: boolean;
}

/**
 * 逐表比对行数。
 *
 * 缺失的表按 0 计入并标记为不一致 —— 「表不见了」比「表里数据不对」
 * 更严重，绝不能因为查不到就当作跳过。
 */
export function compareTableCounts(
  expected: Readonly<Record<string, number>>,
  actual: Readonly<Record<string, number>>,
): readonly CountComparison[] {
  return DRILL_TABLES.map((table) => {
    const expectedCount = expected[table] ?? 0;
    const actualCount = actual[table] ?? 0;
    return {
      table,
      expected: expectedCount,
      actual: actualCount,
      ok: expectedCount === actualCount,
    };
  });
}

/**
 * 演练目标路径是否安全。
 *
 * **绝对不能**与线上库同路径：那会把生产数据覆盖成备份内容，
 * 而备份本身可能是不完整的 —— 一次"演练"变成一次数据事故。
 */
export function isSafeDrillTarget(targetPath: string, liveDatabasePath: string): boolean {
  const normalize = (value: string): string => posixPath.normalize(value.replace(/\\/gu, '/'));
  return normalize(targetPath) !== normalize(liveDatabasePath);
}

/** 演练结论。`passed` 要求完整性与行数**全部**通过，没有"部分通过"。 */
export interface DrillResult {
  readonly performedAt: string;
  readonly backupFile: string;
  readonly targetPath: string;
  readonly integrityCheck: string;
  readonly comparisons: readonly CountComparison[];
  readonly passed: boolean;
}

/**
 * 汇总演练结论。
 *
 * ⚠️ `integrityCheck` 只接受精确的 `'ok'`。
 * 放宽成 `includes('ok')` 之类会让 `not ok` 之类的异常值蒙混过关 ——
 * 而 `integrity_check` 的失败值本身就是以人话描述损坏，不是简短标记。
 */
export function evaluateDrill(result: {
  readonly integrityCheck: string;
  readonly comparisons: readonly CountComparison[];
}): boolean {
  return (
    result.integrityCheck.trim().toLowerCase() === 'ok' && result.comparisons.every((c) => c.ok)
  );
}
