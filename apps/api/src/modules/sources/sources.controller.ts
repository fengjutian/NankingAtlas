import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { type Request } from 'express';
import { z } from 'zod';

import { SOURCE_KINDS } from '@nanking-atlas/database';

import { RelationsService } from './relations.service.js';
import { SOURCE_SORTS, SourcesService } from './sources.service.js';
import { TagsService } from './tags.service.js';
import { requireUser } from '../../common/auth/auth.guard.js';
import { RequireRoles } from '../../common/auth/roles.decorator.js';
import {
  DEFAULT_PAGE_SIZE,
  InvalidCursorError,
  MAX_KEYSET_CURSOR_LENGTH,
  MAX_PAGE_SIZE,
  decodeKeysetCursor,
  type KeysetCursorPayload,
} from '../../lib/cursor.js';

/**
 * 来源 / 标签 / 关联控制器（P1-05）。
 * 全部需要编辑角色；来源与标签是内容可追溯性的核心。
 */

const createSourceSchema = z
  .object({
    kind: z.enum(SOURCE_KINDS),
    title: z.string().min(1).max(300),
    author: z.string().max(200).nullish(),
    publisher: z.string().max(200).nullish(),
    publicationDate: z.string().date().nullish(),
    url: z.string().max(2000).nullish(),
    accessedAt: z.string().datetime().nullish(),
    citationText: z.string().max(4000).nullish(),
    verificationNote: z.string().max(2000).nullish(),
  })
  .strict();

const attachSourceSchema = z
  .object({
    sourceId: z.string().min(1),
    claimScope: z.string().min(1).max(500),
    pageReference: z.string().max(200).nullish(),
    isPrimary: z.boolean().optional(),
  })
  .strict();

const upsertTagSchema = z
  .object({ slug: z.string().min(1).max(80), displayName: z.string().min(1).max(100) })
  .strict();

/**
 * 检索关键词上限。
 *
 * 上限不只是防滥用：关键词进 `LIKE '%q%'`，过长会拖慢全表扫描；而来源库的
 * 真实用法（书名 / 篇名 / 出版社 / 作者片段）远短于这个长度。
 */
export const MAX_SOURCE_QUERY_LENGTH = 200;

const attachTagSchema = z.object({ tagSlug: z.string().min(1).max(80) }).strict();

/**
 * 来源检索查询（FD-002）。
 *
 * 全部字段白名单：未知参数一律 400 而不是被静默忽略 —— 编辑输错参数名时
 * 静默忽略会让他以为自己已经按某个条件筛选了。
 *
 * 游标在 zod 层解码成载荷：非法游标必须是 400 VALIDATION_FAILED，不能冒泡成
 * 500，也不能悄悄退化成第一页（那会让翻页静默出错）。
 */
const sourceSearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(MAX_SOURCE_QUERY_LENGTH).optional(),
    kind: z.enum(SOURCE_KINDS).optional(),
    sort: z.enum(SOURCE_SORTS).default('createdAt:desc'),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    cursor: z
      .string()
      .min(1)
      .max(MAX_KEYSET_CURSOR_LENGTH)
      .transform((raw, ctx): KeysetCursorPayload => {
        try {
          return decodeKeysetCursor(raw);
        } catch (error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              error instanceof InvalidCursorError ? `游标不合法：${error.code}` : '游标不合法',
          });
          return z.NEVER;
        }
      })
      .optional(),
  })
  .strict();

const createRelationSchema = z
  .object({
    targetContentId: z.string().min(1),
    relationType: z.string().min(1).max(40),
    directionNote: z.string().max(500).nullish(),
  })
  .strict();

@Controller('admin')
export class SourcesController {
  /** 显式 @Inject：见 auth.controller.ts 的同款说明（vitest 不产出 paramtypes）。 */
  constructor(
    @Inject(SourcesService) private readonly sources: SourcesService,
    @Inject(TagsService) private readonly tags: TagsService,
    @Inject(RelationsService) private readonly relations: RelationsService,
  ) {}

  // ---- sources ----

  /** GET /api/v1/admin/sources —— 来源库检索（FD-002）。 */
  @Get('sources')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async searchSources(@Query() rawQuery: unknown): Promise<{ data: unknown }> {
    const query = sourceSearchQuerySchema.parse(rawQuery);
    return {
      data: await this.sources.search({
        ...(query.q !== undefined ? { q: query.q } : {}),
        ...(query.kind !== undefined ? { kind: query.kind } : {}),
        sort: query.sort,
        limit: query.limit,
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      }),
    };
  }

  @Post('sources')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async createSource(@Body() rawBody: unknown, @Req() req: Request): Promise<{ data: unknown }> {
    const body = createSourceSchema.parse(rawBody);
    const user = requireUser(req);
    const created = await this.sources.create({
      kind: body.kind,
      title: body.title,
      ...(body.author !== undefined ? { author: body.author } : {}),
      ...(body.publisher !== undefined ? { publisher: body.publisher } : {}),
      ...(body.publicationDate !== undefined ? { publicationDate: body.publicationDate } : {}),
      ...(body.url !== undefined ? { url: body.url } : {}),
      ...(body.accessedAt !== undefined ? { accessedAt: body.accessedAt } : {}),
      ...(body.citationText !== undefined ? { citationText: body.citationText } : {}),
      ...(body.verificationNote !== undefined ? { verificationNote: body.verificationNote } : {}),
      actorId: user.id,
      requestId: req.requestId ?? 'unknown',
    });
    return { data: toSourceDto(created) };
  }

  @Post('contents/:id/sources')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async attachSource(
    @Param('id') contentId: string,
    @Body() rawBody: unknown,
    @Req() req: Request,
  ): Promise<{ data: { ok: true } }> {
    const body = attachSourceSchema.parse(rawBody);
    const user = requireUser(req);
    await this.sources.attachToContent({
      contentId,
      sourceId: body.sourceId,
      claimScope: body.claimScope,
      ...(body.pageReference !== undefined ? { pageReference: body.pageReference } : {}),
      ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
      actorId: user.id,
      requestId: req.requestId ?? 'unknown',
    });
    return { data: { ok: true } };
  }

  @Get('contents/:id/sources')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async listSources(@Param('id') contentId: string): Promise<{ data: unknown }> {
    const rows = await this.sources.listForContent(contentId);
    return {
      data: rows.map((row) => ({
        claimScope: row.claimScope,
        pageReference: row.pageReference,
        isPrimary: row.isPrimary,
        source: toSourceDto(row.source),
      })),
    };
  }

  // ---- tags ----

  @Post('tags')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async upsertTag(@Body() rawBody: unknown, @Req() req: Request): Promise<{ data: unknown }> {
    const body = upsertTagSchema.parse(rawBody);
    const user = requireUser(req);
    return {
      data: await this.tags.upsert({
        slug: body.slug,
        displayName: body.displayName,
        actorId: user.id,
        requestId: req.requestId ?? 'unknown',
      }),
    };
  }

  @Post('contents/:id/tags')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async attachTag(
    @Param('id') contentId: string,
    @Body() rawBody: unknown,
    @Req() req: Request,
  ): Promise<{ data: { ok: true } }> {
    const body = attachTagSchema.parse(rawBody);
    const user = requireUser(req);
    await this.tags.attach(contentId, body.tagSlug, user.id, req.requestId ?? 'unknown');
    return { data: { ok: true } };
  }

  @Get('contents/:id/tags')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async listTags(@Param('id') contentId: string): Promise<{ data: unknown }> {
    return { data: await this.tags.listForContent(contentId) };
  }

  // ---- relations ----

  @Post('contents/:id/relations')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async createRelation(
    @Param('id') contentId: string,
    @Body() rawBody: unknown,
    @Req() req: Request,
  ): Promise<{ data: { ok: true } }> {
    const body = createRelationSchema.parse(rawBody);
    const user = requireUser(req);
    await this.relations.create({
      sourceContentId: contentId,
      targetContentId: body.targetContentId,
      relationType: body.relationType,
      ...(body.directionNote !== undefined ? { directionNote: body.directionNote } : {}),
      actorId: user.id,
      requestId: req.requestId ?? 'unknown',
    });
    return { data: { ok: true } };
  }

  @Get('contents/:id/relations')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async listRelations(@Param('id') contentId: string): Promise<{ data: unknown }> {
    return { data: await this.relations.listForContent(contentId) };
  }
}

function toSourceDto(row: {
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
}): Record<string, unknown> {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    publicationDate: row.publicationDate?.toISOString() ?? null,
    url: row.url,
    accessedAt: row.accessedAt?.toISOString() ?? null,
    citationText: row.citationText,
    verificationNote: row.verificationNote,
  };
}
