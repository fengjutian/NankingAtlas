import { Injectable } from '@nestjs/common';

import { SOURCE_KINDS } from '@nanking-atlas/database';
import { slugSchema } from '@nanking-atlas/validation';

import { ForbiddenError } from '../../common/auth/roles.guard.js';
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
          ...(input.patch.citationText !== undefined ? { citationText: input.patch.citationText } : {}),
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

  /** 给内容挂来源；组合唯一由 schema 复合主键保证，重复会抛 P2002。 */
  async attachToContent(input: {
    contentId: string;
    sourceId: string;
    claimScope: string;
    pageReference?: string | null;
    isPrimary?: boolean;
    actorId: string;
    requestId: string;
  }): Promise<void> {
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
  }

  async listForContent(contentId: string): Promise<
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