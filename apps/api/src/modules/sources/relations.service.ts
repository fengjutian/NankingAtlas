import { Injectable } from '@nestjs/common';

import { RELATION_TYPES } from '@nanking-atlas/database';

import { ForbiddenError } from '../../common/auth/roles.guard.js';
import { prisma } from '../../lib/prisma.js';
import { isRelationType } from '../contents/content-state-machine.js';

/**
 * 内容关联（P1-05 / FD-008）：`content_relations`。
 *
 * 技术方案 §5.3：「关系两端必须存在；关系类型由受控字典校验」
 * + 「禁止自关联和重复关系」。
 *
 * ## 方向语义由这里统一定义（FD-008）
 *
 * `content_relations` 存的是有向边（source → target），但"从某个内容看它的
 * 关联"必须同时看到两种：
 *   - **出边**：本内容 → 对方（OUTGOING）
 *   - **入边**：对方 → 本内容（INCOMING）
 *
 * 所以返回的一律是 `otherContentId`（**对方**）+ `direction`（我处于哪一侧），
 * 而不是裸的 `targetContentId`。返回后者会让"被指向的内容"看到自己 —— 那是
 * 一个看起来能跑、实际把关系展示反了的 bug。
 *
 * `symmetric` 告诉前端该关系是否天然双向（`RELATED_TO`），决定文案措辞；
 * 其余类型（`PART_OF` / `INFLUENCED` / `CONTINUES` / `REFERENCES` /
 * `LOCATED_AT`）都是单向的，入边需要读成"X 指向本内容"而不是"本内容 → X"。
 */

/** 天然对称的关系：正反读都成立，不需要区分方向措辞。 */
const SYMMETRIC_RELATION_TYPES: ReadonlySet<string> = new Set(['RELATED_TO']);

export function isSymmetricRelation(relationType: string): boolean {
  return SYMMETRIC_RELATION_TYPES.has(relationType);
}

/** 关系方向。 */
export type RelationDirection = 'OUTGOING' | 'INCOMING';

export interface RelationEntry {
  otherContentId: string;
  otherTitle: string | null;
  otherType: string | null;
  relationType: string;
  direction: RelationDirection;
  symmetric: boolean;
  directionNote: string | null;
}

export interface RelationTargetItem {
  id: string;
  type: string;
  slug: string;
  title: string;
  status: string;
}

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

  /**
   * 某内容的全部关联（出边 + 入边），方向已归一。
   *
   * 一条关系对某个内容只可能出现一次：source 与 target 不可能相同（禁自关联），
   * 所以 `OR` 查询不会把同一条关系收两次。
   */
  async listForContent(contentId: string): Promise<RelationEntry[]> {
    const rows = await prisma.contentRelation.findMany({
      where: { OR: [{ sourceContentId: contentId }, { targetContentId: contentId }] },
      include: {
        source: { select: { id: true, title: true, type: true } },
        target: { select: { id: true, title: true, type: true } },
      },
      orderBy: [{ relationType: 'asc' }, { sourceContentId: 'asc' }],
    });

    return rows.map((row) => {
      const outgoing = row.sourceContentId === contentId;
      const other = outgoing ? row.target : row.source;
      return {
        // 无论从哪一端看，展示的都是**对方**
        otherContentId: other?.id ?? (outgoing ? row.targetContentId : row.sourceContentId),
        otherTitle: other?.title ?? null,
        otherType: other?.type ?? null,
        relationType: row.relationType,
        direction: outgoing ? 'OUTGOING' : 'INCOMING',
        symmetric: isSymmetricRelation(row.relationType),
        directionNote: row.directionNote,
      };
    });
  }

  /**
   * 可作为关系目标的内容检索（FD-008）。
   *
   * 与标签选择器不同，这里**允许**选草稿 —— 编辑要先把两条内容连起来，内容
   * 之后再审。所以不按发布状态过滤，但返回 status 让编辑自己判断。
   */
  async searchTargets(input: {
    q?: string | undefined;
    limit: number;
  }): Promise<RelationTargetItem[]> {
    const trimmed = input.q?.trim();
    return prisma.content.findMany({
      where: {
        ...(trimmed === undefined || trimmed === ''
          ? {}
          : {
              OR: [
                { title: { contains: trimmed } },
                { slug: { contains: trimmed } },
                { summary: { contains: trimmed } },
              ],
            }),
      },
      orderBy: { updatedAt: 'desc' },
      take: input.limit,
      select: { id: true, type: true, slug: true, title: true, status: true },
    });
  }
}

/** 关系类型字典（供控制器做 zod 枚举，避免硬编码字符串）。 */
export const RELATION_TYPE_VALUES = RELATION_TYPES;
