import { extractPlainText, parseTiptapDocument } from '@nanking-atlas/validation';

import { ContentNotFoundError } from './content.service.js';
import { buildCursorPage, type CursorPage, type CursorPayload } from '../../lib/cursor.js';
import { prisma } from '../../lib/prisma.js';

/**
 * FD-001：revision / review action 的只读历史查询。
 *
 * 两条硬约束（AGENTS.md §5.4）：
 * - **只增不改**：这里只有 SELECT，没有任何写入路径；也不会新增修改/删除端点。
 * - **最小披露**：操作人只给 `id` + `displayName`，绝不下发 email / passwordHash /
 *   disabledAt；正文快照只给纯文本摘要，绝不把 `snapshot_json` 原样透出。
 */

/** 快照里正文的纯文本摘要上限；超出截断并显式标记（不做静默截断）。 */
export const MAX_SNAPSHOT_TEXT_LENGTH = 4000;

/** 快照字段白名单 —— 与写入侧 content.service 的 snapshotJson 保持同一组键。 */
interface SnapshotJson {
  title?: unknown;
  subtitle?: unknown;
  summary?: unknown;
  slug?: unknown;
  bodyJson?: unknown;
}

export interface RevisionSnapshot {
  title: string;
  subtitle: string | null;
  summary: string | null;
  slug: string;
  bodyText: string;
  bodyTextLength: number;
  bodyTextTruncated: boolean;
}

export interface RevisionEntry {
  revisionNo: number;
  createdAt: string;
  /** CREATE / UPDATE —— schema 未记录原始动作，由 revisionNo 推断（v1 = 建稿）。 */
  action: 'CREATE' | 'UPDATE';
  actor: { id: string; displayName: string };
  snapshot: RevisionSnapshot;
}

export interface ReviewActionEntry {
  action: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  createdAt: string;
  actor: { id: string; displayName: string };
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requiredString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * 把 snapshot_json 收敛成安全摘要。
 *
 * 正文只保留纯文本：Tiptap JSON 里含节点类型名与 mark，转成文本后既能用于
 * 版本对比，也不会把结构化标记带进 UI。快照写入侧是 JSON 字符串，这里对
 * 解析失败采取**降级而非抛出** —— 追溯历史不能因为一条脏快照读不出来。
 */
export function toRevisionSnapshot(rawSnapshotJson: string): RevisionSnapshot {
  let parsed: SnapshotJson = {};
  try {
    const decoded: unknown = JSON.parse(rawSnapshotJson);
    if (typeof decoded === 'object' && decoded !== null) {
      parsed = decoded;
    }
  } catch {
    parsed = {};
  }

  const rawBody = typeof parsed.bodyJson === 'string' ? parsed.bodyJson : '';
  let bodyText = '';
  if (rawBody.length > 0) {
    try {
      bodyText = extractPlainText(parseTiptapDocument(JSON.parse(rawBody)));
    } catch {
      // 快照正文不合法（例如写入侧在白名单收紧前落库）：留空并保留长度 0，
      // 绝不把原始 JSON 片段回吐给浏览器。
      bodyText = '';
    }
  }

  const truncated = bodyText.length > MAX_SNAPSHOT_TEXT_LENGTH;

  return {
    title: requiredString(parsed.title, ''),
    subtitle: optionalString(parsed.subtitle),
    summary: optionalString(parsed.summary),
    slug: requiredString(parsed.slug, ''),
    bodyText: truncated ? bodyText.slice(0, MAX_SNAPSHOT_TEXT_LENGTH) : bodyText,
    bodyTextLength: bodyText.length,
    bodyTextTruncated: truncated,
  };
}

/**
 * 游标载荷可解码、但语义上不适用于本端点时抛出。
 *
 * 必须是 400 而不是 403：客户端给了一个坏游标，属于请求不合法；把它报成
 * 「没权限」会误导排查方向。控制器的 zod 层会先拦掉绝大多数坏游标，这里是
 * 第二道防线，保证任何路径都不会把坏游标当成第一页静默处理。
 */
export class InvalidHistoryCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHistoryCursorError';
  }
}

/**
 * revision 游标：`id` 承载 revisionNo 而不是 cuid —— Revision 的主键是
 * `(contentId, revisionNo)`，没有独立 id；且 revisionNo 在内容内单调唯一，
 * 用它排序可以得到**全序**，而 `createdAt` 精度可能相同、会漏读或重读。
 * `createdAt` 仍然填真实值，保持游标载荷自解释。
 */
function revisionCursorNo(payload: CursorPayload): number {
  const revisionNo = Number.parseInt(payload.id, 10);
  if (!Number.isSafeInteger(revisionNo) || revisionNo < 1) {
    throw new InvalidHistoryCursorError('游标载荷不适用于版本历史');
  }
  return revisionNo;
}

export interface HistoryQuery {
  limit: number;
  /** 已解码的游标载荷；调用方负责解码与格式校验。 */
  cursor?: CursorPayload | undefined;
}

/**
 * 读取内容的 revision 历史（按 revisionNo 倒序）。
 *
 * 分页遵守 api-contract 的约定：查 `limit + 1` 条判断 hasMore，
 * 截断到 limit 并用最后一条生成 nextCursor。
 */
export async function listRevisions(
  contentId: string,
  query: HistoryQuery,
): Promise<CursorPage<RevisionEntry>> {
  await assertContentExists(contentId);

  const where =
    query.cursor === undefined
      ? { contentId }
      : { contentId, revisionNo: { lt: revisionCursorNo(query.cursor) } };

  const rows = await prisma.revision.findMany({
    where,
    orderBy: { revisionNo: 'desc' },
    take: query.limit + 1,
    select: {
      revisionNo: true,
      snapshotJson: true,
      createdAt: true,
      createdBy: { select: { id: true, displayName: true } },
    },
  });

  const entries: RevisionEntry[] = rows.map((row) => ({
    revisionNo: row.revisionNo,
    createdAt: row.createdAt.toISOString(),
    action: row.revisionNo === 1 ? 'CREATE' : 'UPDATE',
    actor: { id: row.createdBy.id, displayName: row.createdBy.displayName },
    snapshot: toRevisionSnapshot(row.snapshotJson),
  }));

  return buildCursorPage({
    items: entries,
    limit: query.limit,
    toCursorItem: (item) => ({
      createdAt: item.createdAt,
      id: String(item.revisionNo),
    }),
  });
}

/**
 * 读取内容的审核动作（按 createdAt 倒序，id 兜底成全序）。
 *
 * 与 revision 是两套独立序列：状态流转只写 review_action，不产生 revision，
 * 所以既不能把两者合并分页，也**不能**编造二者的对应关系。
 */
export async function listReviewActions(
  contentId: string,
  query: HistoryQuery,
): Promise<CursorPage<ReviewActionEntry>> {
  await assertContentExists(contentId);

  const where =
    query.cursor === undefined
      ? { contentId }
      : buildReviewActionCursorWhere(contentId, query.cursor);

  const rows = await prisma.reviewAction.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    select: {
      id: true,
      action: true,
      fromStatus: true,
      toStatus: true,
      comment: true,
      createdAt: true,
      actor: { select: { id: true, displayName: true } },
    },
  });

  // recordId 只用于生成游标，属于服务端内部排序键，**不进响应体**。
  const entries = rows.map((row) => ({
    recordId: row.id,
    action: row.action,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    reason: row.comment,
    createdAt: row.createdAt.toISOString(),
    actor: { id: row.actor.id, displayName: row.actor.displayName },
  }));

  const page = buildCursorPage({
    items: entries,
    limit: query.limit,
    toCursorItem: (item) => ({ createdAt: item.createdAt, id: item.recordId }),
  });

  return {
    items: page.items.map(({ recordId: _recordId, ...entry }) => entry),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

/**
 * `createdAt desc, id desc` 的 keyset 分页谓词。
 *
 * `(createdAt < c) OR (createdAt = c AND id < i)`：不依赖 OFFSET，翻页期间
 * 新增记录不会让已翻过的页重复或漏读。
 */
function buildReviewActionCursorWhere(contentId: string, payload: CursorPayload) {
  const createdAt = new Date(payload.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new InvalidHistoryCursorError('游标时间载荷不合法');
  }
  return {
    contentId,
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: payload.id } }],
  };
}

/** 内容不存在一律 404：与既有后台端点保持同一语义。 */
async function assertContentExists(contentId: string): Promise<void> {
  const existing = await prisma.content.findUnique({
    where: { id: contentId },
    select: { id: true },
  });
  if (existing === null) {
    throw new ContentNotFoundError(contentId);
  }
}
