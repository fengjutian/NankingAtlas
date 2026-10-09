import type { UserRole } from '@/api/types';

import { USER_ROLES } from '@/api/types';

/**
 * 登录用户的展示信息缓存。
 *
 * 只缓存非敏感字段（id / email / displayName / roles），access token 由
 * `api/client.ts` 单独放在 sessionStorage。刷新页面后靠这份缓存 + `GET /auth/me`
 * 复原角色，避免在 UI 里出现"登录态已知但角色未知"的中间态。
 */

const USER_KEY = 'nanking-atlas.admin.user';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  roles: readonly UserRole[];
}

function isSessionUser(raw: unknown): raw is SessionUser {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as {
    id?: unknown;
    email?: unknown;
    displayName?: unknown;
    roles?: unknown;
  };
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.email !== 'string' ||
    typeof candidate.displayName !== 'string' ||
    !Array.isArray(candidate.roles)
  ) {
    return false;
  }
  return candidate.roles.every((role: unknown) => typeof role === 'string' && isUserRole(role));
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function readSessionUser(): SessionUser | null {
  try {
    const raw = window.sessionStorage.getItem(USER_KEY);
    if (raw === null || raw === '') {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isSessionUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSessionUser(user: SessionUser): void {
  try {
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // 存储不可用不影响本次会话（内存态仍在），下次刷新需要重新登录。
  }
}

export function clearSessionUser(): void {
  try {
    window.sessionStorage.removeItem(USER_KEY);
  } catch {
    // 同上：清不掉只是缓存残留，token 清空后仍然会回到登录页。
  }
}
