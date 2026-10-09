import { Button } from './Button';
import { card, dangerBanner, mutedText, stack } from './styles';

import type { ReactNode } from 'react';

/**
 * 三个通用状态（AGENTS.md §6.4 全状态要求）。
 * forbidden 场景复用 ErrorState 并传 `forbidden`，文案区分"没权限"与"出错了"。
 */

export function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" style={{ ...card, ...mutedText }}>
      {label}
    </div>
  );
}

export interface ErrorStateProps {
  title: string;
  message: string;
  requestId?: string;
  forbidden?: boolean;
  onRetry?: () => void;
}

export function ErrorState({ title, message, requestId, forbidden = false, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" style={{ ...card, ...dangerBanner }}>
      <div style={stack}>
        <strong>{title}</strong>
        <span>{message}</span>
        {forbidden ? (
          <span style={mutedText}>当前账号角色没有执行该操作的权限；如需权限请联系管理员。</span>
        ) : null}
        {requestId === undefined ? null : (
          <span style={mutedText}>
            requestId: <code>{requestId}</code>
          </span>
        )}
        {onRetry === undefined ? null : (
          <div>
            <Button onClick={onRetry}>重试</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div role="status" style={{ ...card, ...stack }}>
      <strong>{title}</strong>
      <span style={mutedText}>{description}</span>
      {action}
    </div>
  );
}
