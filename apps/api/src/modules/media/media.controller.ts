import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import { type Request } from 'express';
import { z } from 'zod';

import { MEDIA_RIGHTS_STATUSES } from '@nanking-atlas/database';

import { MediaService, ALLOWED_IMAGE_MIMES, MAX_UPLOAD_BYTES } from './media.service.js';
import { requireUser } from '../../common/auth/auth.guard.js';
import { RequireRoles } from '../../common/auth/roles.decorator.js';

/**
 * 媒体控制器（P1-09）。
 *
 * 技术方案 §7.3：`POST /admin/media/upload-intents` + `POST /admin/media/:id/complete`
 * §7.1：「写接口接收 Idempotency-Key 的场景：发布、上传完成确认、批量操作」
 */

const uploadIntentSchema = z
  .object({
    fileName: z.string().min(1).max(255),
    mimeType: z.enum(ALLOWED_IMAGE_MIMES),
    sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  })
  .strict();

const completeSchema = z
  .object({
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
    altText: z.string().min(1).max(500),
    rightsStatus: z.enum(MEDIA_RIGHTS_STATUSES),
    license: z.string().max(200).nullish(),
    creditLine: z.string().max(300).nullish(),
    creator: z.string().max(200).nullish(),
    width: z.number().int().positive().nullish(),
    height: z.number().int().positive().nullish(),
  })
  .strict();

@Controller('admin/media')
export class MediaController {
  /** 显式 @Inject：见 auth.controller.ts 的同款说明（vitest 不产出 paramtypes）。 */
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  /** POST /admin/media/upload-intents —— 签发短期上传凭证 + 占位记录。 */
  @Post('upload-intents')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async createUploadIntent(
    @Body() rawBody: unknown,
    @Req() req: Request,
  ): Promise<{ data: unknown }> {
    const body = uploadIntentSchema.parse(rawBody);
    const user = requireUser(req);
    return {
      data: await this.media.createUploadIntent({
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        uploaderId: user.id,
        requestId: req.requestId ?? 'unknown',
      }),
    };
  }

  /**
   * POST /admin/media/:id/complete —— 上传完成确认。
   *
   * 幂等：`upload_intents.status` 从 PENDING 单向变 COMPLETED，
   * 重复确认抛 400 而不是重复写库（AGENTS.md §5.3 事务一致性）。
   */
  @Post(':id/complete')
  @RequireRoles('EDITOR', 'REVIEWER', 'ADMIN')
  async complete(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Req() req: Request,
  ): Promise<{ data: unknown }> {
    const body = completeSchema.parse(rawBody);
    const user = requireUser(req);
    return {
      data: await this.media.completeUpload({
        mediaId: id,
        checksum: body.checksum,
        altText: body.altText,
        rightsStatus: body.rightsStatus,
        ...(body.license !== undefined ? { license: body.license } : {}),
        ...(body.creditLine !== undefined ? { creditLine: body.creditLine } : {}),
        ...(body.creator !== undefined ? { creator: body.creator } : {}),
        ...(body.width !== undefined ? { width: body.width } : {}),
        ...(body.height !== undefined ? { height: body.height } : {}),
        actorId: user.id,
        requestId: req.requestId ?? 'unknown',
      }),
    };
  }
}
