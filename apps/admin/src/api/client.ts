import type { RevisionPage, ReviewActionPage, SourceSearchPage } from '@nanking-atlas/api-contract';

import type {
  AdminHomepageSlot,
  AdminUserDto,
  AuditLogPage,
  AuditSearchQuery,
  CreateUserInput,
  HomepageCandidate,
  HomepageSlotConfigInput,
  PatchUserInput,
  RelationTargetItem,
  RouteStopAdminItem,
  TagWithUsage,
  UserListPage,
} from './types';
import type {
  AdminContentDto,
  AdminContentPatch,
  ApiEnvelope,
  ApiErrorPayload,
  AuthSession,
  AttachSourceInput,
  CompleteMediaInput,
  ContentAction,
  ContentRelationDto,
  ContentSourceLink,
  ContentStatus,
  ContentType,
  CreateContentInput,
  CreateRelationInput,
  CreateSourceInput,
  CreateUploadIntentInput,
  CurrentUserDto,
  MediaCompleteDto,
  ReadinessResult,
  TagDto,
  UploadIntentDto,
  UpsertTagInput,
  UserRole,
} from './types';

import { env } from '@/lib/env';

/**
 * 管理后台 HTTP 客户端（P1-10）。
 *
 * 契约（apps/api 已实现）：
 * - 前缀 `/api/v1`，base 来自 `VITE_API_BASE_URL`，缺省 `http://localhost:4000`
 * - 统一信封 `{ data }`；统一错误 `{ error: { code, message, details?, requestId } }`
 * - 除 refresh token（HttpOnly Cookie）外，所有请求带 `Authorization: Bearer <accessToken>`
 *
 * 安全取舍：
 * - access token 放 **sessionStorage**：refresh token 已在 HttpOnly Cookie 内，
 *   不再往更宽的 localStorage 写第二个长期凭据。
 * - 401 自动 refresh 一次并重放；refresh 也失败即清 token，交给 UI 跳登录页。
 * - 不在控制台打印响应体（可能含内容草稿），只用 requestId 报障。
 */

const API_PREFIX = '/api/v1';
const DEFAULT_API_BASE_URL = 'http://localhost:4000';
const ACCESS_TOKEN_KEY = 'nanking-atlas.admin.accessToken';

/**
 * 审核历史每页条数。
 *
 * 取值必须 ≤ 服务端上限（技术方案 §7.1 最大 100）。这里用小页是为了让
 * 「加载更多」真正可用 —— 版本历史通常是几十条，一次全拉会让时间线没法看。
 */
const HISTORY_PAGE_SIZE = 20;

/** base URL 兜底：env.API_BASE_URL 允许为 null（未配置时）。 */
export const API_BASE_URL = env.API_BASE_URL ?? DEFAULT_API_BASE_URL;

/** PUT 用于「整条替换」语义（如路线站点），语义上幂等。 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

/** 服务端返回的业务 / 校验错误。UI 应当按 `code` 分支，而不是解析 message。 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(init: {
    code: string;
    message: string;
    status: number;
    requestId: string;
    details?: Record<string, unknown> | undefined;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
    this.details = init.details;
  }
}

/** 认证彻底失效（refresh 也失败）：UI 应清会话并跳登录页。 */
export class ApiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiAuthError';
  }
}

/** 网络层失败：连接中断、非 JSON 响应等。 */
export class ApiNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApiNetworkError';
  }
}

/** 请求被取消（自动保存 abort 掉上一次请求时）。继承 ApiNetworkError 以便统一兜底。 */
export class ApiAbortError extends ApiNetworkError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ApiAbortError';
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function isApiAuthError(value: unknown): value is ApiAuthError {
  return value instanceof ApiAuthError;
}

export function isAbortError(value: unknown): value is ApiAbortError {
  return value instanceof ApiAbortError;
}

// ---------------------------------------------------------------------------
// token 存取
// ---------------------------------------------------------------------------

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // 隐私模式 / 被禁用存储：当作未登录，由上层提示。
    return null;
  }
}

export function getAccessToken(): string | null {
  const store = storage();
  if (store === null) {
    return null;
  }
  try {
    const value = store.getItem(ACCESS_TOKEN_KEY);
    return value === null || value === '' ? null : value;
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  storage()?.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  storage()?.removeItem(ACCESS_TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// 底层请求
// ---------------------------------------------------------------------------

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  /** 乐观锁版本号：数字或已格式化的 `W/"3"`。 */
  ifMatch?: number | string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** false 表示匿名请求（login / refresh），不附带 Authorization。 */
  auth?: boolean;
}

function formatIfMatch(version: number | string): string {
  if (typeof version === 'number') {
    return `W/"${version}"`;
  }
  return /^W\/"[^"]*"$/.test(version.trim()) ? version.trim() : `W/"${version}"`;
}

function newRequestId(): string {
  const cryptoRef: Crypto | undefined =
    typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto;
  if (cryptoRef !== undefined && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAbortLike(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}

/**
 * 读响应体。
 *
 * 非 JSON 的 body **不抛错**，而是原样返回字符串：
 * 错误响应（4xx/5xx）经常来自网关 / 代理，返回 HTML 或纯文本。
 * 那时应该由 `toApiError` 用状态码兜底出 FORBIDDEN / 503，
 * 而不是让 "不是合法 JSON" 掩盖真正的错误码。
 * 只有在**成功路径**上拿到非 JSON 才算协议错误（见 `execute`）。
 */
async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    if (isAbortLike(cause)) {
      throw new ApiAbortError('请求已取消', cause);
    }
    throw new ApiNetworkError('读取响应体失败', cause);
  }
  if (text === '') {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** 把 `{ error: {...} }` 收敛成 ApiError；形状不认识时用状态码兜底。 */
function toApiError(raw: unknown, status: number, requestId: string): ApiError {
  const payload = isApiErrorPayload(raw) ? raw : null;
  if (payload !== null) {
    return new ApiError({
      code: payload.error.code,
      message: payload.error.message,
      status,
      requestId: payload.error.requestId,
      details: payload.error.details,
    });
  }
  return new ApiError({
    code: httpStatusToCode(status),
    message: `请求失败（HTTP ${status}）`,
    status,
    requestId,
  });
}

function isApiErrorPayload(raw: unknown): raw is ApiErrorPayload {
  if (typeof raw !== 'object' || raw === null || !('error' in raw)) {
    return false;
  }
  const error = raw.error;
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; message?: unknown };
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
  }
}

/** refresh 单飞：并发 401 只发一次 refresh。 */
let refreshInFlight: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (refreshInFlight !== null) {
    return refreshInFlight;
  }
  const run = (async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': newRequestId() },
        body: '{}',
        credentials: 'include',
      });
      if (!response.ok) {
        return false;
      }
      const raw = await readBody(response);
      if (!isSessionPayload(raw)) {
        return false;
      }
      setAccessToken(raw.data.accessToken);
      return true;
    } catch {
      // 网络异常同样视为 refresh 失败：上层会清 token 跳登录页。
      return false;
    }
  })();
  refreshInFlight = run;
  try {
    return await run;
  } finally {
    refreshInFlight = null;
  }
}

function isSessionPayload(raw: unknown): raw is ApiEnvelope<AuthSession> {
  if (typeof raw !== 'object' || raw === null || !('data' in raw)) {
    return false;
  }
  const data = raw.data;
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  return typeof (data as { accessToken?: unknown }).accessToken === 'string';
}

async function execute<T>(
  path: string,
  options: RequestOptions,
  allowRefresh: boolean,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': newRequestId(),
  };

  const token = options.auth === false ? null : getAccessToken();
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.ifMatch !== undefined) {
    headers['If-Match'] = formatIfMatch(options.ifMatch);
  }
  if (options.idempotencyKey !== undefined) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    // refresh token 在 Cookie 里，必须显式带上（同源部署也安全）。
    credentials: 'include',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  if (options.signal !== undefined) {
    init.signal = options.signal;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, init);
  } catch (cause) {
    if (isAbortLike(cause)) {
      throw new ApiAbortError('请求已取消', cause);
    }
    throw new ApiNetworkError('无法连接服务器，请检查网络或 API 地址', cause);
  }

  const isAuthed = options.auth !== false;
  if (response.status === 401 && allowRefresh && isAuthed) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      return execute<T>(path, options, false);
    }
    clearAccessToken();
    throw new ApiAuthError('登录状态已失效，请重新登录');
  }

  const raw = await readBody(response);

  if (!response.ok) {
    throw toApiError(raw, response.status, newRequestId());
  }
  // 204 / 空响应体没有 data（logout 就是 204）。直接返回 undefined，
  // 不能当成"服务端响应格式错误"——否则 `requestVoid` 永远拿不到成功。
  if (response.status === 204 || raw === undefined) {
    return undefined as T;
  }
  // 成功路径上的非 JSON body 才是协议错误（错误路径已在 toApiError 兜底）。
  if (typeof raw === 'string') {
    throw new ApiNetworkError('服务端响应不是合法 JSON');
  }
  if (typeof raw !== 'object' || raw === null || !('data' in raw)) {
    throw new ApiNetworkError('服务端响应缺少 data 字段');
  }
  return (raw as ApiEnvelope<T>).data;
}

/** 统一请求入口。抛 `ApiError` / `ApiAuthError` / `ApiNetworkError` / `ApiAbortError`。 */
export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return execute<T>(path, options, true);
}

/** 204 响应（logout）走这里，避免 `undefined as T`。 */
export function requestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  return execute<null>(path, options, true).then(() => undefined);
}

// ---------------------------------------------------------------------------
// 认证端点
// ---------------------------------------------------------------------------

export const authApi = {
  login(email: string, password: string): Promise<AuthSession> {
    return request<AuthSession>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
    });
  },
  me(signal?: AbortSignal): Promise<CurrentUserDto> {
    return request<CurrentUserDto>('/auth/me', signal === undefined ? {} : { signal });
  },
  logout(): Promise<void> {
    return requestVoid('/auth/logout', { method: 'POST', body: {} });
  },
};

// ---------------------------------------------------------------------------
// 内容端点
// ---------------------------------------------------------------------------

export interface ListContentsQuery {
  type?: ContentType;
  status?: ContentStatus;
  limit?: number;
}

export const contentApi = {
  list(query: ListContentsQuery = {}, signal?: AbortSignal): Promise<AdminContentDto[]> {
    const search = new URLSearchParams();
    if (query.type !== undefined) {
      search.set('type', query.type);
    }
    if (query.status !== undefined) {
      search.set('status', query.status);
    }
    search.set('limit', String(query.limit ?? 50));
    const suffix = search.toString();
    return request<AdminContentDto[]>(
      `/admin/contents?${suffix}`,
      signal === undefined ? {} : { signal },
    );
  },
  get(id: string, signal?: AbortSignal): Promise<AdminContentDto> {
    return request<AdminContentDto>(
      `/admin/contents/${id}`,
      signal === undefined ? {} : { signal },
    );
  },
  create(input: CreateContentInput): Promise<AdminContentDto> {
    return request<AdminContentDto>('/admin/contents', { method: 'POST', body: input });
  },
  /** 必须带 If-Match；版本不一致服务端返回 409 CONTENT_VERSION_CONFLICT。 */
  update(
    id: string,
    patch: AdminContentPatch,
    version: number,
    signal?: AbortSignal,
  ): Promise<AdminContentDto> {
    const options: RequestOptions = { method: 'PATCH', body: patch, ifMatch: version };
    if (signal !== undefined) {
      options.signal = signal;
    }
    return request<AdminContentDto>(`/admin/contents/${id}`, options);
  },
  transition(id: string, action: ContentAction, reason?: string): Promise<AdminContentDto> {
    const body = reason === undefined ? { action } : { action, reason };
    return request<AdminContentDto>(`/admin/contents/${id}/transition`, { method: 'POST', body });
  },
  readiness(id: string, signal?: AbortSignal): Promise<ReadinessResult> {
    return request<ReadinessResult>(
      `/admin/contents/${id}/readiness`,
      signal === undefined ? {} : { signal },
    );
  },
  listSources(id: string, signal?: AbortSignal): Promise<ContentSourceLink[]> {
    return request<ContentSourceLink[]>(
      `/admin/contents/${id}/sources`,
      signal === undefined ? {} : { signal },
    );
  },
  /**
   * 版本历史（FD-001）。`cursor` 是服务端返回的不透明游标，原样回传。
   * 游标与 limit 都交给服务端白名单校验 —— 非法值会得到 400，不做本地兜底。
   */
  listRevisions(id: string, cursor?: string, signal?: AbortSignal): Promise<RevisionPage> {
    const search = new URLSearchParams();
    search.set('limit', String(HISTORY_PAGE_SIZE));
    if (cursor !== undefined) {
      search.set('cursor', cursor);
    }
    const options: RequestOptions = {};
    if (signal !== undefined) {
      options.signal = signal;
    }
    return request<RevisionPage>(`/admin/contents/${id}/revisions?${search.toString()}`, options);
  },
  /** 审核动作历史（FD-001）。与版本历史是两条独立序列。 */
  listReviewActions(id: string, cursor?: string, signal?: AbortSignal): Promise<ReviewActionPage> {
    const search = new URLSearchParams();
    search.set('limit', String(HISTORY_PAGE_SIZE));
    if (cursor !== undefined) {
      search.set('cursor', cursor);
    }
    const options: RequestOptions = {};
    if (signal !== undefined) {
      options.signal = signal;
    }
    return request<ReviewActionPage>(
      `/admin/contents/${id}/review-actions?${search.toString()}`,
      options,
    );
  },
  listTags(id: string, signal?: AbortSignal): Promise<TagDto[]> {
    return request<TagDto[]>(`/admin/contents/${id}/tags`, signal === undefined ? {} : { signal });
  },
  listRelations(id: string, signal?: AbortSignal): Promise<ContentRelationDto[]> {
    return request<ContentRelationDto[]>(
      `/admin/contents/${id}/relations`,
      signal === undefined ? {} : { signal },
    );
  },
};

// ---------------------------------------------------------------------------
// 来源 / 标签 / 关联 / 媒体端点
// ---------------------------------------------------------------------------

export const adminApi = {
  /** 用户检索（FD-005）。仅 ADMIN 可用；游标原样回传。 */
  listUsers(
    query: {
      q?: string;
      role?: UserRole;
      status?: 'enabled' | 'disabled';
      cursor?: string;
      limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<UserListPage> {
    const search = new URLSearchParams();
    if (query.q !== undefined) {
      search.set('q', query.q);
    }
    if (query.role !== undefined) {
      search.set('role', query.role);
    }
    if (query.status !== undefined) {
      search.set('status', query.status);
    }
    if (query.cursor !== undefined) {
      search.set('cursor', query.cursor);
    }
    if (query.limit !== undefined) {
      search.set('limit', String(query.limit));
    }
    const suffix = search.toString();
    return request<UserListPage>(
      `/admin/users${suffix === '' ? '' : `?${suffix}`}`,
      signal === undefined ? {} : { signal },
    );
  },
  createUser(input: CreateUserInput): Promise<AdminUserDto> {
    return request<AdminUserDto>('/admin/users', { method: 'POST', body: input });
  },
  /** 改角色 / 启禁 / 重置密码。服务端会拒绝"最后一个管理员"类操作。 */
  updateUser(id: string, patch: PatchUserInput): Promise<AdminUserDto> {
    return request<AdminUserDto>(`/admin/users/${id}`, { method: 'PATCH', body: patch });
  },
};

export const auditApi = {
  /** 审计日志检索（FD-006）。仅 ADMIN；游标原样回传。 */
  list(query: AuditSearchQuery, signal?: AbortSignal): Promise<AuditLogPage> {
    const search = new URLSearchParams();
    for (const key of [
      'q',
      'action',
      'entityType',
      'entityId',
      'actorId',
      'from',
      'to',
      'cursor',
      'limit',
    ] as const) {
      const value = key === 'q' ? undefined : query[key];
      if (value !== undefined) {
        search.set(key, String(value));
      }
    }
    const suffix = search.toString();
    return request<AuditLogPage>(
      `/admin/audit-logs${suffix === '' ? '' : `?${suffix}`}`,
      signal === undefined ? {} : { signal },
    );
  },
};

export const homepageApi = {
  /** 后台槽位列表（含未生效，并带状态说明）。仅 ADMIN。 */
  listSlots(signal?: AbortSignal): Promise<AdminHomepageSlot[]> {
    return request<AdminHomepageSlot[]>(
      '/admin/homepage-slots',
      signal === undefined ? {} : { signal },
    );
  },
  configureSlot(input: HomepageSlotConfigInput): Promise<{ slotKey: string; position: number }> {
    return request<{ slotKey: string; position: number }>('/admin/homepage-slots', {
      method: 'PATCH',
      body: input,
    });
  },
  /** 可挂载内容检索；服务端只返回已发布且未归档的。 */
  listCandidates(query?: { q?: string }): Promise<{ items: HomepageCandidate[] }> {
    const search = new URLSearchParams();
    if (query?.q !== undefined) {
      search.set('q', query.q);
    }
    const suffix = search.toString();
    return request<{ items: HomepageCandidate[] }>(
      `/admin/homepage-slots/candidates${suffix === '' ? '' : `?${suffix}`}`,
    );
  },
};

export const routeApi = {
  /** 路线站点（编排用）。排序按 position 升序。 */
  listStops(routeId: string, signal?: AbortSignal): Promise<{ stops: RouteStopAdminItem[] }> {
    return request<{ stops: RouteStopAdminItem[] }>(
      `/admin/routes/${routeId}/stops`,
      signal === undefined ? {} : { signal },
    );
  },
  /**
   * 整条替换站点。
   *
   * 请求体**没有 position** —— 顺序由数组下标决定，服务端负责写 position。
   * 这样「客户端自己造跳号路线」在结构上不可能。
   */
  replaceStops(
    routeId: string,
    input: { stops: { placeContentId: string; note: string | null }[] },
  ): Promise<{ stopCount: number }> {
    return request<{ stopCount: number }>(`/admin/routes/${routeId}/stops`, {
      method: 'PUT',
      body: input,
    });
  },
  /** 可作为站点的地点候选。 */
  searchPlaceCandidates(query?: { q?: string }): Promise<{ items: RelationTargetItem[] }> {
    const search = new URLSearchParams();
    if (query?.q !== undefined) {
      search.set('q', query.q);
    }
    const suffix = search.toString();
    return request<{ items: RelationTargetItem[] }>(
      `/admin/relation-targets${suffix === '' ? '' : `?${suffix}`}`,
    );
  },
};

export const libraryApi = {
  createSource(input: CreateSourceInput): Promise<unknown> {
    return request<unknown>('/admin/sources', { method: 'POST', body: input });
  },
  attachSource(contentId: string, input: AttachSourceInput): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/admin/contents/${contentId}/sources`, {
      method: 'POST',
      body: input,
    });
  },
  /**
   * 来源库检索（FD-002）。
   *
   * 游标是服务端返回的不透明串，原样回传；`sort` 必须与生成它时一致，
   * 混用服务端会返回 400 —— 这里不做本地兜底或修正。
   */
  searchSources(
    query: {
      q?: string;
      kind?: string;
      sort?: 'createdAt:desc' | 'title:asc';
      cursor?: string;
      limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<SourceSearchPage> {
    // 参数名刻意不叫 `request`：那会遮蔽同模块的 `request()` 传输函数。
    const search = new URLSearchParams();
    if (query.q !== undefined) {
      search.set('q', query.q);
    }
    if (query.kind !== undefined) {
      search.set('kind', query.kind);
    }
    if (query.sort !== undefined) {
      search.set('sort', query.sort);
    }
    if (query.limit !== undefined) {
      search.set('limit', String(query.limit));
    }
    if (query.cursor !== undefined) {
      search.set('cursor', query.cursor);
    }
    const suffix = search.toString();
    return request<SourceSearchPage>(
      `/admin/sources${suffix === '' ? '' : `?${suffix}`}`,
      signal === undefined ? {} : { signal },
    );
  },
  upsertTag(input: UpsertTagInput): Promise<unknown> {
    return request<unknown>('/admin/tags', { method: 'POST', body: input });
  },
  /**
   * 全部标签 + 使用次数（FD-008）。编辑角色可用。
   *
   * 与 `contentApi.listTags(id)`（某内容的标签）是两回事，不要混淆。
   */
  listAllTags(query?: { q?: string }): Promise<{ items: TagWithUsage[] }> {
    const search = new URLSearchParams();
    if (query?.q !== undefined) {
      search.set('q', query.q);
    }
    const suffix = search.toString();
    return request<{ items: TagWithUsage[] }>(`/admin/tags${suffix === '' ? '' : `?${suffix}`}`);
  },
  /** 关系目标检索（FD-008）：避免手填内容 ID。 */
  searchRelationTargets(query?: { q?: string }): Promise<{ items: RelationTargetItem[] }> {
    const search = new URLSearchParams();
    if (query?.q !== undefined) {
      search.set('q', query.q);
    }
    const suffix = search.toString();
    return request<{ items: RelationTargetItem[] }>(
      `/admin/relation-targets${suffix === '' ? '' : `?${suffix}`}`,
    );
  },
  attachTag(contentId: string, tagSlug: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/admin/contents/${contentId}/tags`, {
      method: 'POST',
      body: { tagSlug },
    });
  },
  createRelation(contentId: string, input: CreateRelationInput): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/admin/contents/${contentId}/relations`, {
      method: 'POST',
      body: input,
    });
  },
  createUploadIntent(
    input: CreateUploadIntentInput,
    idempotencyKey?: string,
  ): Promise<UploadIntentDto> {
    const options: RequestOptions = { method: 'POST', body: input };
    if (idempotencyKey !== undefined) {
      options.idempotencyKey = idempotencyKey;
    }
    return request<UploadIntentDto>('/admin/media/upload-intents', options);
  },
  completeMedia(
    mediaId: string,
    input: CompleteMediaInput,
    idempotencyKey?: string,
  ): Promise<MediaCompleteDto> {
    const options: RequestOptions = { method: 'POST', body: input };
    if (idempotencyKey !== undefined) {
      options.idempotencyKey = idempotencyKey;
    }
    return request<MediaCompleteDto>(`/admin/media/${mediaId}/complete`, options);
  },
};
