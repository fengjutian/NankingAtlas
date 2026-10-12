import { describe, expect, it } from 'vitest';

import type { Revision } from '@nanking-atlas/api-contract';

import { diffRevisions, diffText, revisionActionLabel } from './revisionDiff';

/**
 * 版本差异单测。
 *
 * 重点是**不会给出错误方向**的 diff —— 退化情况（前缀 / 后缀）最容易把
 * 「删除」显示成「新增」，那比粒度粗严重得多。
 */

function revision(no: number, overrides: Partial<Revision['snapshot']> = {}): Revision {
  return {
    revisionNo: no,
    createdAt: '2026-10-12T00:00:00.000Z',
    action: no === 1 ? 'CREATE' : 'UPDATE',
    actor: { id: 'u1', displayName: '编辑者' },
    snapshot: {
      title: '标题',
      subtitle: null,
      summary: '摘要',
      slug: 'a-slug',
      bodyText: '正文',
      bodyTextLength: 2,
      bodyTextTruncated: false,
      ...overrides,
    },
  };
}

describe('diffText 基本行为', () => {
  it('完全相同 → 无 added / removed', () => {
    expect(diffText('一样的正文', '一样的正文')).toEqual([
      { kind: 'same', text: '一样的正文' },
    ]);
  });

  it('两边都为空 → 空数组', () => {
    expect(diffText('', '')).toEqual([]);
  });

  it('空 → 有内容：全部新增', () => {
    expect(diffText('', '新增内容')).toEqual([{ kind: 'added', text: '新增内容' }]);
  });

  it('有内容 → 空：全部删除', () => {
    expect(diffText('原有内容', '')).toEqual([{ kind: 'removed', text: '原有内容' }]);
  });

  it('中间改动：保留公共前后缀', () => {
    expect(diffText('前面中间后面', '前面改过后面')).toEqual([
      { kind: 'same', text: '前面' },
      { kind: 'removed', text: '中间' },
      { kind: 'added', text: '改过' },
      { kind: 'same', text: '后面' },
    ]);
  });

  it('整段替换 → 只保留公共后缀', () => {
    // 「正文」是两侧共有的后缀，会被正确识别为 same 而不是重复算进改动区间。
    expect(diffText('旧正文', '全新正文')).toEqual([
      { kind: 'removed', text: '旧' },
      { kind: 'added', text: '全新' },
      { kind: 'same', text: '正文' },
    ]);
  });

  it('毫无共同片段时全部标为替换', () => {
    expect(diffText('旧正文', '全新内容')).toEqual([
      { kind: 'removed', text: '旧正文' },
      { kind: 'added', text: '全新内容' },
    ]);
  });

  it('公共前后缀不重叠（避免把同一段算两次）', () => {
    // "aaa" -> "aaaa"：前缀退化分支，后缀不能被再算一遍
    expect(diffText('aaa', 'aaaa')).toEqual([
      { kind: 'same', text: 'aaa' },
      { kind: 'added', text: 'a' },
    ]);
    // "aaaa" -> "aaa"：后缀退化分支
    expect(diffText('aaaa', 'aaa')).toEqual([
      { kind: 'removed', text: 'a' },
      { kind: 'same', text: 'aaa' },
    ]);
  });

  it('删除开头的段落不会被显示成新增', () => {
    expect(diffText('删除我保留我', '保留我')).toEqual([
      { kind: 'removed', text: '删除我' },
      { kind: 'same', text: '保留我' },
    ]);
  });

  it('删除结尾的段落不会被显示成新增', () => {
    expect(diffText('保留我删除我', '保留我')).toEqual([
      { kind: 'same', text: '保留我' },
      { kind: 'removed', text: '删除我' },
    ]);
  });

  it('拼接后能还原两侧原文（不丢字、不加字）', () => {
    const pairs: [string, string][] = [
      ['前面中间后面', '前面改过后面'],
      ['旧正文', '全新正文'],
      ['aaa', 'aaaa'],
      ['aaaa', 'aaa'],
      ['', 'abc'],
      ['abc', ''],
      ['abcdef', 'abXYef'],
      ['完全不同的两段文字甲', '完全不同的两段文字乙'],
    ];
    for (const [before, after] of pairs) {
      const segments = diffText(before, after);
      const restoredBefore = segments
        .filter((s) => s.kind === 'same' || s.kind === 'removed')
        .map((s) => s.text)
        .join('');
      const restoredAfter = segments
        .filter((s) => s.kind === 'same' || s.kind === 'added')
        .map((s) => s.text)
        .join('');
      expect(restoredBefore, `before 还原失败：${before} → ${after}`).toBe(before);
      expect(restoredAfter, `after 还原失败：${before} → ${after}`).toBe(after);
    }
  });

  it('长正文也不会产出超大结果（公共前后缀是 O(n)）', () => {
    const long = '文'.repeat(4000);
    const segments = diffText(long, `${long.slice(0, 2000)}改${long.slice(2001)}`);
    expect(segments.length).toBeLessThanOrEqual(4);
    expect(segments.reduce((sum, segment) => sum + segment.text.length, 0)).toBeLessThanOrEqual(4002);
  });
});

describe('diffRevisions', () => {
  it('字段级差异逐项列出', () => {
    const result = diffRevisions(
      revision(1, { title: '旧标题', subtitle: '旧副标题' }),
      revision(2, { title: '新标题', summary: '新摘要' }),
    );

    expect(result.fromRevisionNo).toBe(1);
    expect(result.toRevisionNo).toBe(2);
    expect(result.changed).toBe(true);

    const title = result.fields.find((field) => field.field === 'title');
    expect(title?.before).toBe('旧标题');
    expect(title?.after).toBe('新标题');
    expect(title?.changed).toBe(true);

    const subtitle = result.fields.find((field) => field.field === 'subtitle');
    expect(subtitle?.before).toBe('旧副标题');
    expect(subtitle?.after).toBe('');
    expect(subtitle?.changed).toBe(true);

    const summary = result.fields.find((field) => field.field === 'summary');
    expect(summary?.before).toBe('摘要');
    expect(summary?.after).toBe('新摘要');
    expect(summary?.changed).toBe(true);

    const slug = result.fields.find((field) => field.field === 'slug');
    expect(slug?.changed).toBe(false);
  });

  it('null 与空串视为等价（服务端已归一化）', () => {
    const result = diffRevisions(revision(1, { subtitle: null }), revision(2, { subtitle: '' }));
    expect(result.fields.find((field) => field.field === 'subtitle')?.changed).toBe(false);
    expect(result.changed).toBe(false);
  });

  it('正文改动时 body.changed 为 true 且给出片段', () => {
    const result = diffRevisions(
      revision(1, { bodyText: '第一段旧内容', bodyTextLength: 6 }),
      revision(2, { bodyText: '第一段新内容', bodyTextLength: 6 }),
    );
    expect(result.body.changed).toBe(true);
    expect(result.body.segments.some((segment) => segment.kind === 'removed')).toBe(true);
    expect(result.body.segments.some((segment) => segment.kind === 'added')).toBe(true);
  });

  it('任一侧被截断时显式标记 truncated（差异不完整）', () => {
    const result = diffRevisions(
      revision(1, { bodyText: '短', bodyTextLength: 5000, bodyTextTruncated: true }),
      revision(2, { bodyText: '短', bodyTextLength: 5000, bodyTextTruncated: true }),
    );
    expect(result.body.truncated).toBe(true);
    // 正文可见部分相同，仍要如实说"这段比较不可靠"
    expect(result.body.changed).toBe(false);
  });

  it('同一版本与自身比较 → 无任何改动', () => {
    const result = diffRevisions(revision(3), revision(3));
    expect(result.changed).toBe(false);
    expect(result.fields.every((field) => !field.changed)).toBe(true);
    expect(result.body.changed).toBe(false);
  });
});

describe('revisionActionLabel', () => {
  it('CREATE / UPDATE 有中文标签', () => {
    expect(revisionActionLabel('CREATE')).toBe('建稿');
    expect(revisionActionLabel('UPDATE')).toBe('编辑');
  });
});