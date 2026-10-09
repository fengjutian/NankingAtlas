import { type Request } from 'express';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { UnauthorizedError, extractBearer, requireUser } from './auth.guard.js';
import { ForbiddenError, assertAnyRole } from './roles.guard.js';

/**
 * 认证 / 授权纯函数单测（P1-03）。
 *
 * 说明：Nest 守卫的 `canActivate` 需要 ExecutionContext，这里测的是
 * 可独立验证的纯逻辑（Bearer 解析、角色判定、requireUser）。
 * 端到端 401/403 由 integration 测试覆盖（需要真实 Nest app + SQLite）。
 */
describe('extractBearer', () => {
  it('extracts a well-formed bearer token', () => {
    expect(extractBearer('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('is case-insensitive on the scheme', () => {
    expect(extractBearer('bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearer('BEARER abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('rejects missing / malformed headers', () => {
    expect(extractBearer(undefined)).toBeNull();
    expect(extractBearer('')).toBeNull();
    expect(extractBearer('abc.def.ghi')).toBeNull(); // no scheme
    expect(extractBearer('Bearer')).toBeNull(); // no token
    expect(extractBearer('Bearer ')).toBeNull();
    expect(extractBearer('Basic dXNlcjpwYXNz')).toBeNull();
    // 多余内容不得被误接受
    expect(extractBearer('Bearer a b')).toBeNull();
  });

  it('takes the first entry when the header is an array', () => {
    expect(extractBearer(['Bearer first', 'Bearer second'])).toBe('first');
  });

  it('rejects an empty array', () => {
    expect(extractBearer([])).toBeNull();
  });
});

describe('requireUser', () => {
  it('returns the authenticated user when present', () => {
    const req = { user: { id: 'u1', roles: ['EDITOR'] } } as unknown as Request;
    expect(requireUser(req)).toEqual({ id: 'u1', roles: ['EDITOR'] });
  });

  it('throws UnauthorizedError when unauthenticated', () => {
    const req = {} as Request;
    expect(() => requireUser(req)).toThrow(UnauthorizedError);
  });

  it('does not silently return a default user (fail-closed)', () => {
    const req = { user: undefined } as unknown as Request;
    expect(() => requireUser(req)).toThrow(/需要认证/);
  });
});

describe('assertAnyRole (RBAC)', () => {
  it('allows a role in the allowed set', () => {
    expect(() => assertAnyRole(['EDITOR'], ['EDITOR', 'ADMIN'])).not.toThrow();
  });

  it('is case-insensitive', () => {
    expect(() => assertAnyRole(['admin'], ['ADMIN'])).not.toThrow();
  });

  it('throws ForbiddenError for a role outside the set', () => {
    expect(() => assertAnyRole(['VIEWER'], ['ADMIN'])).toThrow(ForbiddenError);
  });

  it('throws for an empty role list (fail-closed)', () => {
    expect(() => assertAnyRole([], ['ADMIN'])).toThrow(ForbiddenError);
  });

  it('rejects EDITOR from admin-only operations (AGENTS.md §4.2)', () => {
    expect(() => assertAnyRole(['EDITOR'], ['ADMIN'])).toThrow(/无权执行/);
  });

  it('allows ADMIN to perform editor actions too', () => {
    expect(() => assertAnyRole(['ADMIN'], ['EDITOR', 'ADMIN'])).not.toThrow();
  });

  it('throws when the allowed set is empty (fail-closed)', () => {
    expect(() => assertAnyRole(['ADMIN'], [])).toThrow(ForbiddenError);
  });
});

describe('error codes carry no internal detail', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('UnauthorizedError has name set for the filter mapping', () => {
    const err = new UnauthorizedError('access token 已过期');
    expect(err.name).toBe('UnauthorizedError');
    expect(err.message).toBe('access token 已过期');
  });

  it('ForbiddenError has name set for the filter mapping', () => {
    const err = new ForbiddenError('当前角色无权执行该操作');
    expect(err.name).toBe('ForbiddenError');
  });
});
