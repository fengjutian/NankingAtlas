import { Injectable } from '@nestjs/common';

import { slugSchema } from '@nanking-atlas/validation';

import { ForbiddenError } from '../../common/auth/roles.guard.js';
import { prisma } from '../../lib/prisma.js';

/**
 * 标签（P1-05）：`tags` / `content_tags`。
 * slug 唯一 + 连接表组合唯一由 schema 保证。
 */
@Injectable()
export class TagsService {
  /** upsert 标签：slug 已存在则只更新显示名（幂等）。 */
  async upsert(input: {
    slug: string;
    displayName: string;
    actorId: string;
    requestId: string;
  }): Promise<{ slug: string; displayName: string }> {
    const slug = slugSchema.parse(input.slug);
    const row = await prisma.tag.upsert({
      where: { slug },
      create: { slug, displayName: input.displayName },
      update: { displayName: input.displayName },
    });
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        requestId: input.requestId,
        action: 'tag.upsert',
        entityType: 'tag',
        entityId: slug,
        afterJson: JSON.stringify({ displayName: input.displayName }),
      },
    });
    return { slug: row.slug, displayName: row.displayName };
  }

  /** 给内容打标签；已存在则跳过（幂等）。 */
  async attach(
    contentId: string,
    tagSlug: string,
    actorId: string,
    requestId: string,
  ): Promise<void> {
    const slug = slugSchema.parse(tagSlug);
    await prisma.$transaction(async (tx) => {
      const content = await tx.content.findUnique({
        where: { id: contentId },
        select: { id: true },
      });
      if (content === null) {
        throw new ForbiddenError('内容不存在');
      }
      const tag = await tx.tag.findUnique({ where: { slug }, select: { slug: true } });
      if (tag === null) {
        throw new ForbiddenError('标签不存在，请先创建标签');
      }
      // 幂等：已关联则跳过（避免 P2002）。
      const existing = await tx.contentTag.findUnique({
        where: { contentId_tagSlug: { contentId, tagSlug: slug } },
        select: { contentId: true },
      });
      if (existing !== null) {
        return;
      }
      await tx.contentTag.create({ data: { contentId, tagSlug: slug } });
      await tx.auditLog.create({
        data: {
          actorId,
          requestId,
          action: 'content.attach_tag',
          entityType: 'content',
          entityId: contentId,
          afterJson: JSON.stringify({ tagSlug: slug }),
        },
      });
    });
  }

  async listForContent(contentId: string): Promise<{ slug: string; displayName: string }[]> {
    const rows = await prisma.contentTag.findMany({
      where: { contentId },
      include: { tag: true },
    });
    return rows.map((row) => ({ slug: row.tag.slug, displayName: row.tag.displayName }));
  }
}
