import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { type Request } from 'express';
import { z } from 'zod';

import { CONTENT_TYPES } from '@nanking-atlas/database';
import { slugSchema } from '@nanking-atlas/validation';
import { parseTiptapDocument } from '@nanking-atlas/validation';

import { ContentService, ContentNotFoundError, type ContentRecord } from './content.service.js';
import { listReviewActions, listRevisions } from './revision-history.js';
import { requireUser } from '../../common/auth/auth.guard.js';
import { RequireRoles, Public } from '../../common/auth/roles.decorator.js';
import {
  DEFAULT_PAGE_SIZE,
  InvalidCursorError,
  MAX_PAGE_SIZE,
  decodeCursor,
  type CursorPayload,
} from '../../lib/cursor.js';
import { prisma } from '../../lib/prisma.js';

import type { TypeExtension } from './content.service.js';

/** 公开内容查询：只返回 PUBLISHED 且未归档，按发布时间倒序。 */
async function listPublishedContent(input: {
  type?: string;
  limit: number;
}): Promise<ContentRecord[]> {
  const rows = await prisma.content.findMany({
    where: {
      status: 'PUBLISHED',
      archivedAt: null,
      ...(input.type !== undefined ? { type: input.type } : {}),
    },
    orderBy: { publishedAt: 'desc' },
    take: input.limit,
  });
  return rows as ContentRecord[];
}

/**
 * 后台内容管理 + 公开内容读取（技术方案 §7.3）。
 *
 * 公开读取端点用 `@Public()`，只返回 PUBLISHED 且未归档的内容；
 * 后台写端点全部需要角色。
 */

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

const typeExtensionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('PLACE'),
    address: z.string().max(300).nullish(),
    lon: z.number().min(-180).max(180).nullish(),
    lat: z.number().min(-90).max(90).nullish(),
    accuracy: z.enum(['EXACT', 'APPROXIMATE', 'AREA_ONLY', 'UNKNOWN']).optional(),
    verificationStatus: z.enum(['UNVERIFIED', 'PARTIAL', 'VERIFIED', 'DISPUTED']).optional(),
  }),
  z.object({
    kind: z.literal('PERSON'),
    birthText: z.string().max(200).nullish(),
    deathText: z.string().max(200).nullish(),
    biographyNote: z.string().max(2000).nullish(),
  }),
  z.object({
    kind: z.literal('EVENT'),
    startDate: z.string().date().nullish(),
    endDate: z.string().date().nullish(),
    datePrecision: z.enum(['YEAR', 'MONTH', 'DAY', 'UNKNOWN']).optional(),
    dateNote: z.string().max(500).nullish(),
  }),
  z.object({
    kind: z.literal('ARCHITECTURE'),
    builtPeriod: z.string().max(200).nullish(),
    currentCondition: z.string().max(1000).nullish(),
    heritageLevel: z.string().max(200).nullish(),
  }),
  z.object({
    kind: z.literal('TRADITION'),
    traditionType: z.string().min(1).max(100),
    transmissionMethod: z.string().max(1000).nullish(),
  }),
  z.object({ kind: z.literal('TOPIC'), curatorNote: z.string().max(2000).nullish() }),
  z.object({
    kind: z.literal('ROUTE'),
    durationMinutes: z.number().int().positive().max(1440).nullish(),
    distanceMeters: z.number().int().positive().nullish(),
  }),
]);

const createContentSchema = z
  .object({
    type: z.enum(CONTENT_TYPES),
    slug: slugSchema,
    title: z.string().min(1).max(200),
    subtitle: z.string().max(300).nullish(),
    summary: z.string().max(1000).nullish(),
    body: z.unknown(),
    language: z.enum(['ZH', 'EN']).optional(),
    extension: typeExtensionSchema,
  })
  .strict();

const patchContentSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    subtitle: z.string().max(300).nullish(),
    summary: z.string().max(1000).nullish(),
    body: z.unknown().optional(),
    slug: slugSchema.optional(),
    extension: typeExtensionSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: '至少提供一个要修改的字段' });

const transitionSchema = z
  .object({
    action: z.enum(['EDIT', 'SUBMIT', 'APPROVE', 'REJECT', 'PUBLISH', 'ARCHIVE', 'RESTORE']),
    reason: z.string().max(2000).optional(),
  })
  .strict();

const listQuerySchema = z.object({
  type: z.enum(CONTENT_TYPES).optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * 审核历史查询（FD-001）的 query 白名单。
 *
 * 游标在 zod 层解码：非法游标必须变成 400 VALIDATION_FAILED，**不能**让
 * CursorError 冒泡成 500，也绝不能悄悄退化成第一页（那会让翻页静默出错）。
 */
const historyQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    cursor: z
      .string()
      .min(1)
      .max(512)
      .transform((raw, ctx): CursorPayload => {
        try {
          return decodeCursor(raw);
        } catch (error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              error instanceof InvalidCursorError
                ? `游标不合法：${error.code}`
                : '游标不合法',
          });
          return z.NEVER;
        }
      })
      .optional(),
  })
  .strict();

const ifMatchPattern = /^W\/"(\d{1,9})"$/;

@Controller()
export class ContentController {
  /** 显式 @Inject：见 auth.controller.ts 的同款说明（vitest 不产出 paramtypes）。 */
  constructor(@Inject(ContentService) private readonly contents: ContentService) {}

  // -------------------------------------------------------------------------
  // 公开读取
  // -------------------------------------------------------------------------

  /** GET /api/v1/contents —— 仅返回 PUBLISHED 且未归档。 */
  @Public()
  @Get('contents')
  async listPublic(@Query() rawQuery: unknown): Promise<{ data: unknown }> {
    const query = listQuerySchema.parse(rawQuery);
    const rows = await listPublishedContent({
      ...(query.type !== undefined ? { type: query.type } : {}),
      limit: query.limit,
    });
    return { data: rows.map(toPublicDto) };
  }

  /** GET /api/v1/contents/:slug —— 公开详情。 */
  @Public()
  @Get('contents/:slug')
  async getPublicBySlug(@Param('slug') slug: string): Promise<{ data: unknown }> {
    const row = await this.contents.findBySlug(slug);
    // 草稿 / 归档 / 不存在统一按 404 处理：公开接口不泄露"内容存在但未发布"。
    if (row?.status !== 'PUBLISHED' || row.archivedAt !== null) {
      throw new ContentNotFoundError(slug);
    }
    return { data: toPublicDto(row) };
  }

  // -------------------------------------------------------------------------
  // 后台管理
  // -------------------------------------------------------------------------

  /** GET /api/v1/admin/contents —— 任意编辑角色可见。 */
  @Get('admin/contents')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async listAdmin(@Query() rawQuery: unknown): Promise<{ data: unknown }> {
    const query = listQuerySchema.parse(rawQuery);
    const rows = await prisma.content.findMany({
      where: {
        archivedAt: null,
        ...(query.type !== undefined ? { type: query.type } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: query.limit,
    });
    return { data: rows.map(toAdminDto) };
  }

  /** GET /api/v1/admin/contents/:id */
  @Get('admin/contents/:id')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async getAdmin(@Param('id') id: string): Promise<{ data: unknown }> {
    const row = await this.contents.findById(id);
    if (row === null) {
      throw new ContentNotFoundError(id);
    }
    return { data: toAdminDto(row) };
  }

  /** POST /api/v1/admin/contents —— 创建草稿。 */
  @Post('admin/contents')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async create(@Body() rawBody: unknown, @Req() req: Request): Promise<{ data: unknown }> {
    const body = createContentSchema.parse(rawBody);
    const user = requireUser(req);
    // Tiptap 白名单校验（P1-06）：拒绝 script / javascript: 等
    const parsedDoc = parseTiptapDocument(body.body);
    const created = await this.contents.create({
      type: body.type,
      slug: body.slug,
      title: body.title,
      ...(body.subtitle !== undefined ? { subtitle: body.subtitle } : {}),
      ...(body.summary !== undefined ? { summary: body.summary } : {}),
      bodyJson: JSON.stringify(parsedDoc),
      ...(body.language !== undefined ? { language: body.language } : {}),
      extension: body.extension as TypeExtension,
      actorId: user.id,
      requestId: req.requestId ?? 'unknown',
    });
    return { data: toAdminDto(created) };
  }

  /**
   * PATCH /api/v1/admin/contents/:id
   *
   * 必须带 `If-Match: W/"<version>"`；版本不一致返回 409。
   */
  @Patch('admin/contents/:id')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ): Promise<{ data: unknown }> {
    const body = patchContentSchema.parse(rawBody);
    const user = requireUser(req);
    const expectedVersion = parseIfMatch(ifMatch);

    const patch: {
      title?: string;
      subtitle?: string | null;
      summary?: string | null;
      bodyJson?: string;
      slug?: string;
    } = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.subtitle !== undefined) patch.subtitle = body.subtitle;
    if (body.summary !== undefined) patch.summary = body.summary;
    if (body.slug !== undefined) patch.slug = body.slug;
    if (body.body !== undefined) patch.bodyJson = JSON.stringify(parseTiptapDocument(body.body));

    const updated = await this.contents.update({
      id,
      expectedVersion,
      patch,
      ...(body.extension !== undefined ? { extension: body.extension as TypeExtension } : {}),
      actorId: user.id,
      actorRoles: user.roles,
      requestId: req.requestId ?? 'unknown',
    });
    return { data: toAdminDto(updated) };
  }

  /** POST /api/v1/admin/contents/:id/submit|approve|reject|publish|archive|restore */
  @Post('admin/contents/:id/transition')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async transition(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Req() req: Request,
  ): Promise<{ data: unknown }> {
    const body = transitionSchema.parse(rawBody);
    const user = requireUser(req);
    const updated = await this.contents.transition({
      id,
      action: body.action,
      actorId: user.id,
      actorRoles: user.roles,
      requestId: req.requestId ?? 'unknown',
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });
    return { data: toAdminDto(updated) };
  }

  /** GET /api/v1/admin/contents/:id/readiness —— 发布前校验预览。 */
  @Get('admin/contents/:id/readiness')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async readiness(@Param('id') id: string): Promise<{ data: unknown }> {
    const row = await this.contents.findById(id);
    if (row === null) {
      throw new ContentNotFoundError(id);
    }
    return { data: await this.contents.evaluateReadiness(row) };
  }

  /**
   * GET /api/v1/admin/contents/:id/revisions —— 版本历史（FD-001）。
   *
   * 只读：这里没有任何写入路径，也不会新增修改 / 删除端点
   * （AGENTS.md §5.4「revision 只增不改」）。
   */
  @Get('admin/contents/:id/revisions')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async listRevisions(@Param('id') id: string, @Query() rawQuery: unknown): Promise<{ data: unknown }> {
    const query = historyQuerySchema.parse(rawQuery);
    return { data: await listRevisions(id, query) };
  }

  /**
   * GET /api/v1/admin/contents/:id/review-actions —— 审核动作历史（FD-001）。
   *
   * 与 revisions 是两条独立序列：状态流转只写 review_action、不产生 revision，
   * 因此不能把两者合成一个分页，也不编造二者的对应关系。
   */
  @Get('admin/contents/:id/review-actions')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async listReviewActions(
    @Param('id') id: string,
    @Query() rawQuery: unknown,
  ): Promise<{ data: unknown }> {
    const query = historyQuerySchema.parse(rawQuery);
    return { data: await listReviewActions(id, query) };
  }
}

/** 解析 `If-Match: W/"3"` → 3；缺失或格式错抛 400。 */
function parseIfMatch(header: string | undefined): number {
  if (header === undefined || header === '') {
    throw new IfMatchRequiredError();
  }
  const match = ifMatchPattern.exec(header.trim());
  if (match?.[1] === undefined) {
    throw new IfMatchRequiredError();
  }
  const version = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new IfMatchRequiredError();
  }
  return version;
}

export class IfMatchRequiredError extends Error {
  constructor() {
    super('缺少或非法的 If-Match 头，需要 W/"<version>" 形式的乐观锁版本号');
    this.name = 'IfMatchRequiredError';
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
  publishedAt: Date | null;
  language: string;
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

function toAdminDto(row: {
  id: string;
  type: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  bodyJson: string;
  status: string;
  language: string;
  version: number;
  createdById: string;
  updatedById: string;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    body: JSON.parse(row.bodyJson) as unknown,
    status: row.status,
    language: row.language,
    version: row.version,
    createdById: row.createdById,
    updatedById: row.updatedById,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
