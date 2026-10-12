import { useCallback, useEffect, useRef, useState } from 'react';

import type { AuditLogEntry, AuditSearchQuery } from '@/api/types';
import type { SessionUser } from '@/features/shared/session';

import { auditApi, isApiAuthError, isApiError } from '@/api/client';
import { Button } from '@/features/shared/Button';
import { formatDateTime } from '@/features/shared/datetime';
import { Field } from '@/features/shared/Field';
import { EmptyState, ErrorState, Loading } from '@/features/shared/States';
import { card, mutedText, row, stack, tableStyle } from '@/features/shared/styles';

/**
 * 审计日志查询（FD-006）。
 *
 * 只读界面：没有任何编辑 / 删除入口，且服务端也没有对应路由 ——
 * 审计记录只增不改（AGENTS.md §5.4）。
 *
 * 敏感字段**不是**在这里隐藏的：它们在写入前就已经脱敏（服务端
 * `lib/audit-redaction.ts`）。这个界面只负责把 `[REDACTED]` 如实展示出来，
 * 并明确告诉阅读者"该字段已被服务端脱敏"，免得有人以为"这个字段没记录"。
 *
 * 状态：loading / empty / error / forbidden / success。
 * conflict：审计不可写，没有"并发冲突"这回事。
 */

export interface AuditLogPageProps {
  user: SessionUser;
  onUnauthorized: () => void;
}

interface PageState {
  status: 'loading' | 'ready' | 'error' | 'forbidden';
  items: AuditLogEntry[];
  nextCursor: string | null;
  hasMore: boolean;
  message: string | null;
  requestId: string | null;
}

const INITIAL: PageState = {
  status: 'loading',
  items: [],
  nextCursor: null,
  hasMore: false,
  message: null,
  requestId: null,
};

const PAGE_SIZE = 20;

export function AuditLogPage({ user, onUnauthorized }: AuditLogPageProps) {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [state, setState] = useState<PageState>(INITIAL);
  const [loadingMore, setLoadingMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const isAdmin = user.roles.includes('ADMIN');

  const run = useCallback(
    async (filters: AuditSearchQuery, cursor?: string, append = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!append) {
        setState((prev) => ({ ...prev, status: 'loading' }));
      }
      try {
        const page = await auditApi.list(
          { ...filters, ...(cursor === undefined ? {} : { cursor }), limit: PAGE_SIZE },
          controller.signal,
        );
        setState((prev) => ({
          status: 'ready',
          items: append ? dedupe([...prev.items, ...page.items]) : page.items,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          message: null,
          requestId: null,
        }));
      } catch (cause) {
        if (isAbortLike(cause)) {
          return;
        }
        if (isApiAuthError(cause)) {
          onUnauthorized();
          return;
        }
        setState({
          status: isApiError(cause) && cause.status === 403 ? 'forbidden' : 'error',
          items: [],
          nextCursor: null,
          hasMore: false,
          message: cause instanceof Error ? cause.message : '审计日志加载失败',
          requestId: isApiError(cause) ? cause.requestId : null,
        });
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    if (isAdmin) {
      void run({});
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [isAdmin, run]);

  function search(): void {
    const filters: AuditSearchQuery = {};
    if (action.trim() !== '') {
      filters.action = action.trim();
    }
    if (entityType.trim() !== '') {
      filters.entityType = entityType.trim();
    }
    if (entityId.trim() !== '') {
      filters.entityId = entityId.trim();
    }
    if (actorId.trim() !== '') {
      filters.actorId = actorId.trim();
    }
    // datetime-local 产出的是本地时间（无时区），要补上才能被服务端 ISO 校验接受
    if (from !== '') {
      filters.from = new Date(from).toISOString();
    }
    if (to !== '') {
      filters.to = new Date(to).toISOString();
    }
    void run(filters);
  }

  if (!isAdmin) {
    return <ErrorState title="无权访问审计日志" message="审计日志仅限管理员查看。" forbidden />;
  }

  return (
    <div style={{ ...stack, maxWidth: 'var(--app-max-content)' }}>
      <div style={row}>
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>审计日志</h1>
        <span style={mutedText}>只读追溯记录，不可修改或删除。</span>
      </div>

      <p style={mutedText}>
        敏感字段（密码、token、Cookie 等）在<strong>写入时</strong>就已被服务端替换为
        <code>[REDACTED]</code>，不是在这里隐藏的。
      </p>

      <section aria-labelledby="audit-filter-title" style={{ ...card, ...stack }}>
        <h2 id="audit-filter-title" style={{ fontSize: '1rem', margin: 0 }}>
          筛选
        </h2>

        <div style={row}>
          <Field label="动作 action">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                value={action}
                placeholder="例如 content.publish"
                onChange={(event) => setAction(event.target.value)}
                style={inputStyle}
              />
            )}
          </Field>
          <Field label="实体类型">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                value={entityType}
                placeholder="例如 content"
                onChange={(event) => setEntityType(event.target.value)}
                style={inputStyle}
              />
            )}
          </Field>
        </div>

        <div style={row}>
          <Field label="实体 ID">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
                style={inputStyle}
              />
            )}
          </Field>
          <Field label="操作人 ID">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                value={actorId}
                onChange={(event) => setActorId(event.target.value)}
                style={inputStyle}
              />
            )}
          </Field>
        </div>

        <div style={row}>
          <Field label="起始时间">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                style={inputStyle}
              />
            )}
          </Field>
          <Field label="结束时间">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="datetime-local"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                style={inputStyle}
              />
            )}
          </Field>
          <Button busy={state.status === 'loading'} onClick={search}>
            检索
          </Button>
          <Button
            onClick={() => {
              setAction('');
              setEntityType('');
              setEntityId('');
              setActorId('');
              setFrom('');
              setTo('');
              void run({});
            }}
          >
            清空条件
          </Button>
        </div>
      </section>

      <AuditList
        state={state}
        loadingMore={loadingMore}
        onLoadMore={() => {
          const cursor = state.nextCursor;
          if (cursor === null) {
            return;
          }
          setLoadingMore(true);
          void run({}, cursor, true).finally(() => {
            setLoadingMore(false);
          });
        }}
        onRetry={() => void run({})}
      />
    </div>
  );
}

function AuditList({
  state,
  loadingMore,
  onLoadMore,
  onRetry,
}: {
  state: PageState;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  if (state.status === 'loading') {
    return <Loading label="正在加载审计日志…" />;
  }

  if (state.status === 'forbidden') {
    return (
      <ErrorState
        title="无权访问审计日志"
        message={state.message ?? '审计日志仅限管理员查看。'}
        forbidden
        {...(state.requestId === null ? {} : { requestId: state.requestId })}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        title="审计日志加载失败"
        message={state.message ?? '请重试。'}
        {...(state.requestId === null ? {} : { requestId: state.requestId })}
        onRetry={onRetry}
      />
    );
  }

  if (state.items.length === 0) {
    return (
      <EmptyState
        title="没有匹配的审计记录"
        description="换个筛选条件。审计记录只增不改，检索不会改变任何数据。"
      />
    );
  }

  return (
    <div style={stack}>
      <table style={tableStyle}>
        <caption style={srOnlyCaption}>审计日志，按时间倒序</caption>
        <thead>
          <tr>
            <th scope="col">时间</th>
            <th scope="col">操作人</th>
            <th scope="col">动作</th>
            <th scope="col">实体</th>
            <th scope="col">变更前 → 变更后</th>
            <th scope="col">requestId</th>
          </tr>
        </thead>
        <tbody>
          {state.items.map((entry) => (
            <tr key={entry.id}>
              <td>{formatDateTime(entry.createdAt)}</td>
              <td>{entry.actorDisplayName ?? <span style={mutedText}>（已删除账号）</span>}</td>
              <td>
                <code>{entry.action}</code>
              </td>
              <td>
                <code>
                  {entry.entityType}:{entry.entityId}
                </code>
              </td>
              <td>
                <JsonCell label="变更前" value={entry.before} />
                <JsonCell label="变更后" value={entry.after} />
              </td>
              <td>
                {entry.requestId === null ? (
                  <span style={mutedText}>—</span>
                ) : (
                  <code>{entry.requestId}</code>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {state.hasMore ? (
        <div>
          <Button busy={loadingMore} onClick={onLoadMore}>
            加载更多
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 单个 JSON 单元格。
 *
 * 用 `<pre>` 而不是 `dangerouslySetInnerHTML`：审计里的 JSON 来自各业务模块，
 * 不能假设它没有尖括号或引号 —— 直接当文本渲染就对了（AGENTS.md §4.5）。
 * 超过 MAX_INLINE 字符就截断并说明，避免一条审计记录撑爆整张表。
 */
const MAX_INLINE = 400;

function JsonCell({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) {
    return <div style={mutedText}>{label}：—</div>;
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const truncated = text.length > MAX_INLINE;
  return (
    <details>
      <summary style={mutedText}>
        {label}（{truncated ? '已截断' : '展开'}）
      </summary>
      <pre style={preStyle}>{truncated ? `${text.slice(0, MAX_INLINE)}…` : text}</pre>
    </details>
  );
}

function dedupe(entries: AuditLogEntry[]): AuditLogEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    return true;
  });
}

function isAbortLike(cause: unknown): boolean {
  return cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'ApiAbortError');
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: '10rem',
  padding: 'var(--app-space-xs) var(--app-space-sm)',
  border: '1px solid var(--app-border)',
  borderRadius: '0.25rem',
  background: 'var(--app-bg)',
  color: 'var(--app-fg)',
  font: 'inherit',
};

const preStyle: React.CSSProperties = {
  margin: 'var(--app-space-xs) 0 0',
  padding: 'var(--app-space-xs)',
  background: 'var(--app-bg)',
  border: '1px solid var(--app-border)',
  borderRadius: '0.25rem',
  fontSize: '0.75rem',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  maxHeight: '16rem',
  overflow: 'auto',
};

const srOnlyCaption: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
