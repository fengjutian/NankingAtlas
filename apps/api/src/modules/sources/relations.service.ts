import { Injectable } from '@nestjs/common';

import { ForbiddenError } from '../../common/auth/roles.guard.js';
import { prisma } from '../../lib/prisma.js';
import { isRelationType } from '../contents/content-state-machine.js';

/**
 * 内容关联（P1-05）：`content_relations`。
 *
 * 技术方案 §5.3：「关系两端必须存在；关系类型由受控字典校验」
 * + 「禁止自关联和重复关系」。
 */
@Injectable()
export class RelationsService {
  async create(input: {
    sourceContentId: string;
    targetContentId: string;
    relationType: string;
    directionNote?: string | null;
    actorId: string;
    requestId: string;
  }): Promise<void> {
    // 1. 禁止自关联
    if (input.sourceContentId === input.targetContentId) {
      throw new ForbiddenError('不能把内容关联到自身');
    }
    // 2. 关系类型受控字典
    if (!isRelationType(input.relationType)) {
      throw new ForbiddenError(`无效关系类型：${input.relationType}`);
    }

    await prisma.$transaction(async (tx) => {
      // 3. 两端必须存在
      const [from, to] = await Promise.all([
        tx.content.findUnique({ where: { id: input.sourceContentId }, select: { id: true } }),
        tx.content.findUnique({ where: { id: input.targetContentId }, select: { id: true } }),
      ]);
      if (from === null || to === null) {
        throw new ForbiddenError('关联的内容必须两端都存在');
      }
      // 4. 禁止重复
      const existing = await tx.contentRelation.findUnique({
        where: {
          sourceContentId_targetContentId_relationType: {
            sourceContentId: input.sourceContentId,
            targetContentId: input.targetContentId,
            relationType: input.relationType,
          },
        },
        select: { sourceContentId: true },
      });
      if (existing !== null) {
        throw new ForbiddenError('相同关系的重复记录已被拒绝');
      }

      await tx.contentRelation.create({
        data: {
          sourceContentId: input.sourceContentId,
          targetContentId: input.targetContentId,
          relationType: input.relationType,
          directionNote: input.directionNote ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          requestId: input.requestId,
          action: 'content.create_relation',
          entityType: 'content',
          entityId: input.sourceContentId,
          afterJson: JSON.stringify({
            targetContentId: input.targetContentId,
            relationType: input.relationType,
          }),
        },
      });
    });
  }

  async listForContent(contentId: string): Promise<
    { targetContentId: string; relationType: string; directionNote: string | null }[]
  > {
    const rows = await prisma.contentRelation.findMany({
      where: { OR: [{ sourceContentId: contentId }, { targetContentId: contentId }] },
    });
    return rows.map((row) => ({
      targetContentId: row.targetContentId,
      relationType: row.relationType,
      directionNote: row.directionNote,
    }));
  }
}