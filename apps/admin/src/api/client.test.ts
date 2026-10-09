import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiError, ApiNetworkError } from '@/api/client';

/**
 * client 单测（P1-10）。
 *
 * 只测纯逻辑：请求头拼装、错误 code 映射、401 → refresh → 重放、abort 传参。
 * 不测 React 渲染，避免引入 testing-library 依赖（AGENTS.md §6.5）。
 *
 * `@/lib/env` 在模块加载期就会校验 `VITE_APP_ENV`，vitest 默认不注入，
 * 所以这里沿用 `lib/env.test.ts` 的做法：先写 import.meta.env 再动态 import。
 */

interface MetaLike {
  env: Record<string, string | undefined>;
}

interface ClientModule {
  API_BASE_URL: string;
  request: <T>(path: string, options?: unknown) => Promise<T>;
  requestVoid: (path: string, options?: unknown) => Promise<void>;
  authApi: { login: (email: string, password: string) => Promise<unknown> };
  ApiError: new (init: never) => ApiError;
  ApiNetworkError: new (message: string, cause?: unknown) => ApiNetworkError;
  isApiError: (value: unknown) => boolean;
  isApiAuthError: (value: unknown) => boolean;
  setAccessToken: (token: string) => void;
  clearAccessToken: () => void;
  getAccessToken: () => string | null;
}

function setImportMetaEnv(values: Record<string, string | undefined>): void {
  const meta = import.meta as unknown as MetaLike;
  Object.keys(meta.env).forEach((key) => {
    delete meta.env[key];
  });
  Object.assign(meta.env, values);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 让 fetch 每次调用都返回**新的** Response。
 *
 * `mockResolvedValue` 复用同一个 Response 实例，而 body 是只能读一次的流；
 * 第二个请求再读就抛 `读取响应体失败`。凡是同一用例里连发两次请求的
 * 都必须用这个辅助函数。
 */
function mockJson(body: unknown, status = 200): void {
  vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(body, status)));
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(
    { error: { code, message, requestId: 'req-1', ...(details === undefined ? {} : { details }) } },
    status,
  );
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.[name] ?? null;
}

let client: ClientModule;

beforeEach(async () => {
  vi.resetModules();
  setImportMetaEnv({ VITE_APP_ENV: 'test', VITE_API_BASE_URL: 'http://api.test' });
  window.sessionStorage.clear();
  client = (await import('@/api/client')) as unknown as ClientModule;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  setImportMetaEnv({});
});

describe('api client: base url', () => {
  it('uses VITE_API_BASE_URL when configured', () => {
    expect(client.API_BASE_URL).toBe('http://api.test');
  });

  it('falls back to localhost:4000 when VITE_API_BASE_URL is absent', async () => {
    vi.resetModules();
    setImportMetaEnv({ VITE_APP_ENV: 'test' });
    const fallback = (await import('@/api/client')) as unknown as ClientModule;
    expect(fallback.API_BASE_URL).toBe('http://localhost:4000');
  });
});

describe('api client: request headers', () => {
  it('prefixes /api/v1 and injects Authorization when a token exists', async () => {
    client.setAccessToken('token-abc');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: { ok: true } }));

    await client.request('/admin/contents');

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('http://api.test/api/v1/admin/contents');
    expect(headerOf(init, 'Authorization')).toBe('Bearer token-abc');
  });

  it('omits Authorization when no token is stored', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: { ok: true } }));

    await client.request('/admin/contents');

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(headerOf(init, 'Authorization')).toBeNull();
  });

  it('always sends an X-Request-Id for traceability', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: null }));

    await client.request('/auth/me');

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(headerOf(init, 'X-Request-Id')).toMatch(/[0-9a-f-]{8,}/i);
  });

  it('formats a numeric version into If-Match: W/"n"', async () => {
    client.setAccessToken('token-abc');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: { id: 'c1' } }));

    await client.request('/admin/contents/c1', {
      method: 'PATCH',
      body: { title: 'x' },
      ifMatch: 7,
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(headerOf(init, 'If-Match')).toBe('W/"7"');
  });

  it('passes an already-formatted If-Match through unchanged', async () => {
    client.setAccessToken('token-abc');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: { id: 'c1' } }));

    await client.request('/admin/contents/c1', {
      method: 'PATCH',
      body: { title: 'x' },
      ifMatch: 'W/"9"',
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(headerOf(init, 'If-Match')).toBe('W/"9"');
  });

  it('sets Content-Type only when a body is present', async () => {
    mockJson({ data: null });

    await client.request('/auth/me');
    await client.request('/admin/contents', { method: 'POST', body: { title: 'x' } });

    const first = vi.mocked(fetch).mock.calls[0]?.[1];
    const second = vi.mocked(fetch).mock.calls[1]?.[1];
    expect(headerOf(first, 'Content-Type')).toBeNull();
    expect(headerOf(second, 'Content-Type')).toBe('application/json');
    expect(second?.body).toBe(JSON.stringify({ title: 'x' }));
  });

  it('forwards Idempotency-Key when provided', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: { ok: true } }));

    await client.request('/admin/media/upload-intents', {
      method: 'POST',
      body: {},
      idempotencyKey: 'idem-1',
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(headerOf(init, 'Idempotency-Key')).toBe('idem-1');
  });

  it('passes the AbortSignal through to fetch', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: null }));

    await client.request('/admin/contents/c1', { signal: controller.signal });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(init?.signal).toBe(controller.signal);
  });
});

describe('api client: error mapping', () => {
  it('maps a server error payload onto ApiError with code / requestId / details', async () => {
    vi.mocked(fetch).mockResolvedValue(
      errorResponse(409, 'CONTENT_VERSION_CONFLICT', '内容已被他人修改', {
        currentVersion: 4,
        expectedVersion: 3,
      }),
    );

    const error = await client
      .request('/admin/contents/c1', { method: 'PATCH' })
      .catch((cause: unknown) => cause);

    expect(client.isApiError(error)).toBe(true);
    const apiError = error as ApiError;
    expect(apiError.code).toBe('CONTENT_VERSION_CONFLICT');
    expect(apiError.status).toBe(409);
    expect(apiError.requestId).toBe('req-1');
    expect(apiError.details).toEqual({ currentVersion: 4, expectedVersion: 3 });
  });

  it('falls back to a status-derived code when the body is not an error envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 403 }));

    const error = await client.request('/admin/contents').catch((cause: unknown) => cause);

    expect(client.isApiError(error)).toBe(true);
    expect((error as ApiError).code).toBe('FORBIDDEN');
    expect((error as ApiError).status).toBe(403);
  });

  it('throws ApiNetworkError when the response body is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html>oops</html>', { status: 200 }));

    const error = await client.request('/admin/contents').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(client.ApiNetworkError);
  });

  it('throws ApiNetworkError when fetch itself rejects', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await client.request('/admin/contents').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(client.ApiNetworkError);
    expect((error as ApiNetworkError).message).toContain('无法连接服务器');
  });

  it('throws an abort error when the request is cancelled', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.mocked(fetch).mockRejectedValue(abortError);

    const error = await client
      .request('/admin/contents', { signal: new AbortController().signal })
      .catch((cause: unknown) => cause);

    // abort 属于 ApiNetworkError 子类，便于统一兜底；同时可被单独识别。
    expect(error).toBeInstanceOf(client.ApiNetworkError);
    expect((error as Error).name).toBe('ApiAbortError');
  });
});

describe('api client: 401 refresh and replay', () => {
  it('refreshes once and replays the original request with the new token', async () => {
    client.setAccessToken('stale-token');
    vi.mocked(fetch)
      .mockResolvedValueOnce(errorResponse(401, 'UNAUTHORIZED', '登录已过期'))
      .mockResolvedValueOnce(
        jsonResponse({
          data: { accessToken: 'fresh-token', accessTokenExpiresAt: 'later', user: {} },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'c1' }] }));

    const data = await client.request<unknown[]>('/admin/contents');

    expect(data).toEqual([{ id: 'c1' }]);
    expect(vi.mocked(fetch).mock.calls).toHaveLength(3);
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe('http://api.test/api/v1/auth/refresh');
    const replay = vi.mocked(fetch).mock.calls[2]?.[1];
    expect(headerOf(replay, 'Authorization')).toBe('Bearer fresh-token');
    // 重放必须保留 If-Match，否则乐观锁会被绕过。
    expect(headerOf(replay, 'If-Match')).toBeNull();
  });

  it('clears the token and throws ApiAuthError when refresh also fails', async () => {
    client.setAccessToken('stale-token');
    vi.mocked(fetch)
      .mockResolvedValueOnce(errorResponse(401, 'UNAUTHORIZED', '登录已过期'))
      .mockResolvedValueOnce(errorResponse(401, 'TOKEN_REVOKED', 'refresh token 已失效'));

    const error = await client.request('/admin/contents').catch((cause: unknown) => cause);

    expect(client.isApiAuthError(error)).toBe(true);
    expect(client.getAccessToken()).toBeNull();
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
  });

  it('does not attempt refresh for anonymous login requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      errorResponse(401, 'INVALID_CREDENTIALS', '邮箱或密码不正确'),
    );

    const error = await client.authApi.login('a@b.c', 'wrong').catch((cause: unknown) => cause);

    expect(client.isApiError(error)).toBe(true);
    expect((error as ApiError).code).toBe('INVALID_CREDENTIALS');
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  });

  it('returns undefined for a 204 response without a data field', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await expect(client.requestVoid('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});

describe('api client: token storage', () => {
  it('stores the access token in sessionStorage, never localStorage', () => {
    client.setAccessToken('token-xyz');
    expect(window.sessionStorage.getItem('nanking-atlas.admin.accessToken')).toBe('token-xyz');
    expect(window.localStorage.getItem('nanking-atlas.admin.accessToken')).toBeNull();
  });

  it('clears the stored token', () => {
    client.setAccessToken('token-xyz');
    client.clearAccessToken();
    expect(client.getAccessToken()).toBeNull();
  });
});
