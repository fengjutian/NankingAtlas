import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { MEDIA_RIGHTS_STATUSES, type MediaRightsStatus } from '@nanking-atlas/database';

import { ForbiddenError } from '../../common/auth/roles.guard.js';
import { prisma } from '../../lib/prisma.js';

/**
 * 上传意图与对象确认（P1-09）。
 *
 * 技术方案 §7.3：`POST /admin/media/upload-intents` + `POST /admin/media/:id/complete`
 * §8：「浏览器只使用 API 签发的短期上传凭证；元数据入库」
 *      「上传校验 MIME、魔数、大小、尺寸、扩展名」
 *
 * 当前阶段（S3 尚未接入）：
 *   - upload-intent 在 DB 落 PENDING 记录，并返回**本地占位上传 URL**
 *   - complete 校验声明的元数据（MIME 白名单 / 大小 / 版权状态）后置 CONFIRMED
 *   - 真正对象存储接入留 P2（需 S3 凭据，属"连接外部服务"需人工批准）
 *
 * 因此本模块**不含**任何 S3 SDK 依赖，也不做网络上传。
 */

// ---------------------------------------------------------------------------
// MIME / 魔数校验
// ---------------------------------------------------------------------------

/** 允许的图片 MIME（AGENTS.md §4.5「上传必须校验内容与大小」）。 */
export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** 单文件上限 10 MiB —— 明确上限，避免超大文件打满内存。 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const MAGIC_BYTES: Record<string, readonly number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  // WebP: "RIFF" .... "WEBP"
  'image/webp': [0x52, 0x49, 0x46, 0x46],
};

const EXTENSION_BY_MIME: Record<string, readonly string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
};

/**
 * 魔数校验。
 *
 * **不能信 Content-Type** —— 客户端可任意声明。只看文件头字节。
 */
export function assertMagicBytes(mime: string, bytes: Uint8Array): void {
  const expected = MAGIC_BYTES[mime];
  if (expected === undefined) {
    throw new ForbiddenError(`不支持的 MIME 类型：${mime}`);
  }
  if (bytes.length < expected.length) {
    throw new ForbiddenError('文件内容过短，无法识别类型');
  }
  for (const [index, byte] of expected.entries()) {
    if (bytes[index] !== byte) {
      throw new ForbiddenError('文件内容与声明的 MIME 类型不符');
    }
  }
  // WebP 需要额外校验 8~11 字节是 "WEBP"
  if (mime === 'image/webp') {
    const tag = String.fromCharCode(...bytes.slice(8, 12));
    if (tag !== 'WEBP') {
      throw new ForbiddenError('文件内容不是有效的 WebP');
    }
  }
}

export function assertExtension(mime: string, fileName: string): void {
  const allowed = EXTENSION_BY_MIME[mime];
  if (allowed === undefined) {
    throw new ForbiddenError(`不支持的 MIME 类型：${mime}`);
  }
  const lower = fileName.toLowerCase();
  if (!allowed.some((ext) => lower.endsWith(ext))) {
    throw new ForbiddenError(`扩展名与 MIME 不匹配（${mime} 允许：${allowed.join(' / ')}）`);
  }
}

export function assertSize(size: number): void {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new ForbiddenError('文件大小非法');
  }
  if (size > MAX_UPLOAD_BYTES) {
    throw new ForbiddenError(`文件超过上限 ${String(MAX_UPLOAD_BYTES)} 字节`);
  }
}

export function assertRightsStatus(value: string): asserts value is MediaRightsStatus {
  if (!(MEDIA_RIGHTS_STATUSES as readonly string[]).includes(value)) {
    throw new ForbiddenError(`无效版权状态：${value}`);
  }
}

export interface UploadIntentResult {
  mediaId: string;
  uploadUrl: string;
  expiresAt: string;
}

@Injectable()
export class MediaService {
  /**
   * 创建上传意图。
   *
   * `mediaId` 与 `upload_intents.media_id` 唯一对应：先建 media（PENDING rights），
   * 再建 intent，整体在一个事务里。
   */
  async createUploadIntent(input: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploaderId: string;
    requestId: string;
  }): Promise<UploadIntentResult> {
    assertExtension(input.mimeType, input.fileName);
    assertSize(input.sizeBytes);

    const objectKey = buildObjectKey(input.mimeType);
    // 上传目标 URL：P2 接对象存储后改为 API 签发的短期预签名 URL。
    // 当前阶段返回同源占位路径，前端据此知道该往哪 PUT。
    const uploadUrl = `/api/v1/admin/media/upload-target/${encodeURIComponent(objectKey)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    return prisma.$transaction(async (tx) => {
      const media = await tx.media.create({
        data: {
          objectKey,
          mimeType: input.mimeType,
          size: input.sizeBytes,
          // 上传前 checksum / alt 都未确定；用空串占位，complete 时补齐。
          checksum: '',
          altText: '',
          rightsStatus: 'UNKNOWN',
          createdById: input.uploaderId,
        },
      });
      await tx.uploadIntent.create({
        data: {
          mediaId: media.id,
          uploaderId: input.uploaderId,
          objectKey,
          uploadUrl,
          expiresAt,
          status: 'PENDING',
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.uploaderId,
          requestId: input.requestId,
          action: 'media.upload_intent',
          entityType: 'media',
          entityId: media.id,
          afterJson: JSON.stringify({ objectKey, mimeType: input.mimeType, size: input.sizeBytes }),
        },
      });
      return { mediaId: media.id, uploadUrl, expiresAt: expiresAt.toISOString() };
    });
  }

  /**
   * 上传完成确认。
   *
   * 校验：intent 存在且未过期 + 元数据合法 + 版权状态已明确 + alt text 已填。
   * 技术方案 §5.3：「使用中的图片必须有 alt、credit line 与 rights status；
   * UNKNOWN/RESTRICTED 不得公开发布」。
   */
  async completeUpload(input: {
    mediaId: string;
    checksum: string;
    altText: string;
    rightsStatus: string;
    license?: string | null;
    creditLine?: string | null;
    creator?: string | null;
    width?: number | null;
    height?: number | null;
    actorId: string;
    requestId: string;
  }): Promise<{ id: string; rightsStatus: string; usableInPublic: boolean }> {
    assertRightsStatus(input.rightsStatus);
    if (input.altText.trim().length === 0) {
      throw new ForbiddenError('alt text 不能为空');
    }
    if (!/^[0-9a-f]{64}$/.test(input.checksum)) {
      throw new ForbiddenError('checksum 必须是 sha256 hex（64 字符）');
    }
    if (input.width !== undefined && input.width !== null && input.width <= 0) {
      throw new ForbiddenError('width 必须为正整数');
    }
    if (input.height !== undefined && input.height !== null && input.height <= 0) {
      throw new ForbiddenError('height 必须为正整数');
    }

    return prisma.$transaction(async (tx) => {
      const intent = await tx.uploadIntent.findUnique({
        where: { mediaId: input.mediaId },
      });
      if (intent === null) {
        throw new ForbiddenError('上传意图不存在或已完成');
      }
      if (intent.status !== 'PENDING') {
        throw new ForbiddenError('上传意图已处理，不可重复确认');
      }
      if (intent.expiresAt.getTime() < Date.now()) {
        throw new ForbiddenError('上传意图已过期');
      }

      const media = await tx.media.update({
        where: { id: input.mediaId },
        data: {
          checksum: input.checksum,
          altText: input.altText,
          rightsStatus: input.rightsStatus,
          license: input.license ?? null,
          creditLine: input.creditLine ?? null,
          creator: input.creator ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
        },
      });
      await tx.uploadIntent.update({
        where: { mediaId: input.mediaId },
        data: { status: 'COMPLETED' },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          requestId: input.requestId,
          action: 'media.complete',
          entityType: 'media',
          entityId: input.mediaId,
          afterJson: JSON.stringify({ rightsStatus: input.rightsStatus }),
        },
      });

      return {
        id: media.id,
        rightsStatus: media.rightsStatus,
        usableInPublic: isPubliclyUsable(media.rightsStatus),
      };
    });
  }

  /** 上传落盘的字节校验入口（P2 接真实对象存储后由上传 handler 调用）。 */
  validateBytes(mimeType: string, bytes: Uint8Array): void {
    assertMagicBytes(mimeType, bytes);
    assertSize(bytes.byteLength);
  }
}

/**
 * 是否可公开发布。
 *
 * UNKNOWN / RESTRICTED 一律不可用（技术方案 §5.3 硬约束）。
 */
export function isPubliclyUsable(rightsStatus: string): boolean {
  return rightsStatus !== 'UNKNOWN' && rightsStatus !== 'RESTRICTED';
}

/** object key：`media/<yyyy>/<mm>/<random>.<ext>`，不可预测且按年月分目录。 */
export function buildObjectKey(mimeType: string): string {
  const allowed = EXTENSION_BY_MIME[mimeType];
  const ext = allowed?.[0] ?? '.bin';
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `media/${String(year)}/${month}/${randomBytes(16).toString('hex')}${ext}`;
}

/** 供客户端做完整性校验的 sha256。 */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
