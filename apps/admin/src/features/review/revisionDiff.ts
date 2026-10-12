import type { Revision } from '@nanking-atlas/api-contract';

/**
 * 版本差异比较（FD-001）。
 *
 * ## 为什么用「公共前后缀」而不是 LCS / 行级 diff
 *
 * 版本历史是**只读快照**，用户只是想知道「这一版改了什么」，不是要合并。
 * 逐字符 LCS 在 4000 字正文上是 O(n·m)≈1600 万次比较，主线程会明显卡顿
 * ——AGENTS.md / FD-001 都明确要求「大正文差异不得冻结浏览器」。
 *
 * 前缀/后缀比较是 O(n)：绝大多数编辑是「中间动了一小段」，公共前后缀能精确
 * 定位改动区间；整段重写时退化成「全部替换」，结果依然正确，只是粒度变粗。
 * 它不会给出错误的 diff，只可能给出较粗的 diff —— 对只读追溯够用了。
 */

/** 快照里参与对比的标量字段（正文单独走正文对比）。 */
export const SNAPSHOT_FIELDS = ['title', 'subtitle', 'summary', 'slug'] as const;

export type SnapshotFieldName = (typeof SNAPSHOT_FIELDS)[number];

export const SNAPSHOT_FIELD_LABELS: Readonly<Record<SnapshotFieldName, string>> = {
  title: '标题',
  subtitle: '副标题',
  summary: '摘要',
  slug: 'slug',
};

export type DiffSegmentKind = 'same' | 'removed' | 'added';

export interface DiffSegment {
  kind: DiffSegmentKind;
  text: string;
}

/** 正文差异。`truncated` 表示正文本身已被服务端截断，差异结果不完整。 */
export interface TextDiff {
  segments: DiffSegment[];
  truncated: boolean;
  /** 是否有实际改动。 */
  changed: boolean;
}

export interface FieldDiff {
  field: SnapshotFieldName;
  label: string;
  /** 已归一化：null 与空串都折成 ''（服务端同样按"没有值"处理）。 */
  before: string;
  after: string;
  changed: boolean;
}

export interface RevisionDiff {
  /** from → to。 */
  fromRevisionNo: number;
  toRevisionNo: number;
  fields: FieldDiff[];
  body: TextDiff;
  /** 整个快照（正文在内）是否有任何改动。 */
  changed: boolean;
}

function normalize(value: string | null): string {
  return value === null || value.length === 0 ? '' : value;
}

/**
 * 文本差异：剥离公共前后缀，中间标记为「删除 + 新增」。
 *
 * 退化情况（一边是另一边的前缀/后缀）单独处理，否则前缀算法会把后缀也算进
 * 公共部分，导致「只删了开头」被显示成「只加了开头」，方向反了。
 */
export function diffText(before: string, after: string): DiffSegment[] {
  if (before === after) {
    return before.length === 0 ? [] : [{ kind: 'same', text: before }];
  }

  // 前缀后缀退化：before 是 after 的前缀 → 纯新增
  if (after.startsWith(before)) {
    return [
      ...prefixSegments(before, 'same'),
      ...prefixSegments(after.slice(before.length), 'added'),
    ];
  }
  // before 是 after 的后缀 → 纯删除
  if (before.endsWith(after)) {
    return [
      ...prefixSegments(before.slice(0, before.length - after.length), 'removed'),
      ...prefixSegments(after, 'same'),
    ];
  }

  let start = 0;
  const maxStart = Math.min(before.length, after.length);
  while (start < maxStart && before[start] === after[start]) {
    start += 1;
  }

  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore -= 1;
    endAfter -= 1;
  }

  return [
    ...prefixSegments(before.slice(0, start), 'same'),
    ...prefixSegments(before.slice(start, endBefore), 'removed'),
    ...prefixSegments(after.slice(start, endAfter), 'added'),
    ...prefixSegments(before.slice(endBefore), 'same'),
  ].filter((segment) => segment.text.length > 0);
}

function prefixSegments(text: string, kind: DiffSegmentKind): DiffSegment[] {
  return text.length === 0 ? [] : [{ kind, text }];
}

function buildTextDiff(before: TextDiffInput, after: TextDiffInput): TextDiff {
  const segments = diffText(before.text, after.text);
  return {
    segments,
    truncated: before.truncated || after.truncated,
    changed: before.text !== after.text,
  };
}

interface TextDiffInput {
  text: string;
  truncated: boolean;
}

/**
 * 比较两个版本。
 *
 * `from` 是旧版本、`to` 是新版本（时间线上通常是后选后减，或前选新减）。
 * 调用方负责排序，这里不做任何"哪边更新"的假设。
 */
export function diffRevisions(from: Revision, to: Revision): RevisionDiff {
  const fields: FieldDiff[] = SNAPSHOT_FIELDS.map((field) => {
    const before = normalize(from.snapshot[field] as string | null);
    const after = normalize(to.snapshot[field] as string | null);
    return {
      field,
      label: SNAPSHOT_FIELD_LABELS[field],
      before: before,
      after,
      changed: before !== after,
    };
  });

  const body = buildTextDiff(
    {
      text: from.snapshot.bodyText,
      truncated: from.snapshot.bodyTextTruncated,
    },
    { text: to.snapshot.bodyText, truncated: to.snapshot.bodyTextTruncated },
  );

  return {
    fromRevisionNo: from.revisionNo,
    toRevisionNo: to.revisionNo,
    fields,
    body,
    changed: fields.some((field) => field.changed) || body.changed,
  };
}

/** 时间线里某一条的标签；CREATE / UPDATE 来自服务端推断，审核动作另有中文表。 */
export function revisionActionLabel(action: string): string {
  return action === 'CREATE' ? '建稿' : '编辑';
}