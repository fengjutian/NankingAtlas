import { useState } from 'react';

import type { AdminContentDto, ContentAction, ReadinessResult } from '@/api/types';
import type { SessionUser } from '@/features/shared/session';
import type { ActionContext } from '@/features/shared/workflow';

import { StatusBadge } from '@/features/shared/Badge';
import { Button, ButtonRow } from '@/features/shared/Button';
import { Field } from '@/features/shared/Field';
import { card, dangerBanner, inputStyle, mutedText, row, stack } from '@/features/shared/styles';
import { RevisionTimeline, type RevisionTimelineProps } from '@/features/review/RevisionTimeline';
import {
  ACTION_LABELS,
  availableActions,
  explainUnavailableAction,
  statusLabel,
  validateTransition,
} from '@/features/shared/workflow';

/**
 * 审核操作面板（P1-10）。
 *
 * 只镜像服务端状态机（apps/api content-state-machine.ts）：
 * - Editor 看不到 APPROVE / REJECT / PUBLISH / ARCHIVE / RESTORE；
 * - REJECT 必须填理由（与服务端同样的 trim / 2000 字规则）；
 * - PUBLISH 前先取 readiness，未就绪时禁用发布并逐条列出问题。
 *
 * 前端禁用只是体验优化，服务端会独立再校验一次（AGENTS.md §4.1 / §4.3）。
 */

export type ReadinessState = 'idle' | 'loading' | 'loaded' | 'error';

export interface ReviewPanelProps {
  content: AdminContentDto;
  user: SessionUser;
  readiness: ReadinessResult | null;
  readinessState: ReadinessState;
  busyAction: ContentAction | null;
  errorMessage: string | null;
  onCheckReadiness: () => void;
  onTransition: (action: ContentAction, reason?: string) => void;
  /** 版本与审核历史（FD-001）：由编辑页统一取数后传入。 */
  history: RevisionTimelineProps;
}

export function ReviewPanel({
  content,
  user,
  readiness,
  readinessState,
  busyAction,
  errorMessage,
  onCheckReadiness,
  onTransition,
  history,
}: ReviewPanelProps) {
  const [rejectReason, setRejectReason] = useState('');
  const context: ActionContext = { actorId: user.id, authorId: content.createdById };
  const actions = availableActions(content.status, user.roles, context);
  const reasonError = validateTransition('REJECT', rejectReason);
  const publishBlocked = readiness !== null && !readiness.ready;
  const needsReadinessCheck = actions.includes('PUBLISH') && readiness === null;

  return (
    <section aria-labelledby="review-panel-title" style={{ ...card, ...stack }}>
      <div style={row}>
        <h2 id="review-panel-title" style={{ fontSize: '1.05rem', margin: 0 }}>
          审核操作
        </h2>
        <StatusBadge status={content.status} />
        <span style={mutedText}>版本 W/&quot;{content.version}&quot;</span>
      </div>

      <p style={mutedText}>
        当前状态「{statusLabel(content.status)}」下，{user.roles.join(' / ')} 可见的动作：
        {actions.length === 0 ? '无' : actions.map((action) => ACTION_LABELS[action]).join(' / ')}
      </p>

      {/* REJECT 退回理由：必填，提交前本地校验，与服务端规则一致。 */}
      {actions.includes('REJECT') ? (
        <Field
          label="退回理由"
          required
          hint="写清需要补充或修改的具体内容；退回后内容回到草稿状态"
          error={rejectReason.length === 0 ? '退回必须填写理由' : reasonError}
        >
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              rows={3}
              maxLength={2000}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              style={inputStyle}
            />
          )}
        </Field>
      ) : null}

      <ButtonRow>
        {actions.map((action) => {
          const disabledReason = explainUnavailableAction(
            content.status,
            user.roles,
            action,
            context,
          );
          const reasonMissing = action === 'REJECT' && reasonError !== null;
          const publishNotReady = action === 'PUBLISH' && (needsReadinessCheck || publishBlocked);
          return (
            <Button
              key={action}
              variant={
                action === 'PUBLISH' || action === 'APPROVE'
                  ? 'primary'
                  : action === 'REJECT'
                    ? 'danger'
                    : 'default'
              }
              busy={busyAction === action}
              disabled={disabledReason !== null || reasonMissing || publishNotReady}
              title={
                disabledReason ?? (publishNotReady ? '发布前必须先通过 readiness 校验' : undefined)
              }
              onClick={() => {
                if (action === 'REJECT') {
                  onTransition(action, rejectReason);
                } else {
                  onTransition(action);
                }
              }}
            >
              {ACTION_LABELS[action]}
            </Button>
          );
        })}
      </ButtonRow>

      {actions.length === 0 ? (
        <p style={mutedText}>
          当前状态下你的角色没有可执行的动作。若这是权限问题，请联系管理员；服务端同样会拦截越权请求。
        </p>
      ) : null}

      {/* 发布前校验（readiness） */}
      <div style={stack}>
        <div style={row}>
          <h3 style={{ fontSize: '0.95rem', margin: 0 }}>发布前校验</h3>
          <Button busy={readinessState === 'loading'} onClick={onCheckReadiness}>
            重新校验
          </Button>
        </div>
        {readinessState === 'idle' ? (
          <p style={mutedText}>尚未校验。发布前必须确认来源、版权与地理信息都已核实。</p>
        ) : null}
        {readinessState === 'error' ? (
          <p role="alert" style={{ color: 'var(--app-warning-fg)' }}>
            校验请求失败，请重试；在校验通过前发布按钮保持禁用。
          </p>
        ) : null}
        {readiness !== null ? (
          readiness.issues.length === 0 ? (
            <p style={mutedText}>
              校验通过：{readiness.ready ? '满足发布条件' : '服务端判定为未就绪'}。
            </p>
          ) : (
            <ul style={{ ...stack, listStyle: 'none', padding: 0, margin: 0 }}>
              {readiness.issues.map((issue) => (
                <li key={`${issue.code}-${issue.field}`} style={dangerBanner}>
                  <code>{issue.code}</code> · {issue.message}（字段：{issue.field}）
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      {errorMessage === null ? null : (
        <p role="alert" style={dangerBanner}>
          {errorMessage}
        </p>
      )}

      {/* 版本历史（FD-001）：只读追溯，历史不可编辑或删除。 */}
      <div style={stack}>
        <h3 style={{ fontSize: '0.95rem', margin: 0 }}>版本与审核历史</h3>
        <RevisionTimeline {...history} />
      </div>
    </section>
  );
}
