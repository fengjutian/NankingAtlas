import { Injectable } from '@nestjs/common';

import { ForbiddenError } from '../../common/auth/roles.guard.js';
import { prisma } from '../../lib/prisma.js';

/**
 * 首页槽位（P2-02）。
 *
 * 技术方案 §4：「`homepage_slots` | slot_key、content_id、position、
 * starts_at、ends_at；由后台配置」。
 *
 * 时间窗语义（关键）：
 *   - `startsAt` / `endsAt` 都为 null → 常驻
 *   - 只有 `startsAt` → 到该时刻起生效（排期）
 *   - 只有 `endsAt` → 到该时刻止（自动下架）
 *   - 两者都有 → 窗口内生效
 *
 * 公开查询只返回「当前时间落在窗口内」**且** 引用内容仍为 PUBLISHED 的槽位。
 * 后者很关键：内容撤回后槽位必须自动失效，而不是继续指向一个 404。
 */

/** 槽位键白名单 —— 受控字典，避免后台拼错导致首页出现未知区块。 */
export const HOMEPAGE_SLOT_KEYS = ['hero', 'featured', 'latest', 'places', 'routes'] as const;
export type HomepageSlotKey = (typeof HOMEPAGE_SLOT_KEYS)[number];

export function isHomepageSlotKey(value: string): value is HomepageSlotKey {
  return (HOMEPAGE_SLOT_KEYS as readonly string[]).includes(value);
}

export interface PublicSlot {
  slotKey: string;
  position: number;
  content: {
    id: string;
    type: string;
    slug: string;
    title: string;
    subtitle: string | null;
    summary: string | null;
    publishedAt: Date | null;
  } | null;
}

@Injectable()
export class HomepageService {
  /**
   * 公开读取当前生效的槽位。
   *
   * 用单条查询 + 内存过滤，而不是逐槽位查内容（避免 N+1）。
   */
  async listActiveSlots(now: Date = new Date()): Promise<PublicSlot[]> {
    const rows = await prisma.homepageSlot.findMany({
      where: {
        OR: [
          { startsAt: null, endsAt: null },
          { startsAt: { lte: now }, endsAt: null },
          { startsAt: null, endsAt: { gte: now } },
          { startsAt: { lte: now }, endsAt: { gte: now } },
        ],
      },
      include: {
        content: {
          select: {
            id: true,
            type: true,
            slug: true,
            title: true,
            subtitle: true,
            summary: true,
            publishedAt: true,
            status: true,
            archivedAt: true,
          },
        },
      },
      orderBy: [{ slotKey: 'asc' }, { position: 'asc' }],
    });

    return rows.map((row) => {
      // 槽位本身在窗口内，但引用的内容可能已撤回 / 归档 —— 此时 content 置 null，
      // 前端按"空槽位"渲染而不是报错。
      const content =
        row.content !== null &&
        row.content.status === 'PUBLISHED' &&
        row.content.archivedAt === null
          ? {
              id: row.content.id,
              type: row.content.type,
              slug: row.content.slug,
              title: row.content.title,
              subtitle: row.content.subtitle,
              summary: row.content.summary,
              publishedAt: row.content.publishedAt,
            }
          : null;

      return {
        slotKey: row.slotKey,
        position: row.position,
        content,
      };
    });
  }

  /**
   * 后台配置槽位（upsert）。
   *
   * 校验：
   *   - slotKey 必须在受控字典内
   *   - contentId 若提供，必须存在且**已发布**（不允许把草稿挂到首页）
   *   - 时间窗必须 startsAt <= endsAt
   */
  async configureSlot(input: {
    slotKey: string;
    contentId: string | null;
    position: number;
    startsAt: string | null;
    endsAt: string | null;
    actorId: string;
    requestId: string;
  }): Promise<{ slotKey: string; position: number; contentId: string | null }> {
    if (!isHomepageSlotKey(input.slotKey)) {
      throw new ForbiddenError(`无效槽位键：${input.slotKey}`);
    }
    if (!Number.isSafeInteger(input.position) || input.position < 0 || input.position > 999) {
      throw new ForbiddenError('position 必须是 0 ~ 999 的整数');
    }

    const startsAt = input.startsAt === null ? null : new Date(input.startsAt);
    const endsAt = input.endsAt === null ? null : new Date(input.endsAt);
    if (startsAt !== null && Number.isNaN(startsAt.getTime())) {
      throw new ForbiddenError('startsAt 不是合法时间');
    }
    if (endsAt !== null && Number.isNaN(endsAt.getTime())) {
      throw new ForbiddenError('endsAt 不是合法时间');
    }
    if (startsAt !== null && endsAt !== null && startsAt.getTime() > endsAt.getTime()) {
      throw new ForbiddenError('startsAt 不能晚于 endsAt');
    }

    return prisma.$transaction(async (tx) => {
      if (input.contentId !== null) {
        const content = await tx.content.findUnique({
          where: { id: input.contentId },
          select: { id: true, status: true, archivedAt: true },
        });
        if (content === null) {
          throw new ForbiddenError('内容不存在');
        }
        if (content.status !== 'PUBLISHED' || content.archivedAt !== null) {
          // 草稿不能挂首页：否则首页会指向一个公开访问 404 的链接
          throw new ForbiddenError('只有已发布且未归档的内容才能配置到首页槽位');
        }
      }

      const row = await tx.homepageSlot.upsert({
        where: { slotKey: input.slotKey },
        create: {
          slotKey: input.slotKey,
          contentId: input.contentId,
          position: input.position,
          startsAt,
          endsAt,
          updatedBy: input.actorId,
        },
        update: {
          contentId: input.contentId,
          position: input.position,
          startsAt,
          endsAt,
          updatedBy: input.actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          requestId: input.requestId,
          action: 'homepage.configure_slot',
          entityType: 'homepage_slot',
          entityId: input.slotKey,
          afterJson: JSON.stringify({
            contentId: input.contentId,
            position: input.position,
            startsAt: startsAt?.toISOString() ?? null,
            endsAt: endsAt?.toISOString() ?? null,
          }),
        },
      });

      return {
        slotKey: row.slotKey,
        position: row.position,
        contentId: row.contentId,
      };
    });
  }

  /** 后台读取全部槽位（含未生效的），供配置界面展示。 */
  async listAllSlotsForAdmin(): Promise<
    {
      slotKey: string;
      contentId: string | null;
      contentTitle: string | null;
      position: number;
      startsAt: Date | null;
      endsAt: Date | null;
      updatedAt: Date;
    }[]
  > {
    const rows = await prisma.homepageSlot.findMany({
      include: { content: { select: { title: true } } },
      orderBy: [{ slotKey: 'asc' }, { position: 'asc' }],
    });
    return rows.map((row) => ({
      slotKey: row.slotKey,
      contentId: row.contentId,
      contentTitle: row.content?.title ?? null,
      position: row.position,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      updatedAt: row.updatedAt,
    }));
  }
}
