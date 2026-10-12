import { useCallback, useEffect, useState } from 'react';

import { authApi, clearAccessToken, getAccessToken } from './api/client';
import { AdminShell } from './components/AdminShell';
import { AuditLogPage } from './features/audit/AuditLogPage';
import { LoginPage } from './features/auth/LoginPage';
import { ContentListPage } from './features/content/ContentListPage';
import { EditorPage } from './features/content/EditorPage';
import { navigate, useRoute } from './features/shared/router';
import { clearSessionUser, readSessionUser } from './features/shared/session';
import { EmptyState, Loading } from './features/shared/States';
import { UserManagementPage } from './features/users/UserManagementPage';

import type { SessionUser } from './features/shared/session';

/**
 * 应用外壳与路由（P1-10）。
 *
 * - `/login` 登录页（未登录时的唯一入口）
 * - `/contents` 内容列表
 * - `/contents/:id` 编辑器（`/contents/new` 为新建草稿）
 *
 * 登录态判定：sessionStorage 里的 token + 非敏感用户缓存。
 * 有 token 但缓存缺失时用 `GET /auth/me` 复核（顺带验证 refresh cookie 是否还有效）。
 */

type AuthPhase = 'checking' | 'anonymous' | 'authenticated';

export function App() {
  const route = useRoute();
  const [phase, setPhase] = useState<AuthPhase>('checking');
  const [user, setUser] = useState<SessionUser | null>(null);

  const signOut = useCallback(() => {
    clearAccessToken();
    clearSessionUser();
    setUser(null);
    setPhase('anonymous');
    navigate('/login');
  }, []);

  const bootstrap = useCallback(async () => {
    if (getAccessToken() === null) {
      setPhase('anonymous');
      setUser(null);
      return;
    }
    const cached = readSessionUser();
    if (cached !== null) {
      setUser(cached);
      setPhase('authenticated');
      return;
    }
    try {
      const me = await authApi.me();
      // `/auth/me` 只返回 id 与 roles；展示名留空，登录后刷新即可补齐。
      setUser({ id: me.id, email: '', displayName: '', roles: me.roles });
      setPhase('authenticated');
    } catch {
      clearAccessToken();
      clearSessionUser();
      setUser(null);
      setPhase('anonymous');
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (phase === 'checking') {
    return (
      <AdminShell>
        <Loading label="正在校验登录状态…" />
      </AdminShell>
    );
  }

  if (phase === 'anonymous') {
    return (
      <AdminShell>
        <LoginPage
          onLoggedIn={(loggedIn) => {
            setUser(loggedIn);
            setPhase('authenticated');
            navigate('/contents');
          }}
        />
      </AdminShell>
    );
  }

  if (user === null) {
    return (
      <AdminShell>
        <EmptyState
          title="会话异常"
          description="登录状态无法确定，请重新登录。"
          action={
            <button type="button" onClick={signOut}>
              重新登录
            </button>
          }
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      {route.name === 'contents' ? <ContentListPage user={user} onUnauthorized={signOut} /> : null}
      {route.name === 'editor' ? (
        <EditorPage
          key={route.contentId}
          contentId={route.contentId}
          user={user}
          onUnauthorized={signOut}
        />
      ) : null}
      {route.name === 'users' ? <UserManagementPage user={user} onUnauthorized={signOut} /> : null}
      {route.name === 'audit' ? <AuditLogPage user={user} onUnauthorized={signOut} /> : null}
    </AdminShell>
  );
}
