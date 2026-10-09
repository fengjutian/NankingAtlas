import {
  CONTENT_STATUSES,
  RELATION_TYPES,
  type ContentStatus,
} from '@nanking-atlas/database';

import { ForbiddenError } from '../../common/auth/roles.guard.js';

/**
 * 内容状态机（P1-08）。
 *
 * 技术方案 §6 允许流转：
 * ```text
 * DRAFT → IN_REVIEW → APPROVED → PUBLISHED → ARCHIVED
 *           ↓              ↓
 *         DRAFT          DRAFT
 * ```
 *
 * 权限矩阵（§6 表格）：
 * | 操作         | Editor | Reviewer | Admin |
 * | 创建/编辑草稿 | 是     | 是       | 是    |
 * | 提交审核     | 是     | 是       | 是    |
 * | 审核通过/退回 | 否     | 是       | 是    |
 * | 发布/撤回/归档| 否     | 是       | 是    |
 *
 * 关键约束：
 *   - Editor **不得**审核或发布（AGENTS.md §4.2）
 *   - Reviewer 审核自己的稿件在 MVP **默认禁止**（技术方案 §6）
 *   - 状态跳转只能走这里，不能由调用方直接 set status
 */

export type ContentAction =
  | 'EDIT'
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'PUBLISH'
  | 'ARCHIVE'
  | 'RESTORE';

/** 状态 → 允许的动作。fail-closed：不在表里即不允许。 */
const ALLOWED_ACTIONS_BY_STATUS: Record<ContentStatus, readonly ContentAction[]> = {
  DRAFT: ['EDIT', 'SUBMIT', 'ARCHIVE'],
  IN_REVIEW: ['APPROVE', 'REJECT', 'ARCHIVE'],
  APPROVED: ['PUBLISH', 'REJECT', 'ARCHIVE'],
  PUBLISHED: ['ARCHIVE'],
  ARCHIVED: ['RESTORE'],
};

/** 动作 → 目标状态。 */
const TARGET_STATUS_BY_ACTION: Record<ContentAction, ContentStatus> = {
  EDIT: 'DRAFT',
  SUBMIT: 'IN_REVIEW',
  APPROVE: 'APPROVED',
  REJECT: 'DRAFT',
  PUBLISH: 'PUBLISHED',
  ARCHIVE: 'ARCHIVED',
  RESTORE: 'DRAFT',
};

/** 动作 → 允许的角色。 */
const ROLES_BY_ACTION: Record<ContentAction, readonly string[]> = {
  EDIT: ['EDITOR', 'REVIEWER', 'ADMIN'],
  SUBMIT: ['EDITOR', 'REVIEWER', 'ADMIN'],
  APPROVE: ['REVIEWER', 'ADMIN'],
  REJECT: ['REVIEWER', 'ADMIN'],
  PUBLISH: ['REVIEWER', 'ADMIN'],
  ARCHIVE: ['REVIEWER', 'ADMIN'],
  RESTORE: ['REVIEWER', 'ADMIN'],
};

export function isContentStatus(value: string): value is ContentStatus {
  return (CONTENT_STATUSES as readonly string[]).includes(value);
}

/** 该状态下允许哪些动作。 */
export function allowedActions(status: ContentStatus): readonly ContentAction[] {
  return ALLOWED_ACTIONS_BY_STATUS[status] ?? [];
}

/** 角色是否有权做这个动作（不检查资源状态）。 */
export function roleCanPerform(actorRoles: readonly string[], action: ContentAction): boolean {
  const allowed = new Set(ROLES_BY_ACTION[action].map((role) => role.toUpperCase()));
  return actorRoles.some((role) => allowed.has(role.toUpperCase()));
}

export interface TransitionRequest {
  status: ContentStatus;
  action: ContentAction;
  actorId: string;
  actorRoles: readonly string[];
  /** 内容作者 id —— 用于"不能审核自己稿件"检查。 */
  authorId: string;
  /** 退回时必填理由。 */
  reason?: string;
}

export interface TransitionDecision {
  from: ContentStatus;
  to: ContentStatus;
  action: ContentAction;
}

/**
 * 状态机唯一入口。
 *
 * 三层检查，顺序不可调换：
 *   1. 该状态是否允许此动作（状态机）
 *   2. 角色是否有权做此动作（RBAC）
 *   3. 自审禁止（Reviewer 审自己的稿）
 *
 * 任何一层不通过都抛 ForbiddenError —— 不静默降级、不自动改状态。
 */
export function decideTransition(request: TransitionRequest): TransitionDecision {
  const { status, action, actorRoles, actorId, authorId } = request;

  // 1. 状态机
  const permitted = allowedActions(status);
  if (!permitted.includes(action)) {
    throw new ForbiddenError(
      `状态 ${status} 不允许动作 ${action}（允许：${permitted.join(' / ') || '无'}）`,
    );
  }

  // 2. 角色
  if (!roleCanPerform(actorRoles, action)) {
    throw new ForbiddenError(`当前角色无权执行 ${action}`);
  }

  // 3. 自审禁止（仅对审核类动作）
  const reviewActions: readonly ContentAction[] = ['APPROVE', 'REJECT', 'PUBLISH'];
  if (reviewActions.includes(action) && actorId === authorId) {
    throw new ForbiddenError('不能审核或发布自己创建的内容');
  }

  // 退回必须给理由：技术方案 §6「审核通过/退回」+ §6 提到"退回理由"
  if (action === 'REJECT') {
    const reason = request.reason?.trim() ?? '';
    if (reason.length === 0) {
      throw new ForbiddenError('退回必须填写理由');
    }
    if (reason.length > 2000) {
      throw new ForbiddenError('退回理由不能超过 2000 字符');
    }
  }

  return { from: status, to: TARGET_STATUS_BY_ACTION[action], action };
}

// ---------------------------------------------------------------------------
// Publication readiness（P1-08）
// ---------------------------------------------------------------------------

export interface ReadinessInput {
  title: string;
  summary: string | null;
  bodyJson: string;
  slug: string;
  type: string;
  /** 是否至少有一项来源，或明确的原创/采访说明。 */
  hasSource: boolean;
  originalStatement: boolean;
  /** 图片 rights 检查结果。 */
  mediaRightsCleared: boolean;
  /** 坐标核实：accuracy=UNKNOWN 时不得有精确坐标。 */
  coordAccuracy: string | null;
  hasLonLat: boolean;
}

export interface ReadinessIssue {
  field: string;
  code: string;
  message: string;
}

export interface ReadinessResult {
  ready: boolean;
  issues: ReadinessIssue[];
}

/**
 * 发布前校验（技术方案 §5.3 + §6 `PublicationReadiness`）。
 *
 * 明确要求：任一项失败返回结构化 422，**不能通过参数跳过**。
 * 所以这里不做"部分通过"，只返回完整 issues 列表。
 */
export function checkPublicationReadiness(input: ReadinessInput): ReadinessResult {
  const issues: ReadinessIssue[] = [];

  if (input.title.trim().length === 0) {
    issues.push({ field: 'title', code: 'TITLE_REQUIRED', message: '标题不能为空' });
  }
  if (input.summary === null || input.summary.trim().length === 0) {
    issues.push({ field: 'summary', code: 'SUMMARY_REQUIRED', message: '摘要不能为空' });
  }
  if (input.bodyJson.trim().length === 0 || input.bodyJson === '{}') {
    issues.push({ field: 'bodyJson', code: 'BODY_REQUIRED', message: '正文不能为空' });
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    issues.push({
      field: 'slug',
      code: 'SLUG_INVALID',
      message: 'slug 必须是小写 ASCII、数字与单连字符',
    });
  }
  // 「至少一项来源 或 明确的原创/采访说明」二选一。
  if (!input.hasSource && !input.originalStatement) {
    issues.push({
      field: 'sources',
      code: 'SOURCE_REQUIRED',
      message: '发布前必须提供至少一项来源，或明确的原创/采访说明',
    });
  }
  if (!input.mediaRightsCleared) {
    issues.push({
      field: 'media',
      code: 'MEDIA_RIGHTS_NOT_CLEARED',
      message: '存在版权状态未澄清的图片（UNKNOWN / RESTRICTED 不得公开发布）',
    });
  }
  // 坐标规则：accuracy=UNKNOWN 时不得有精确坐标（AGENTS.md §3.5）
  if (input.hasLonLat && input.coordAccuracy === 'UNKNOWN') {
    issues.push({
      field: 'places',
      code: 'COORDINATE_UNVERIFIED',
      message: '坐标未核验（accuracy=UNKNOWN）时不得填入精确经纬度',
    });
  }

  return { ready: issues.length === 0, issues };
}

/** 关系类型白名单（技术方案 §5.3「关系类型由受控字典校验」）。 */
export function isRelationType(value: string): boolean {
  return (RELATION_TYPES as readonly string[]).includes(value);
}