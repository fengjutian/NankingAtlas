import { Injectable } from '@nestjs/common';

import { SOURCE_KINDS } from '@nanking-atlas/database';
import { slugSchema } from '@nanking-atlas/validation';

import { ForbiddenError } from '../../common/auth/roles.guard.js';
import {
  InvalidCursorError,
  encodeKeysetCursor,
  type CursorPage,
  type KeysetCursorPayload,
} from '../../lib/cursor.js';
import { prisma } from '../../lib/prisma.js';

/**
 * 来源（sources / content_sources）—— P1-05。
 *
 * 技术方案 §5.3 与 §6：
 *   - 发布内容必须具备至少一项来源，或明确的原创/采访说明
 *   - `content_sources` 组合唯一（content_id, source_id, claim_scope）
 *   - 来源是可追溯性核心，**只增不改**来源本身记录（改就是新建一条）
 */

export interface SourceRecord {
  id: string;
  kind: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publicationDate: Date | null;
  url: string | null;
  accessedAt: Date | null;
  citationText: string | null;
  verificationNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SourcesService {
  /**
   * 创建来源。
   *
   * URL 校验：只允许 http/https；禁止 javascript: 等（AGENTS.md §4.5「URL 必须净化」）。
   */
  async create(input: {
    kind: string;
    title: string;
    author?: string | null;
    publisher?: string | null;
    publicationDate?: string | null;
    url?: string | null;
    accessedAt?: string | null;
    citationText?: string | null;
    verificationNote?: string | null;
    actorId: string;
    requestId: string;
  }): Promise<SourceRecord> {
    assertKind(input.kind);
    assertSourceUrl(input.url ?? null);

    return prisma.$transaction(async (tx) => {
      const created = await tx.source.create({
        data: {
          kind: input.kind,
          title: input.title,
          author: input.author ?? null,
          publisher: input.publisher ?? null,
          publicationDate: input.publicationDate ? new Date(input.publicationDate) : null,
          url: input.url ?? null,
          accessedAt: input.accessedAt ? new Date(input.accessedAt) : null,
          citationText: input.citationText ?? null,
          verificationNote: input.verificationNote ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          requestId: input.requestId,
          action: 'source.create',
          entityType: 'source',
          entityId: created.id,
          afterJson: JSON.stringify({ kind: input.kind, title: input.title }),
        },
      });
      return created;
    });
  }

  async update(input: {
    id: string;
    expectedVersion: number;
    patch: Partial<Omit<SourceRecord, 'id' | 'createdAt' | 'updatedAt'>>;
    actorId: string;
    requestId: string;
  }): Promise<SourceRecord> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.source.findUniqueOrThrow({ where: { id: input.id } });
      assertSourceUrl(input.patch.url ?? existing.url);

      const updated = await tx.source.update({
        where: { id: input.id },
        data: {
          ...(input.patch.title !== undefined ? { title: input.patch.title } : {}),
          ...(input.patch.author !== undefined ? { author: input.patch.author } : {}),
          ...(input.patch.publisher !== undefined ? { publisher: input.patch.publisher } : {}),
          ...(input.patch.url !== undefined ? { url: input.patch.url } : {}),
          ...(input.patch.citationText !== undefined
            ? { citationText: input.patch.citationText }
            : {}),
          ...(input.patch.verificationNote !== undefined
            ? { verificationNote: input.patch.verificationNote }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          requestId: input.requestId,
          action: 'source.update',
          entityType: 'source',
          entityId: input.id,
          beforeJson: JSON.stringify({ title: existing.title, url: existing.url }),
          afterJson: JSON.stringify({ title: updated.title, url: updated.url }),
        },
      });
      return updated;
    });
  }

  async findById(id: string): Promise<SourceRecord | null> {
    return prisma.source.findUnique({ where: { id } });
  }

  /** 给内容挂来源；组合唯一由 schema 复合主键保证，重复会抛 409 而非 500。 */
  async attachToContent(input: {
    contentId: string;
    sourceId: string;
    claimScope: string;
    pageReference?: string | null;
    isPrimary?: boolean;
    actorId: string;
    requestId: string;
  }): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        const content = await tx.content.findUnique({
          where: { id: input.contentId },
          select: { id: true },
        });
        if (content === null) {
          throw new ForbiddenError('内容不存在');
        }
        await tx.contentSource.create({
          data: {
            contentId: input.contentId,
            sourceId: input.sourceId,
            claimScope: input.claimScope,
            pageReference: input.pageReference ?? null,
            isPrimary: input.isPrimary ?? false,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            requestId: input.requestId,
            action: 'content.attach_source',
            entityType: 'content',
            entityId: input.contentId,
            afterJson: JSON.stringify({ sourceId: input.sourceId, claimScope: input.claimScope }),
          },
        });
      });
    } catch (error) {
      // 唯一约束冲突是**用户的可修正操作**（换个论断范围或取消），
      // 不是服务端故障 —— 必须翻译成 409，不能让它冒泡成 500。
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateContentSourceError();
      }
      throw error;
    }
  }

  async listForContent(
    contentId: string,
  ): Promise<
    { claimScope: string; pageReference: string | null; isPrimary: boolean; source: SourceRecord }[]
  > {
    const rows = await prisma.contentSource.findMany({
      where: { contentId },
      include: { source: true },
    });
    return rows.map((row) => ({
      claimScope: row.claimScope,
      pageReference: row.pageReference,
      isPrimary: row.isPrimary,
      source: row.source,
    }));
  }

  // -------------------------------------------------------------------------
  // 检索（FD-002）
  // -------------------------------------------------------------------------

  /**
   * 检索来源库。
   *
   * ## 为什么是全表扫描而不是全文索引
   *
   * 数据层是 SQLite（ADR 0001），**没有** PostgreSQL 的 tsvector / 中文 trigram
   * 扩展，也没有 FTS5 中文分词表。`LIKE '%x%'` 无法走索引，只能全表扫。
   *
   * 这是有意识的取舍：来源库是编辑侧的**小表**（一条内容挂几条来源，全库
   * 量级在千条内），一次全表扫远低于毫秒级，而加一套中文分词会带来数据迁移、
   * 词典维护和"分词错了检索不到"的新问题。若来源量级真的涨到需要索引，
   * 应当先出 ADR 再改数据层 —— 不在这里偷偷引入第二种检索方案。
   *
   * `title` 排序与游标谓词使用**同一份完整标题**：若排序按前缀、谓词按前缀
   * （或反之），两套顺序就会不一致，翻页会静默漏读或重读。标题上限 300 字，
   * 编出的游标仍在 2048 字符上限内。
   */
  async search(input: {
    q?: string | undefined;
    kind?: string | undefined;
    sort: SourceSort;
    limit: number;
    cursor?: KeysetCursorPayload | undefined;
  }): Promise<CursorPage<SourceSearchItem>> {
    const spec = SOURCE_SORT_SPECS[input.sort];

    const filters: Record<string, unknown>[] = [];
    if (input.q !== undefined) {
      filters.push({
        OR: [
          { title: { contains: input.q } },
          { author: { contains: input.q } },
          { publisher: { contains: input.q } },
        ],
      });
    }
    if (input.kind !== undefined) {
      filters.push({ kind: input.kind });
    }
    if (input.cursor !== undefined) {
      filters.push(keysetWhere(input.cursor, input.sort));
    }

    const rows = await prisma.source.findMany({
      where: filters.length === 0 ? {} : { AND: filters },
      orderBy: spec.orderBy,
      take: input.limit + 1,
      select: { ...SOURCE_SEARCH_SELECT, createdAt: true },
    });

    // createdAt 只用于生成游标，**不进响应体**。
    const cursorable = rows.map((row) => ({
      item: toSourceSearchItem(row),
      sortValue: spec.sortValueOf(row.createdAt.toISOString(), row.title),
      id: row.id,
    }));

    // 这里不能复用 `buildCursorPage`：它内部用固定游标（createdAt + id），
    // 而本页按白名单字段排序，游标必须带上排序键与排序方式。
    const hasMore = cursorable.length > input.limit;
    const page = hasMore ? cursorable.slice(0, input.limit) : cursorable;
    const last = page[page.length - 1];

    return {
      items: page.map((entry) => entry.item),
      nextCursor:
        hasMore && last !== undefined
          ? encodeKeysetCursor({ sort: input.sort, sortValue: last.sortValue, id: last.id })
          : null,
      hasMore,
    };
  }
}

/** 检索结果的字段白名单 —— 不含 `citationText`（4000 字上限，不适合选择器）。 */
const SOURCE_SEARCH_SELECT = {
  id: true,
  kind: true,
  title: true,
  author: true,
  publisher: true,
  publicationDate: true,
  accessedAt: true,
  verificationNote: true,
} as const;

export interface SourceSearchItem {
  id: string;
  kind: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publicationDate: string | null;
  accessedAt: string | null;
  verificationNote: string | null;
}

/** 允许的排序方式白名单。请求里的 `sort` 必须精确命中其中一个。 */
export const SOURCE_SORTS = ['createdAt:desc', 'title:asc'] as const;

export type SourceSort = (typeof SOURCE_SORTS)[number];

interface SourceSortSpec {
  orderBy: Record<string, 'asc' | 'desc'>[];
  /** 从一条记录取出它在当前排序下的游标取值。 */
  sortValueOf: (createdAtIso: string, title: string) => string;
}

const SOURCE_SORT_SPECS: Readonly<Record<SourceSort, SourceSortSpec>> = {
  'createdAt:desc': {
    // 兜底键 id 保证同毫秒的记录也有确定顺序（keyset 分页要求全序）
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    sortValueOf: (createdAtIso) => createdAtIso,
  },
  'title:asc': {
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
    sortValueOf: (_createdAtIso, title) => title,
  },
};

function toSourceSearchItem(row: {
  id: string;
  kind: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publicationDate: Date | null;
  accessedAt: Date | null;
  verificationNote: string | null;
}): SourceSearchItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    publicationDate: row.publicationDate?.toISOString() ?? null,
    accessedAt: row.accessedAt?.toISOString() ?? null,
    verificationNote: row.verificationNote,
  };
}

/**
 * 把变序游标翻译成 keyset 谓词。
 *
 * `(sortKey <p v) OR (sortKey = v AND id <p i)` —— 绝不改成 OFFSET： OFFSET 在
 * 翻页期间有新来源入库时会重读或漏读，keyset 不会。
 *
 * 游标里的 `sort` 必须与当前请求一致，否则两个序列的顺序不同，
 * 拿偏移量当位置会**静默**读错数据，必须报错而不是硬解。
 */
function keysetWhere(payload: KeysetCursorPayload, sort: SourceSort): Record<string, unknown> {
  if (payload.sort !== sort) {
    throw new InvalidCursorError(
      'CURSOR_PAYLOAD_INVALID',
      `游标由 ${payload.sort} 排序产生，不能用于 ${sort} 查询`,
    );
  }

  if (sort === 'createdAt:desc') {
    const createdAt = new Date(payload.sortValue);
    if (Number.isNaN(createdAt.getTime())) {
      throw new InvalidCursorError('CURSOR_PAYLOAD_INVALID', '游标时间载荷不合法');
    }
    return {
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: payload.id } }],
    };
  }

  const prefix = payload.sortValue;
  return {
    OR: [
      { title: { gt: prefix } },
      { AND: [{ title: { equals: prefix } }, { id: { gt: payload.id } }] },
    ],
  };
}

/** 组合唯一 (content_id, source_id, claim_scope) 被触发时的可读错误。 */
export class DuplicateContentSourceError extends Error {
  constructor() {
    super('该来源已经以相同的论断范围挂在当前内容上');
    this.name = 'DuplicateContentSourceError';
  }
}

/** Prisma 唯一约束冲突（`content_sources` 复合主键）。 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

export function assertKind(kind: string): void {
  if (!(SOURCE_KINDS as readonly string[]).includes(kind)) {
    throw new ForbiddenError(`无效来源类型：${kind}`);
  }
}

/**
 * 来源 URL 协议校验。
 *
 * 拒绝 javascript: / data: / vbscript:；只允许 http / https。
 */
export function assertSourceUrl(url: string | null): void {
  if (url === null || url === '') {
    return;
  }
  const lower = url.trim().toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    throw new ForbiddenError('来源 URL 只允许 http / https 协议');
  }
  if (/[\s<>]/.test(url)) {
    throw new ForbiddenError('来源 URL 不能包含空白或尖括号');
  }
}

/** slug 复用 validation 包的小写规则（sources 不需要 slug，但 tags 需要）。 */
export { slugSchema };
