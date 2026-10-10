import { describe, expect, it } from 'vitest';

import {
  DRILL_TABLES,
  backupFileName,
  compareTableCounts,
  evaluateDrill,
  isSafeDrillTarget,
  resolveDatabasePath,
  toSqlLiteral,
} from './backup.js';

describe('resolveDatabasePath', () => {
  const base = '/repo/packages/database/prisma';

  it('相对路径按 baseDir 解析，而不是 cwd', () => {
    // ⚠️ 这条是最容易踩的：Prisma 把 SQLite file: 的相对路径解析到
    // schema.prisma 所在目录。若按 cwd 解析，备份会写到没人知道的地方。
    expect(resolveDatabasePath('file:./dev.db', base)).toBe(`${base}/dev.db`);
    expect(resolveDatabasePath('file:dev.db', base)).toBe(`${base}/dev.db`);
  });

  it('绝对路径原样返回并统一为正斜杠', () => {
    expect(resolveDatabasePath('file:/var/data/app.db', base)).toBe('/var/data/app.db');
    expect(resolveDatabasePath('file:D:/data/app.db', base)).toBe('D:/data/app.db');
  });

  it('Windows 反斜杠被规范成正斜杠', () => {
    // Prisma/SQLite 路径里反斜杠是转义符，必须统一。
    expect(resolveDatabasePath('file:./sub\\dev.db', base)).toBe(`${base}/sub/dev.db`);
  });

  it('非 SQLite 连接串直接拒绝', () => {
    // 备份脚本绝不能对 PostgreSQL URL 动手 —— 那是另一个系统的库。
    expect(() => resolveDatabasePath('postgresql://user:pw@host/db', base)).toThrow(/不是 SQLite/);
  });

  it('缺少路径时报错', () => {
    expect(() => resolveDatabasePath('file:', base)).toThrow(/缺少数据库文件路径/);
  });
});

describe('backupFileName', () => {
  it('按 UTC 生成可排序的时间戳文件名', () => {
    expect(backupFileName(new Date('2026-10-10T08:09:05Z'))).toBe(
      'nanking-atlas-20261010-080905.db',
    );
  });

  it('月份与日期补零，避免排序错乱', () => {
    // 不补零的话 3 月会和 11 月排在错误位置。
    expect(backupFileName(new Date('2026-03-01T00:00:00Z'))).toBe(
      'nanking-atlas-20260301-000000.db',
    );
  });
});

describe('toSqlLiteral', () => {
  it('单引号被转义，避免拼出坏 SQL', () => {
    expect(toSqlLiteral("/tmp/it's.db")).toBe("'/tmp/it''s.db'");
  });

  it('普通路径原样包裹', () => {
    expect(toSqlLiteral('/tmp/a.db')).toBe("'/tmp/a.db'");
  });
});

describe('compareTableCounts', () => {
  const full = Object.fromEntries(DRILL_TABLES.map((t) => [t, 10])) as Record<string, number>;

  it('全部一致时每项都 ok', () => {
    expect(compareTableCounts(full, full).every((c) => c.ok)).toBe(true);
  });

  it('某表少数据会被标记为不一致', () => {
    const actual = { ...full, contents: 3 };
    const result = compareTableCounts(full, actual);
    const contents = result.find((c) => c.table === 'contents');
    expect(contents?.ok).toBe(false);
    expect(contents?.actual).toBe(3);
  });

  it('整表缺失按 0 计入并判不一致（不能当作跳过）', () => {
    // 「表不见了」比「表里数据不对」更严重。
    const actual = { ...full };
    delete actual['audit_logs'];
    const audit = compareTableCounts(full, actual).find((c) => c.table === 'audit_logs');
    expect(audit?.ok).toBe(false);
    expect(audit?.actual).toBe(0);
  });

  it('覆盖全部关键表（含只增不改的审计类）', () => {
    const names = compareTableCounts(full, full).map((c) => c.table);
    expect(names).toContain('audit_logs');
    expect(names).toContain('revisions');
    expect(names).toContain('review_actions');
  });
});

describe('isSafeDrillTarget（安全护栏）', () => {
  const live = '/repo/packages/database/prisma/dev.db';

  it('与线上库同路径时判为不安全', () => {
    // 这是最重要的一条：同路径 = 演练把生产库覆盖成备份内容。
    expect(isSafeDrillTarget(live, live)).toBe(false);
  });

  it('写法不同但指向同一文件时同样判为不安全', () => {
    expect(isSafeDrillTarget('/repo/packages/database/prisma/../prisma/dev.db', live)).toBe(false);
    expect(isSafeDrillTarget('/repo/packages/database/prisma\\dev.db', live)).toBe(false);
  });

  it('不同路径判为安全', () => {
    expect(isSafeDrillTarget('/repo/backups/_drill/restored.db', live)).toBe(true);
  });
});

describe('evaluateDrill', () => {
  const ok = compareTableCounts(
    Object.fromEntries(DRILL_TABLES.map((t) => [t, 1])) as Record<string, number>,
    Object.fromEntries(DRILL_TABLES.map((t) => [t, 1])) as Record<string, number>,
  );

  it('完整性 ok 且行数一致 → 通过', () => {
    expect(evaluateDrill({ integrityCheck: 'ok', comparisons: ok })).toBe(true);
  });

  it('完整性检查只要不是精确的 ok 就算失败', () => {
    // ⚠️ 不能用 includes('ok') —— integrity_check 的失败值常是人话描述，
    // 宽松匹配会把「损坏」判成「通过」。
    expect(evaluateDrill({ integrityCheck: 'not ok', comparisons: ok })).toBe(false);
    expect(evaluateDrill({ integrityCheck: '', comparisons: ok })).toBe(false);
    expect(evaluateDrill({ integrityCheck: 'OK', comparisons: ok })).toBe(true);
  });

  it('任一行数不一致即整体失败（没有部分通过）', () => {
    const bad = ok.map((c) => (c.table === 'contents' ? { ...c, ok: false, actual: 0 } : c));
    expect(evaluateDrill({ integrityCheck: 'ok', comparisons: bad })).toBe(false);
  });
});
