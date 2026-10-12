import { Controller, Get, Inject, Query } from '@nestjs/common';
import { z } from 'zod';

import { AuditLogService } from './audit-log.service.js';
import { RequireRoles } from '../../common/auth/roles.decorator.js';
import {
  DEFAULT_PAGE_SIZE,
  InvalidCursorError,
  MAX_PAGE_SIZE,
  decodeCursor,
  type CursorPayload,
} from '../../lib/cursor.js';

/**
 * 审计日志查询端点（FD-006）。
 *
 * 权限：仅 ADMIN。审计日志能看到"谁在什么时候改了什么"，属于最高敏感级别的
 * 只读数据 —— 泄露它等于把权限体系的变化史交给外人。
 *
 * 只有 GET：日志只增不改，没有 update / delete 路由（AGENTS.md §5.4）。
 *
 * 筛选参数全部白名单：审计检索经常用于"针对某个 ID 的排查"，
 * 一个拼错的参数名会让管理员以为"这条记录不存在"，那是危险的误导。
 */

/** ID / action 长度上限：够用，且防止把日志接口当数据搬运通道。 */
const MAX_IDENTIFIER_LENGTH = 200;

const auditQuerySchema = z
  .object({
    actorId: z.string().min(1).max(64).optional(),
    action: z.string().min(1).max(MAX_IDENTIFIER_LENGTH).optional(),
    entityType: z.string().min(1).max(64).optional(),
    entityId: z.string().min(1).max(64).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
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
              error instanceof InvalidCursorError ? `游标不合法：${error.code}` : '游标不合法',
          });
          return z.NEVER;
        }
      })
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      new Date(value.from).getTime() <= new Date(value.to).getTime(),
    { message: 'from 不能晚于 to', path: ['from'] },
  );

@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(@Inject(AuditLogService) private readonly auditLogs: AuditLogService) {}

  /** GET /api/v1/admin/audit-logs —— 游标分页的审计检索。 */
  @Get()
  @RequireRoles('ADMIN')
  async search(@Query() rawQuery: unknown): Promise<{ data: unknown }> {
    const query = auditQuerySchema.parse(rawQuery);
    return {
      data: await this.auditLogs.search({
        ...(query.actorId !== undefined ? { actorId: query.actorId } : {}),
        ...(query.action !== undefined ? { action: query.action } : {}),
        ...(query.entityType !== undefined ? { entityType: query.entityType } : {}),
        ...(query.entityId !== undefined ? { entityId: query.entityId } : {}),
        ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
        ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
        limit: query.limit,
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      }),
    };
  }
}
