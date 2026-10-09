import { Body, Controller, Get, Inject, Param, Patch, Req } from '@nestjs/common';
import { type Request } from 'express';
import { z } from 'zod';

import { Public, RequireRoles } from '../../common/auth/roles.decorator.js';
import { requireUser } from '../../common/auth/auth.guard.js';
import { prisma } from '../../lib/prisma.js';
import { HOMEPAGE_SLOT_KEYS, HomepageService } from './homepage.service.js';

/**
 * 公开读接口与首页槽位配置（P2-01 / P2-02）。
 *
 * 技术方案 §7.2 公开接口清单里与本文件相关的：
 *   GET /homepage
 *   GET /places/:slug
 *
 * §7.3 后台接口：
 *   GET/PATCH /admin/homepage-slots
 *
 * 硬约束（§7.2）：「公开接口只返回已发布字段，不泄露内部备注、
 * 未公开来源附件、人员邮箱或审核记录。」所以公开查询一律用
 * **白名单 select**，不是 `include: true`。
 */

const slotConfigSchema = z
  .object({
    slotKey: z.enum(HOMEPAGE_SLOT_KEYS),
    contentId: z.string().min(1).nullable(),
    position: z.number().int().min(0).max(999).default(0),
    startsAt: z.string().datetime().nullable().default(null),
    endsAt: z.string().datetime().nullable().default(null),
  })
  .strict();

/**
 * 公开内容 select —— §7.2「不泄露内部备注」。
 */
const PUBLIC_CONTENT_SELECT = {
  id: true,
  type: true,
  slug: true,
  title: true,
  subtitle: true,
  summary: true,
  bodyJson: true,
  language: true,
  publishedAt: true,
} as const;

/**
 * 单条查询用：公开字段 + 可见性判定字段。
 *
 * 注意 `status` / `archivedAt` **只用于服务端判定**，
 * 绝不进入返回给客户端的 DTO（`toPublicDto` 不含它们）。
 */
const PUBLIC_DETAIL_SELECT = {
  ...PUBLIC_CONTENT_SELECT,
  status: true,
  archivedAt: true,
} as const;

/** 可见性判定用的最小字段集（不返回给客户端）。 */
@Controller()
export class PublicContentController {
  /** 显式 @Inject：vitest 的 esbuild 不产出 paramtypes（见 auth.controller.ts 说明）。 */
  constructor(@Inject(HomepageService) private readonly homepage: HomepageService) {}

  /**
   * GET /homepage —— 首页聚合。
   *
   * 返回槽位、精选、最新三部分。任一为空都返回空数组（而非 null），
   * 前端按空状态渲染而不是崩。
   */
  @Public()
  @Get('homepage')
  async getHomepage(): Promise<{ data: unknown }> {
    const [slots, latest] = await Promise.all([
      this.homepage.listActiveSlots(),
      prisma.content.findMany({
        where: { status: 'PUBLISHED', archivedAt: null },
        select: PUBLIC_CONTENT_SELECT,
        orderBy: { publishedAt: 'desc' },
        take: 12,
      }),
    ]);

    const featuredSlot = slots.find((slot) => slot.slotKey === 'featured');
    return {
      data: {
        slots,
        featured: featuredSlot?.content == null ? [] : [featuredSlot.content],
        latest: latest.map(toPublicDto),
      },
    };
  }

  /**
   * GET /places/:slug —— 地点详情。
   *
   * 坐标按精度规则暴露（AGENTS.md §3.5）：
   * `accuracy=UNKNOWN` 时不返回精确经纬度，改为返回 null +
   * `verificationStatus`，由前端显示"坐标未核验"。
   */
  @Public()
  @Get('places/:slug')
  async getPlace(@Param('slug') slug: string): Promise<{ data: unknown }> {
    // 先取 content（判定可见性），再取 place 扩展。
    // 不能只查 places —— 它没有 status / archived_at，无法判断是否公开。
    const content = await prisma.content.findUnique({
      where: { slug },
      select: PUBLIC_DETAIL_SELECT,
    });
    if (content === null || content.status !== 'PUBLISHED' || content.archivedAt !== null) {
      // 未发布/不存在统一 404，不泄露"存在但未发布"
      throw new PublicContentNotFoundError(slug);
    }

    // place 扩展表以 content_id 为主键；它只存地点专属字段，
    // 所以 content 的公开字段 + place 的扩展字段要分两次查再合并。
    const place = await prisma.place.findUnique({
      where: { contentId: content.id },
      select: {
        address: true,
        lon: true,
        lat: true,
        accuracy: true,
        verificationStatus: true,
      },
    });
    if (place === null) {
      // slug 指向非地点类型 → 公开接口不应暴露存在性
      throw new PublicContentNotFoundError(slug);
    }

    const unverified = place.accuracy === 'UNKNOWN' || place.verificationStatus !== 'VERIFIED';
    return {
      data: {
        // 基础字段来自 content（公开白名单），扩展字段来自 places 表
        ...toPublicDto(content),
        address: place.address,
        // 未核验 → 不给精确坐标（宁可少给，不可给错）
        lon: unverified ? null : place.lon,
        lat: unverified ? null : place.lat,
        accuracy: place.accuracy,
        verificationStatus: place.verificationStatus,
      },
    };
  }

  /** GET /admin/homepage-slots —— 后台查看全部槽位（含未生效）。 */
  @Get('admin/homepage-slots')
  @RequireRoles('ADMIN')
  async listSlots(): Promise<{ data: unknown }> {
    const rows = await this.homepage.listAllSlotsForAdmin();
    return {
      data: rows.map((row) => ({
        slotKey: row.slotKey,
        contentId: row.contentId,
        contentTitle: row.contentTitle,
        position: row.position,
        startsAt: row.startsAt?.toISOString() ?? null,
        endsAt: row.endsAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  /** PATCH /admin/homepage-slots —— 配置单个槽位（upsert）。 */
  @Patch('admin/homepage-slots')
  @RequireRoles('ADMIN')
  async configureSlot(@Body() rawBody: unknown, @Req() req: Request): Promise<{ data: unknown }> {
    const body = slotConfigSchema.parse(rawBody);
    const user = requireUser(req);
    const result = await this.homepage.configureSlot({
      slotKey: body.slotKey,
      contentId: body.contentId,
      position: body.position,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      actorId: user.id,
      requestId: req.requestId ?? 'unknown',
    });
    return { data: result };
  }
}

export class PublicContentNotFoundError extends Error {
  constructor(slug: string) {
    super(`published content not found: ${slug}`);
    this.name = 'PublicContentNotFoundError';
  }
}

function toPublicDto(row: {
  id: string;
  type: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  bodyJson: string;
  language: string;
  publishedAt: Date | null;
}): Record<string, unknown> {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    body: JSON.parse(row.bodyJson) as unknown,
    language: row.language,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}
