import { useCallback, useEffect, useRef, useState } from 'react';

import type { SessionUser } from '@/features/shared/session';

import { adminApi, isApiAuthError, isApiError } from '@/api/client';
import { USER_ROLES, type AdminUserDto, type UserRole } from '@/api/types';
import { Badge } from '@/features/shared/Badge';
import { Button, ButtonRow } from '@/features/shared/Button';
import { formatDateTime } from '@/features/shared/datetime';
import { Field } from '@/features/shared/Field';
import { EmptyState, ErrorState, Loading } from '@/features/shared/States';
import {
  card,
  dangerBanner,
  inputStyle,
  mutedText,
  row,
  stack,
  tableStyle,
} from '@/features/shared/styles';

/**
 * 用户与角色管理（FD-005）。
 *
 * 只对 ADMIN 呈现入口，但**权限判定在服务端**：直接敲 URL 或调 API 一样会被
 * 403（AGENTS.md §4.1「禁止只靠隐藏按钮」）。
 *
 * 密码规则：只在「创建」和「重置」时输入，**不回显**（输入框 type=password、
 * 提交后立即清空），也不写进任何日志或 URL。
 *
 * 状态：loading / empty / error / forbidden / success。
 * conflict：用户管理没有乐观锁（该接口不要求 If-Match，见 openapi.spec.ts 的断言），
 * 写操作是即时的服务端事务 —— 没有需要解决的"冲突"状态，硬造会误导。
 */

export interface UserManagementPageProps {
  user: SessionUser;
  onUnauthorized: () => void;
}

interface PageState {
  status: 'loading' | 'ready' | 'error' | 'forbidden';
  items: AdminUserDto[];
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

const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  ADMIN: '管理员',
  EDITOR: '编辑',
  REVIEWER: '审核',
  VIEWER: '查看',
};

const PAGE_SIZE = 20;

export function UserManagementPage({ user, onUnauthorized }: UserManagementPageProps) {
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<'enabled' | 'disabled' | ''>('');
  const [state, setState] = useState<PageState>(INITIAL);
  const [loadingMore, setLoadingMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 非管理员直接给出说明并**不请求** —— 但服务端仍会独立拦截，这里只是省一次往返。
  const isAdmin = user.roles.includes('ADMIN');

  const run = useCallback(
    async (cursor?: string, append = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!append) {
        setState((prev) => ({ ...prev, status: 'loading' }));
      }
      try {
        const trimmed = keyword.trim();
        const page = await adminApi.listUsers(
          {
            ...(trimmed === '' ? {} : { q: trimmed }),
            ...(roleFilter === '' ? {} : { role: roleFilter }),
            ...(statusFilter === '' ? {} : { status: statusFilter }),
            ...(cursor === undefined ? {} : { cursor }),
            limit: PAGE_SIZE,
          },
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
          message: cause instanceof Error ? cause.message : '用户检索失败',
          requestId: isApiError(cause) ? cause.requestId : null,
        });
      }
    },
    [keyword, onUnauthorized, roleFilter, statusFilter],
  );

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void run();
    return () => {
      abortRef.current?.abort();
    };
  }, [isAdmin, run]);

  if (!isAdmin) {
    return <ErrorState title="无权访问用户管理" message="用户与角色管理仅限管理员。" forbidden />;
  }

  return (
    <div style={{ ...stack, maxWidth: 'var(--app-max-content)' }}>
      <div style={row}>
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>用户与角色</h1>
        <span style={mutedText}>密码只在创建与重置时输入，不会回显或写入日志。</span>
      </div>

      <UserFilters
        keyword={keyword}
        roleFilter={roleFilter}
        statusFilter={statusFilter}
        busy={state.status === 'loading'}
        onKeywordChange={setKeyword}
        onRoleChange={setRoleFilter}
        onStatusChange={setStatusFilter}
        onSearch={() => void run()}
      />

      <UserList
        state={state}
        currentUserId={user.id}
        loadingMore={loadingMore}
        onLoadMore={() => {
          const cursor = state.nextCursor;
          if (cursor === null) {
            return;
          }
          setLoadingMore(true);
          void run(cursor, true).finally(() => {
            setLoadingMore(false);
          });
        }}
        onRetry={() => void run()}
        onRefresh={() => void run()}
      />

      <CreateUserForm onCreated={() => void run()} onUnauthorized={onUnauthorized} />
    </div>
  );
}

function UserFilters({
  keyword,
  roleFilter,
  statusFilter,
  busy,
  onKeywordChange,
  onRoleChange,
  onStatusChange,
  onSearch,
}: {
  keyword: string;
  roleFilter: UserRole | '';
  statusFilter: 'enabled' | 'disabled' | '';
  busy: boolean;
  onKeywordChange: (next: string) => void;
  onRoleChange: (next: UserRole | '') => void;
  onStatusChange: (next: 'enabled' | 'disabled' | '') => void;
  onSearch: () => void;
}) {
  return (
    <div style={{ ...card, ...stack }}>
      <Field label="检索用户" hint="同时匹配邮箱与显示名；留空显示全部">
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            type="search"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSearch();
              }
            }}
            style={inputStyle}
          />
        )}
      </Field>
      <div style={row}>
        <label htmlFor="user-role-filter" style={mutedText}>
          角色
        </label>
        <select
          id="user-role-filter"
          value={roleFilter}
          onChange={(event) => onRoleChange(event.target.value as UserRole | '')}
          style={selectStyle}
        >
          <option value="">全部</option>
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>

        <label htmlFor="user-status-filter" style={mutedText}>
          状态
        </label>
        <select
          id="user-status-filter"
          value={statusFilter}
          onChange={(event) => onStatusChange(event.target.value as 'enabled' | 'disabled' | '')}
          style={selectStyle}
        >
          <option value="">全部</option>
          <option value="enabled">启用中</option>
          <option value="disabled">已禁用</option>
        </select>

        <Button busy={busy} onClick={onSearch}>
          检索
        </Button>
      </div>
    </div>
  );
}

function UserList({
  state,
  currentUserId,
  loadingMore,
  onLoadMore,
  onRetry,
  onRefresh,
}: {
  state: PageState;
  currentUserId: string;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onRefresh: () => void;
}) {
  if (state.status === 'loading') {
    return <Loading label="正在加载用户列表…" />;
  }

  if (state.status === 'forbidden') {
    return (
      <ErrorState
        title="无权访问用户管理"
        message={state.message ?? '用户与角色管理仅限管理员。'}
        forbidden
        {...(state.requestId === null ? {} : { requestId: state.requestId })}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        title="用户列表加载失败"
        message={state.message ?? '请重试。'}
        {...(state.requestId === null ? {} : { requestId: state.requestId })}
        onRetry={onRetry}
      />
    );
  }

  if (state.items.length === 0) {
    return (
      <EmptyState
        title="没有匹配的用户"
        description="换个关键词或筛选条件。检索不会创建任何账号。"
      />
    );
  }

  return (
    <div style={stack}>
      <table style={tableStyle}>
        <caption style={srOnlyCaption}>用户列表</caption>
        <thead>
          <tr>
            <th scope="col">邮箱</th>
            <th scope="col">显示名</th>
            <th scope="col">角色</th>
            <th scope="col">状态</th>
            <th scope="col">禁用时间</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          {state.items.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === currentUserId}
              onChanged={onRefresh}
            />
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

function UserRow({
  user,
  isSelf,
  onChanged,
}: {
  user: AdminUserDto;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const disabled = user.disabledAt !== null;

  async function run(op: () => Promise<AdminUserDto>): Promise<void> {
    setBusy(true);
    setError(null);
    setRequestId(null);
    try {
      await op();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败');
      setRequestId(isApiError(cause) ? cause.requestId : null);
    } finally {
      setBusy(false);
    }
  }

  function toggleRole(role: UserRole): void {
    const next = user.roles.includes(role)
      ? user.roles.filter((item) => item !== role)
      : [...user.roles, role];
    // 服务端要求至少一个角色；前端先挡一道，但**服务端仍然独立校验**。
    if (next.length === 0) {
      setError('至少要保留一个角色');
      return;
    }
    void run(() => adminApi.updateUser(user.id, { roles: next }));
  }

  return (
    <tr>
      <th scope="row">
        {user.email}
        {isSelf ? <span style={mutedText}> （当前登录）</span> : null}
      </th>
      <td>{user.displayName}</td>
      <td>
        <div style={row}>
          {USER_ROLES.map((role) => (
            <Button
              key={role}
              variant={user.roles.includes(role) ? 'primary' : 'default'}
              ariaPressed={user.roles.includes(role)}
              busy={busy}
              disabled={busy}
              title={`${user.roles.includes(role) ? '移除' : '添加'}${ROLE_LABELS[role]}角色`}
              onClick={() => toggleRole(role)}
            >
              {ROLE_LABELS[role]}
            </Button>
          ))}
        </div>
      </td>
      <td>
        <Badge tone={disabled ? 'danger' : 'approved'}>{disabled ? '已禁用' : '启用中'}</Badge>
      </td>
      <td>{user.disabledAt === null ? '—' : formatDateTime(user.disabledAt)}</td>
      <td>
        <ButtonRow>
          <Button
            busy={busy}
            disabled={busy || isSelf}
            title={isSelf ? '不能禁用当前登录账号（服务端同样拦截）' : undefined}
            onClick={() => void run(() => adminApi.updateUser(user.id, { disabled: !disabled }))}
          >
            {disabled ? '启用' : '禁用'}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setResetting((prev) => !prev);
            }}
          >
            重置密码
          </Button>
        </ButtonRow>

        {resetting ? (
          <div style={stack}>
            <Field
              label="新密码"
              required
              hint="提交后立即清空；服务端不回显、不记录明文"
              error={newPassword === '' ? '新密码不能为空' : null}
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  style={inputStyle}
                />
              )}
            </Field>
            <ButtonRow>
              <Button
                busy={busy}
                disabled={busy || newPassword === ''}
                onClick={() => {
                  const password = newPassword;
                  setNewPassword('');
                  void run(() => adminApi.updateUser(user.id, { password }));
                }}
              >
                确认重置
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setNewPassword('');
                  setResetting(false);
                }}
              >
                取消
              </Button>
            </ButtonRow>
          </div>
        ) : null}

        {error === null ? null : (
          <p role="alert" style={dangerBanner}>
            {error}
            {requestId === null ? null : <span style={mutedText}> requestId: {requestId}</span>}
          </p>
        )}
      </td>
    </tr>
  );
}

function CreateUserForm({
  onCreated,
  onUnauthorized,
}: {
  onCreated: () => void;
  onUnauthorized: () => void;
}) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<UserRole[]>(['EDITOR']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const invalid =
    email.trim() === '' || displayName.trim() === '' || password === '' || roles.length === 0;

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    setRequestId(null);
    try {
      await adminApi.createUser({
        email: email.trim(),
        displayName: displayName.trim(),
        password,
        roles,
      });
      // 提交后立刻清空密码：不在内存里多留一份明文。
      setPassword('');
      setEmail('');
      setDisplayName('');
      onCreated();
    } catch (cause) {
      if (isApiAuthError(cause)) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof Error ? cause.message : '创建失败');
      setRequestId(isApiError(cause) ? cause.requestId : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="create-user-title" style={{ ...card, ...stack }}>
      <h2 id="create-user-title" style={{ fontSize: '1.05rem', margin: 0 }}>
        新建用户
      </h2>

      <Field label="邮箱" required>
        {({ id, describedBy, invalid: fieldInvalid }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={fieldInvalid}
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={inputStyle}
          />
        )}
      </Field>

      <Field label="显示名" required>
        {({ id, describedBy, invalid: fieldInvalid }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={fieldInvalid}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            style={inputStyle}
          />
        )}
      </Field>

      <Field
        label="初始密码"
        required
        hint="只提交给服务端做 Argon2id 哈希；不会回显，也不会写入审计日志"
        error={password === '' ? null : password.length < 12 ? '建议至少 12 位' : null}
      >
        {({ id, describedBy, invalid: fieldInvalid }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={fieldInvalid}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={inputStyle}
          />
        )}
      </Field>

      <div style={stack}>
        <span style={mutedText}>角色（至少一个）</span>
        <div style={row}>
          {USER_ROLES.map((role) => (
            <Button
              key={role}
              variant={roles.includes(role) ? 'primary' : 'default'}
              ariaPressed={roles.includes(role)}
              disabled={busy}
              onClick={() => {
                setRoles((prev) =>
                  prev.includes(role) ? prev.filter((item) => item !== role) : [...prev, role],
                );
              }}
            >
              {ROLE_LABELS[role]}
            </Button>
          ))}
        </div>
      </div>

      <ButtonRow>
        <Button
          variant="primary"
          busy={busy}
          disabled={busy || invalid}
          onClick={() => void submit()}
        >
          创建用户
        </Button>
      </ButtonRow>

      {error === null ? null : (
        <p role="alert" style={dangerBanner}>
          {error}
          {requestId === null ? null : <span style={mutedText}> requestId: {requestId}</span>}
        </p>
      )}
    </section>
  );
}

function dedupe(users: AdminUserDto[]): AdminUserDto[] {
  const seen = new Set<string>();
  return users.filter((user) => {
    if (seen.has(user.id)) {
      return false;
    }
    seen.add(user.id);
    return true;
  });
}

function isAbortLike(cause: unknown): boolean {
  return cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'ApiAbortError');
}

const selectStyle: React.CSSProperties = {
  padding: 'var(--app-space-xs) var(--app-space-sm)',
  border: '1px solid var(--app-border)',
  borderRadius: '0.25rem',
  background: 'var(--app-bg)',
  color: 'var(--app-fg)',
  font: 'inherit',
};

/** 表格 caption：视觉隐藏但保留给读屏（AGENTS.md §6.4）。 */
const srOnlyCaption: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
