import { Injectable, Logger } from '@nestjs/common';

import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  PrismaClient,
  type ContentStatus,
  type ContentType,
} from '@nanking-atlas/database';

import {
  checkPublicationReadiness,
  decideTransition,
  isContentStatus,
  type ContentAction,
  type ReadinessIssue,
} from './content-state-machine.js';
import { ForbiddenError } from '../../common/auth/roles.guard.js';
import { prisma } from '../../lib/prisma.js';
import { revalidationPathsFor, triggerRevalidation } from '../content-revalidation/revalidation.js';

/** 会改变公开可见性的动作 —— 只有这些需要触发 revalidation。 */
const AFFECTS_PUBLIC_VISIBILITY: ReadonlySet<ContentAction> = new Set([
  'PUBLISH',
  'ARCHIVE',
  'RESTORE',
]);

/**
 * 内容服务（P1-04 CRUD + P1-07 revisions/audit + P1-08 状态机接入）。
 *
 * 事务边界（AGENTS.md §5.3）：「正文保存、状态变更、revision、
 * review action、audit log 必须在事务边界内保持一致」。
 * 所以下面每个写方法都是一个 `prisma.$transaction`，且事务内做
 * 版本检查（乐观锁）→ 业务校验 → 写主表 → 写 revision/review/audit。
 */

export interface ContentRecord {
  id: string;
  type: ContentType;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  bodyJson: string;
  status: ContentStatus;
  language: string;
  version: number;
  createdById: string;
  updatedById: string;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 类型扩展的联合；SQLite 无原生 enum，这里按 type 分派。 */
export type TypeExtension =
  | {
      kind: 'PLACE';
      address?: string | null;
      lon?: number | null;
      lat?: number | null;
      accuracy?: string;
      verificationStatus?: string;
    }
  | {
      kind: 'PERSON';
      birthText?: string | null;
      deathText?: string | null;
      biographyNote?: string | null;
    }
  | {
      kind: 'EVENT';
      startDate?: string | null;
      endDate?: string | null;
      datePrecision?: string;
      dateNote?: string | null;
    }
  | {
      kind: 'ARCHITECTURE';
      builtPeriod?: string | null;
      currentCondition?: string | null;
      heritageLevel?: string | null;
    }
  | { kind: 'TRADITION'; traditionType: string; transmissionMethod?: string | null }
  | { kind: 'TOPIC'; curatorNote?: string | null }
  | { kind: 'ROUTE'; durationMinutes?: number | null; distanceMeters?: number | null };

/**
 * Prisma 事务客户端类型.
 *
 * `$transaction(cb)` 传入的 `tx` 与 `PrismaClient` 共享全部模型方法，
 * 但 `Prisma.TransactionClient` 未从 @prisma/client 顶层导出，故用等价推导。
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** 内容类型 → 扩展表 kind 的映射；新增 ContentType 时这里必须同步。 */
const TYPE_TO_EXTENSION: Record<ContentType, TypeExtension['kind']> = {
  PLACE: 'PLACE',
  PERSON: 'PERSON',
  EVENT: 'EVENT',
  ARCHITECTURE: 'ARCHITECTURE',
  TRADITION: 'TRADITION',
  TOPIC: 'TOPIC',
  ROUTE: 'ROUTE',
};

/** 坐标范围校验（技术方案 §5.3「geom 经纬度范围必须有效」）。 */
export function assertCoordinateRange(lon: number | null, lat: number | null): void {
  if (lon === null && lat === null) {
    return;
  }
  if (lon === null || lat === null) {
    throw new ForbiddenError('经纬度必须同时填写或同时留空');
  }
  if (lon < -180 || lon > 180) {
    throw new ForbiddenError('经度必须在 -180 ~ 180 之间');
  }
  if (lat < -90 || lat > 90) {
    throw new ForbiddenError('纬度必须在 -90 ~ 90 之间');
  }
}

@Injectable()
export class ContentService {
  /** revalidation 失败只记日志，不影响发布（技术方案 §9.1）。 */
  private readonly logger = new Logger(ContentService.name);

  /**
   * 创建内容。
   *
   * 同事务：写 contents → 写类型扩展表 → 写 revision(v1) → 写 audit。
   */
  async create(input: {
    type: ContentType;
    slug: string;
    title: string;
    subtitle?: string | null;
    summary?: string | null;
    bodyJson: string;
    language?: string;
    extension: TypeExtension;
    actorId: string;
    requestId: string;
  }): Promise<ContentRecord> {
    const expectedKind = TYPE_TO_EXTENSION[input.type];
    if (input.extension.kind !== expectedKind) {
      throw new ForbiddenError(
        `内容类型 ${input.type} 需要 ${expectedKind} 扩展，实际收到 ${input.extension.kind}`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const created = await tx.content.create({
        data: {
          type: input.type,
          slug: input.slug,
          title: input.title,
          subtitle: input.subtitle ?? null,
          summary: input.summary ?? null,
          bodyJson: input.bodyJson,
          status: 'DRAFT',
          language: input.language ?? 'ZH',
          createdById: input.actorId,
          updatedById: input.actorId,
        },
      });

      await this.writeExtension(tx, created.id, input.type, input.extension);

      await tx.revision.create({
        data: {
          contentId: created.id,
          revisionNo: 1,
          snapshotJson: JSON.stringify({
            title: input.title,
            subtitle: input.subtitle ?? null,
            summary: input.summary ?? null,
            bodyJson: input.bodyJson,
            slug: input.slug,
            type: input.type,
          }),
          createdById: input.actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          requestId: input.requestId,
          action: 'content.create',
          entityType: 'content',
          entityId: created.id,
          afterJson: JSON.stringify({ slug: input.slug, type: input.type }),
        },
      });

      return created as ContentRecord;
    });
  }

  async findById(id: string): Promise<ContentRecord | null> {
    const row = await prisma.content.findUnique({ where: { id } });
    return row === null ? null : (row as ContentRecord);
  }

  async findBySlug(slug: string): Promise<ContentRecord | null> {
    const row = await prisma.content.findUnique({ where: { slug } });
    return row === null ? null : (row as ContentRecord);
  }

  /**
   * 更新内容（乐观锁）。
   *
   * `expectedVersion` 必须等于库里的 version，否则抛 409。
   * 绝不用"最后写入者胜"（AGENTS.md §5.5「禁止静默覆盖」）。
   */
  async update(input: {
    id: string;
    expectedVersion: number;
    patch: {
      title?: string;
      subtitle?: string | null;
      summary?: string | null;
      bodyJson?: string;
      slug?: string;
    };
    extension?: TypeExtension;
    actorId: string;
    actorRoles: readonly string[];
    requestId: string;
  }): Promise<ContentRecord> {
    const existing = await this.findById(input.id);
    if (existing === null) {
      throw new ContentNotFoundError(input.id);
    }

    // 只有 DRAFT 可编辑（状态机 EDIT 动作）
    decideTransition({
      status: existing.status,
      action: 'EDIT',
      actorId: input.actorId,
      actorRoles: input.actorRoles,
      authorId: existing.createdById,
    });

    return prisma.$transaction(async (tx) => {
      // 事务内再查一次 version，防止 TOCTOU。
      const current = await tx.content.findUniqueOrThrow({
        where: { id: input.id },
        select: {
          version: true,
          status: true,
          createdById: true,
          bodyJson: true,
          title: true,
          summary: true,
          subtitle: true,
          slug: true,
        },
      });

      if (current.version !== input.expectedVersion) {
        throw new ContentVersionConflictError(input.id, current.version, input.expectedVersion);
      }
      if (current.status !== 'DRAFT') {
        throw new ForbiddenError(`状态 ${current.status} 不允许编辑`);
      }

      const updated = await tx.content.update({
        where: { id: input.id },
        data: {
          ...(input.patch.title !== undefined ? { title: input.patch.title } : {}),
          ...(input.patch.subtitle !== undefined ? { subtitle: input.patch.subtitle } : {}),
          ...(input.patch.summary !== undefined ? { summary: input.patch.summary } : {}),
          ...(input.patch.bodyJson !== undefined ? { bodyJson: input.patch.bodyJson } : {}),
          ...(input.patch.slug !== undefined ? { slug: input.patch.slug } : {}),
          version: { increment: 1 },
          updatedById: input.actorId,
        },
      });

      if (input.extension !== undefined) {
        await this.writeExtension(tx, input.id, updated.type as ContentType, input.extension);
      }

      await tx.revision.create({
        data: {
          contentId: input.id,
          revisionNo: current.version + 1,
          snapshotJson: JSON.stringify({
            title: input.patch.title ?? current.title,
            subtitle: input.patch.subtitle ?? current.subtitle,
            summary: input.patch.summary ?? current.summary,
            bodyJson: input.patch.bodyJson ?? current.bodyJson,
            slug: input.patch.slug ?? current.slug,
          }),
          createdById: input.actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          requestId: input.requestId,
          action: 'content.update',
          entityType: 'content',
          entityId: input.id,
          beforeJson: JSON.stringify({ version: current.version }),
          afterJson: JSON.stringify({ version: current.version + 1 }),
        },
      });

      return updated as ContentRecord;
    });
  }

  /**
   * 状态流转（submit / approve / reject / publish / archive / restore）。
   *
   * PUBLISH 额外跑 `PublicationReadiness`；失败抛 422 + 结构化 issues。
   */
  async transition(input: {
    id: string;
    action: ContentAction;
    actorId: string;
    actorRoles: readonly string[];
    requestId: string;
    reason?: string;
  }): Promise<ContentRecord> {
    const existing = await this.findById(input.id);
    if (existing === null) {
      throw new ContentNotFoundError(input.id);
    }

    const decision = decideTransition({
      status: existing.status,
      action: input.action,
      actorId: input.actorId,
      actorRoles: input.actorRoles,
      authorId: existing.createdById,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });

    if (input.action === 'PUBLISH') {
      const readiness = await this.evaluateReadiness(existing);
      if (!readiness.ready) {
        throw new PublicationNotReadyError(existing.id, readiness.issues);
      }
    }

    return prisma
      .$transaction(async (tx) => {
        const updated = await tx.content.update({
          where: { id: input.id },
          data: {
            status: decision.to,
            version: { increment: 1 },
            updatedById: input.actorId,
            ...(decision.to === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
            ...(decision.to === 'ARCHIVED' ? { archivedAt: new Date() } : {}),
            ...(decision.to === 'DRAFT' && existing.archivedAt !== null
              ? { archivedAt: null }
              : {}),
          },
        });

        await tx.reviewAction.create({
          data: {
            contentId: input.id,
            action: decision.action,
            fromStatus: decision.from,
            toStatus: decision.to,
            comment: input.reason ?? null,
            actorId: input.actorId,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            requestId: input.requestId,
            action: `content.${decision.action.toLowerCase()}`,
            entityType: 'content',
            entityId: input.id,
            beforeJson: JSON.stringify({ status: decision.from, version: existing.version }),
            afterJson: JSON.stringify({ status: decision.to, version: existing.version + 1 }),
          },
        });

        return updated as ContentRecord;
      })
      .then(async (updated) => {
        // 发布 / 撤回 / 归档成功后触发 revalidation（P2-07）。
        //
        // 关键：**在事务之外**做，且失败只记日志。技术方案 §9.1 明确
        // 「数据库发布事务不依赖 Netlify 成功」—— 把网络请求放进事务里
        // 会让站点故障拖住甚至回滚内容发布。
        if (AFFECTS_PUBLIC_VISIBILITY.has(decision.action)) {
          const result = await triggerRevalidation({
            paths: revalidationPathsFor({ slug: existing.slug, type: existing.type }),
            slug: existing.slug,
            type: existing.type,
          });
          if (!result.ok) {
            // 失败进入重试由运维处理；这里不抛，避免影响发布结果
            this.logger.warn(
              `[${input.requestId}] revalidation 失败（内容已发布，站点将靠 TTL 收敛）: ${result.reason}`,
            );
          }
        }
        return updated;
      });
  }

  /** 软删除：置 archivedAt，不物理删除（AGENTS.md §5.4）。 */
  async softDelete(id: string, actorId: string, requestId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.content.findUniqueOrThrow({
        where: { id },
        select: { archivedAt: true },
      });
      if (existing.archivedAt !== null) {
        return; // 幂等
      }
      await tx.content.update({
        where: { id },
        data: { archivedAt: new Date(), updatedById: actorId },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          requestId,
          action: 'content.soft_delete',
          entityType: 'content',
          entityId: id,
        },
      });
    });
  }

  /**
   * 发布前校验。
   *
   * 汇总：字段完整性 + 来源 + 媒体版权 + 坐标核实。
   */
  async evaluateReadiness(
    content: ContentRecord,
  ): Promise<{ ready: boolean; issues: ReadinessIssue[] }> {
    const [sourceCount, mediaRows, placeRow] = await Promise.all([
      prisma.contentSource.count({ where: { contentId: content.id } }),
      prisma.contentMedia.findMany({
        where: { contentId: content.id },
        include: { media: { select: { rightsStatus: true } } },
      }),
      prisma.place.findUnique({
        where: { contentId: content.id },
        select: { lon: true, lat: true, accuracy: true },
      }),
    ]);

    // UNKNOWN / RESTRICTED 不得公开发布（技术方案 §5.3）
    const mediaRightsCleared = mediaRows.every((row) => {
      const status = row.media.rightsStatus;
      return status !== 'UNKNOWN' && status !== 'RESTRICTED';
    });

    return checkPublicationReadiness({
      title: content.title,
      summary: content.summary,
      bodyJson: content.bodyJson,
      slug: content.slug,
      type: content.type,
      hasSource: sourceCount > 0,
      originalStatement: false, // P1-10 编辑器补"原创/采访说明"字段后接入
      mediaRightsCleared,
      coordAccuracy: placeRow?.accuracy ?? null,
      hasLonLat: placeRow?.lon !== null && placeRow?.lon !== undefined,
    });
  }

  /** 写类型扩展表（upsert，保证 content_id 主键唯一）。 */
  private async writeExtension(
    tx: PrismaTransactionClient,
    contentId: string,
    type: ContentType,
    extension: TypeExtension,
  ): Promise<void> {
    // 分派前再确认一次类型一致：调用方可能传入与 content.type 不符的扩展
    // （例如把 PERSON 的扩展写到 PLACE 上），那会静默写入错误的扩展表。
    if (TYPE_TO_EXTENSION[type] !== extension.kind) {
      throw new ForbiddenError(
        `内容类型 ${type} 需要 ${TYPE_TO_EXTENSION[type]} 扩展，实际收到 ${extension.kind}`,
      );
    }

    switch (extension.kind) {
      case 'PLACE': {
        assertCoordinateRange(extension.lon ?? null, extension.lat ?? null);
        await tx.place.upsert({
          where: { contentId },
          create: {
            contentId,
            address: extension.address ?? null,
            lon: extension.lon ?? null,
            lat: extension.lat ?? null,
            accuracy: extension.accuracy ?? 'UNKNOWN',
            verificationStatus: extension.verificationStatus ?? 'UNVERIFIED',
          },
          update: {
            ...(extension.address !== undefined ? { address: extension.address } : {}),
            ...(extension.lon !== undefined ? { lon: extension.lon } : {}),
            ...(extension.lat !== undefined ? { lat: extension.lat } : {}),
            ...(extension.accuracy !== undefined ? { accuracy: extension.accuracy } : {}),
            ...(extension.verificationStatus !== undefined
              ? { verificationStatus: extension.verificationStatus }
              : {}),
          },
        });
        return;
      }
      case 'PERSON':
        await tx.person.upsert({
          where: { contentId },
          create: {
            contentId,
            birthText: extension.birthText ?? null,
            deathText: extension.deathText ?? null,
            biographyNote: extension.biographyNote ?? null,
          },
          update: {
            ...(extension.birthText !== undefined ? { birthText: extension.birthText } : {}),
            ...(extension.deathText !== undefined ? { deathText: extension.deathText } : {}),
            ...(extension.biographyNote !== undefined
              ? { biographyNote: extension.biographyNote }
              : {}),
          },
        });
        return;
      case 'EVENT':
        await tx.event.upsert({
          where: { contentId },
          create: {
            contentId,
            startDate: extension.startDate ? new Date(extension.startDate) : null,
            endDate: extension.endDate ? new Date(extension.endDate) : null,
            datePrecision: extension.datePrecision ?? 'UNKNOWN',
            dateNote: extension.dateNote ?? null,
          },
          update: {
            ...(extension.startDate !== undefined
              ? { startDate: extension.startDate === null ? null : new Date(extension.startDate) }
              : {}),
            ...(extension.endDate !== undefined
              ? { endDate: extension.endDate === null ? null : new Date(extension.endDate) }
              : {}),
            ...(extension.datePrecision !== undefined
              ? { datePrecision: extension.datePrecision }
              : {}),
            ...(extension.dateNote !== undefined ? { dateNote: extension.dateNote } : {}),
          },
        });
        return;
      case 'ARCHITECTURE':
        await tx.architecture.upsert({
          where: { contentId },
          create: {
            contentId,
            builtPeriod: extension.builtPeriod ?? null,
            currentCondition: extension.currentCondition ?? null,
            heritageLevel: extension.heritageLevel ?? null,
          },
          update: {
            ...(extension.builtPeriod !== undefined ? { builtPeriod: extension.builtPeriod } : {}),
            ...(extension.currentCondition !== undefined
              ? { currentCondition: extension.currentCondition }
              : {}),
            ...(extension.heritageLevel !== undefined
              ? { heritageLevel: extension.heritageLevel }
              : {}),
          },
        });
        return;
      case 'TRADITION':
        await tx.tradition.upsert({
          where: { contentId },
          create: {
            contentId,
            traditionType: extension.traditionType,
            transmissionMethod: extension.transmissionMethod ?? null,
          },
          update: {
            ...(extension.transmissionMethod !== undefined
              ? { transmissionMethod: extension.transmissionMethod }
              : {}),
          },
        });
        return;
      case 'TOPIC':
        await tx.topic.upsert({
          where: { contentId },
          create: { contentId, curatorNote: extension.curatorNote ?? null },
          update: {
            ...(extension.curatorNote !== undefined ? { curatorNote: extension.curatorNote } : {}),
          },
        });
        return;
      case 'ROUTE':
        await tx.route.upsert({
          where: { contentId },
          create: {
            contentId,
            durationMinutes: extension.durationMinutes ?? null,
            distanceMeters: extension.distanceMeters ?? null,
          },
          update: {
            ...(extension.durationMinutes !== undefined
              ? { durationMinutes: extension.durationMinutes }
              : {}),
            ...(extension.distanceMeters !== undefined
              ? { distanceMeters: extension.distanceMeters }
              : {}),
          },
        });
        return;
      default: {
        // 穷尽性检查：新增 ContentType 时这里必须同步。
        const exhaustive: never = extension;
        throw new ForbiddenError(`未处理的内容扩展类型：${JSON.stringify(exhaustive)}`);
      }
    }
  }
}

export class ContentNotFoundError extends Error {
  constructor(public readonly contentId: string) {
    super('content not found');
    this.name = 'ContentNotFoundError';
  }
}

export class ContentVersionConflictError extends Error {
  constructor(
    public readonly contentId: string,
    public readonly currentVersion: number,
    public readonly expectedVersion: number,
  ) {
    super(
      `content version conflict: expected ${String(expectedVersion)}, current ${String(currentVersion)}`,
    );
    this.name = 'ContentVersionConflictError';
  }
}

export class PublicationNotReadyError extends Error {
  constructor(
    public readonly contentId: string,
    public readonly issues: ReadinessIssue[],
  ) {
    super('publication readiness check failed');
    this.name = 'PublicationNotReadyError';
  }
}

export { CONTENT_STATUSES, CONTENT_TYPES, isContentStatus };
