import { useState } from 'react';

import type { SessionUser } from '@/features/shared/session';
import type { FormEvent } from 'react';

import { authApi, isApiAuthError, isApiError, setAccessToken } from '@/api/client';
import { Button } from '@/features/shared/Button';
import { Field } from '@/features/shared/Field';
import { writeSessionUser } from '@/features/shared/session';
import { card, dangerBanner, inputStyle, mutedText, stack } from '@/features/shared/styles';

/**
 * 登录页（P1-10）。
 *
 * 无障碍要点（AGENTS.md §6.4）：
 * - 真 `<form>` + `<label for>`，Enter 可提交；
 * - 提交中 `aria-busy` + 禁用，防重复登录；
 * - 错误用 `role="alert"`，输入框 `aria-invalid` + `aria-describedby`。
 *
 * 安全：access token 写 sessionStorage（refresh token 已在 HttpOnly Cookie 内），
 * 密码只存在组件 state，不落任何存储。
 */

export interface LoginPageProps {
  onLoggedIn: (user: SessionUser) => void;
}

export function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await authApi.login(email.trim(), password);
      setAccessToken(session.accessToken);
      writeSessionUser(session.user);
      onLoggedIn(session.user);
    } catch (cause) {
      setError(describeLoginError(cause));
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  return (
    <div style={{ ...card, ...stack, maxWidth: '28rem' }}>
      <h1 style={{ fontSize: '1.2rem', margin: 0 }}>登录管理后台</h1>
      <p style={mutedText}>
        账号由管理员分配。登录后仅能执行角色允许的操作，服务端会再次校验权限。
      </p>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        aria-busy={busy}
        style={stack}
        noValidate
      >
        <Field label="邮箱" required>
          {({ id, describedBy }) => (
            <input
              id={id}
              name="email"
              type="email"
              autoComplete="username"
              required
              aria-describedby={describedBy}
              disabled={busy}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={inputStyle}
            />
          )}
        </Field>
        <Field label="密码" required>
          {({ id, describedBy }) => (
            <input
              id={id}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-describedby={describedBy}
              disabled={busy}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={inputStyle}
            />
          )}
        </Field>

        {error === null ? null : (
          <p role="alert" style={dangerBanner}>
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          busy={busy}
          disabled={email.trim() === '' || password === ''}
        >
          {busy ? '正在登录…' : '登录'}
        </Button>
      </form>
    </div>
  );
}

/** 登录失败原因：区分"凭据错误"与"网络/服务异常"，不泄露服务端内部细节。 */
export function describeLoginError(cause: unknown): string {
  if (isApiAuthError(cause)) {
    return cause.message;
  }
  if (isApiError(cause)) {
    const apiError = cause;
    if (apiError.code === 'INVALID_CREDENTIALS') {
      return '邮箱或密码不正确';
    }
    if (apiError.code === 'ACCOUNT_DISABLED') {
      return '账号已被停用，请联系管理员';
    }
    if (apiError.status === 429) {
      return '登录尝试过于频繁，请稍后再试';
    }
    return `${apiError.message}（requestId: ${apiError.requestId}）`;
  }
  if (cause instanceof Error && cause.name === 'ApiNetworkError') {
    return '无法连接服务器，请确认 API 已启动后重试';
  }
  return '登录失败，请稍后重试';
}
