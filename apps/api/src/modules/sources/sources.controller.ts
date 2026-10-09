import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { type Request } from 'express';
import { z } from 'zod';

import { SOURCE_KINDS } from '@nanking-atlas/database';

import { RelationsService } from './relations.service.js';
import { SourcesService } from './sources.service.js';
import { TagsService } from './tags.service.js';
import { requireUser } from '../../common/auth/auth.guard.js';
import { RequireRoles } from '../../common/auth/roles.decorator.js';

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

const attachTagSchema = z.object({ tagSlug: z.string().min(1).max(80) }).strict();

const createRelationSchema = z
  .object({
    targetContentId: z.string().min(1),
    relationType: z.string().min(1).max(40),
    directionNote: z.string().max(500).nullish(),
  })
  .strict();

@Controller('admin')
export class SourcesController {
  constructor(
    private readonly sources: SourcesService,
    private readonly tags: TagsService,
    private readonly relations: RelationsService,
  ) {}

  // ---- sources ----

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