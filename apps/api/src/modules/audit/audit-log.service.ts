import { Injectable } from '@nestjs/common';

import { encodeCursor, type CursorPage, type CursorPayload } from '../../lib/cursor.js';
import { prisma } from '../../lib/prisma.js';

/**
 * 审计日志查询（FD-006）。
 *
 * ## 只读
 *
 * 这个 service **只有** `search`。整个模块不提供任何 update / delete 方法，
 * 也不注册对应的路由 —— 审计记录只增不改（AGENTS.md §5.4）。
 * 「不给删除能力」比「给了但加权限」更可靠：后者可能被新的调用点绕过。
 *
 * ## 脱敏不在这一层做
 *
 * 敏感字段在**写入前**已经脱敏（见 `lib/audit-redaction.ts`）。这里只负责
 * 把 JSON 字符串解析成对象返回，避免让前端各自 `JSON.parse` 失败处理。
 */

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorDisplayName: string | null;
  requestId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AuditSearchQuery {
  actorId?: string | undefined;
  action?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  limit: number;
  cursor?: CursorPayload | undefined;
}

/** 解析库里存的 JSON；损坏时不抛错，退回原始字符串（追溯优先于整洁）。 */
function parseJsonColumn(raw: string | null): unknown {
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

@Injectable()
export class AuditLogService {
  /**
   * 按条件检索审计日志。
   *
   * 排序固定 `createdAt desc, id desc`：审计是"最近发生的事"优先，
   * 且 cuid 作为兜底键保证同毫秒的记录也有确定顺序（keyset 分页要求全序）。
   * 不提供可变排序 —— 审计界面没有"按操作人字母序排"这类需求，
   * 而可变排序会让游标必须携带排序键，徒增复杂度。
   */
  async search(query: AuditSearchQuery): Promise<CursorPage<AuditLogEntry>> {
    const filters: Record<string, unknown>[] = [];

    if (query.actorId !== undefined) {
      filters.push({ actorId: query.actorId });
    }
    if (query.action !== undefined) {
      filters.push({ action: query.action });
    }
    if (query.entityType !== undefined) {
      filters.push({ entityType: query.entityType });
    }
    if (query.entityId !== undefined) {
      filters.push({ entityId: query.entityId });
    }
    if (query.from !== undefined) {
      filters.push({ createdAt: { gte: query.from } });
    }
    if (query.to !== undefined) {
      filters.push({ createdAt: { lte: query.to } });
    }
    if (query.cursor !== undefined) {
      const createdAt = new Date(query.cursor.createdAt);
      filters.push({
        OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: query.cursor.id } }],
      });
    }

    const rows = await prisma.auditLog.findMany({
      where: filters.length === 0 ? {} : { AND: filters },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        actorId: true,
        requestId: true,
        action: true,
        entityType: true,
        entityId: true,
        beforeJson: true,
        afterJson: true,
        createdAt: true,
        actor: { select: { displayName: true } },
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        // 只给展示名，不给 email —— 审计界面不需要邮箱，给了就是多一处泄露面
        actorDisplayName: row.actor?.displayName ?? null,
        requestId: row.requestId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: parseJsonColumn(row.beforeJson),
        after: parseJsonColumn(row.afterJson),
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor:
        hasMore && last !== undefined
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
      hasMore,
    };
  }
}
