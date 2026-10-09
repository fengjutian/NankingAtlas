import type { ContentAction, ContentStatus, UserRole } from '@/api/types';

/**
 * 状态机 / 角色 / 表单校验的前端镜像（纯逻辑，无 JSX）。
 *
 * 事实来源是服务端实现 `apps/api/src/modules/contents/content-state-machine.ts`，
 * 前端只复制同一张表用于**隐藏不该出现的按钮**；真正的拦截始终在服务端
 * （AGENTS.md §4.1：禁止只靠隐藏按钮）。
 *
 * 任何一处服务端改规则，这里必须同步；两处不一致时以服务端为准。
 */

export const ACTION_LABELS: Record<ContentAction, string> = {
  EDIT: '回到编辑',
  SUBMIT: '送审',
  APPROVE: '审核通过',
  REJECT: '退回草稿',
  PUBLISH: '发布',
  ARCHIVE: '归档',
  RESTORE: '恢复为草稿',
};

/** 状态 → 允许的动作（fail-closed：不在表里即不允许）。 */
export const ALLOWED_ACTIONS_BY_STATUS: Record<ContentStatus, readonly ContentAction[]> = {
  DRAFT: ['EDIT', 'SUBMIT', 'ARCHIVE'],
  IN_REVIEW: ['APPROVE', 'REJECT', 'ARCHIVE'],
  APPROVED: ['PUBLISH', 'REJECT', 'ARCHIVE'],
  PUBLISHED: ['ARCHIVE'],
  ARCHIVED: ['RESTORE'],
};

/** 动作 → 允许的角色。EDITOR 不得审核 / 发布 / 归档（AGENTS.md §4.2）。 */
export const ROLES_BY_ACTION: Record<ContentAction, readonly UserRole[]> = {
  EDIT: ['EDITOR', 'REVIEWER', 'ADMIN'],
  SUBMIT: ['EDITOR', 'REVIEWER', 'ADMIN'],
  APPROVE: ['REVIEWER', 'ADMIN'],
  REJECT: ['REVIEWER', 'ADMIN'],
  PUBLISH: ['REVIEWER', 'ADMIN'],
  ARCHIVE: ['REVIEWER', 'ADMIN'],
  RESTORE: ['REVIEWER', 'ADMIN'],
};

/** 服务端禁止审核类动作审自己创建的稿件。 */
const SELF_REVIEW_BLOCKED_ACTIONS: readonly ContentAction[] = ['APPROVE', 'REJECT', 'PUBLISH'];

export function actionRequiresReason(action: ContentAction): boolean {
  return action === 'REJECT';
}

export function isReviewAction(action: ContentAction): boolean {
  return SELF_REVIEW_BLOCKED_ACTIONS.includes(action);
}

export function roleCanPerform(roles: readonly UserRole[], action: ContentAction): boolean {
  const allowed = ROLES_BY_ACTION[action];
  return roles.some((role) => allowed.includes(role));
}

export interface ActionContext {
  /** 当前登录用户 id，用于镜像"不能审自己的稿"。 */
  actorId?: string | undefined;
  /** 内容作者 id（列表里是 createdById）。 */
  authorId?: string | undefined;
}

/** 当前状态 + 角色下可见的动作序列。 */
export function availableActions(
  status: ContentStatus,
  roles: readonly UserRole[],
  context: ActionContext = {},
): readonly ContentAction[] {
  const { actorId, authorId } = context;
  return ALLOWED_ACTIONS_BY_STATUS[status].filter((action) => {
    if (!roleCanPerform(roles, action)) {
      return false;
    }
    if (isReviewAction(action) && actorId !== undefined && actorId === authorId) {
      return false;
    }
    return true;
  });
}

/** 动作按钮禁用时的解释文案；可用时返回 null。 */
export function explainUnavailableAction(
  status: ContentStatus,
  roles: readonly UserRole[],
  action: ContentAction,
  context: ActionContext = {},
): string | null {
  if (ALLOWED_ACTIONS_BY_STATUS[status].includes(action)) {
    if (!roleCanPerform(roles, action)) {
      return `当前角色（${roles.join(' / ') || '无'}）无权执行「${ACTION_LABELS[action]}」`;
    }
    if (
      isReviewAction(action) &&
      context.actorId !== undefined &&
      context.actorId === context.authorId
    ) {
      return '不能审核或发布自己创建的内容';
    }
    return null;
  }
  return `状态「${statusLabel(status)}」下不允许「${ACTION_LABELS[action]}」`;
}

/** 动作前置校验。返回 null 表示通过，否则返回要展示给用户的错误文案。 */
export function validateTransition(action: ContentAction, reason: string): string | null {
  if (!actionRequiresReason(action)) {
    return null;
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return '退回必须填写理由';
  }
  if (trimmed.length > 2000) {
    return '退回理由不能超过 2000 字符';
  }
  return null;
}

const STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: '草稿',
  IN_REVIEW: '审核中',
  APPROVED: '已通过',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
};

export function statusLabel(status: ContentStatus): string {
  return STATUS_LABELS[status];
}

// ---------------------------------------------------------------------------
// 表单规则（与服务端 zod schema 对齐，用于即时提示；服务端仍是最终裁决）
// ---------------------------------------------------------------------------

export const TITLE_MAX = 200;
export const SUMMARY_MAX = 1000;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export type LengthHint = 'ok' | 'warn' | 'error';

export function titleLengthHint(title: string): LengthHint {
  if (title.trim().length === 0) {
    return 'error';
  }
  return title.length > TITLE_MAX ? 'error' : title.length > TITLE_MAX * 0.8 ? 'warn' : 'ok';
}

export function summaryLengthHint(summary: string): LengthHint {
  return summary.length > SUMMARY_MAX ? 'error' : summary.length > SUMMARY_MAX * 0.8 ? 'warn' : 'ok';
}
