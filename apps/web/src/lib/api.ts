/**
 * 公开站 API 客户端（P2-03 ~ P2-08）。
 *
 * 只读取 `published` 内容（技术方案 §4 / §7.2）。三条硬约束：
 * 1. `env.API_BASE_URL` 允许为 null —— 此时所有请求返回 `unconfigured` 降级结果，
 *    页面渲染"内容暂不可用"，构建与渲染都不抛错。
 * 2. 任何网络/解析/状态码错误都转成 `ApiResult`，不向渲染层抛异常。
 * 3. 响应一律经 zod schema 解析；`unknown` + schema，页面侧不再有 `any`。
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { env } from './env';
import {
  CONTENT_TYPES,
  publicContentListSchema,
  publicPlaceSchema,
  publicContentSchema,
  homepageSchema,
  type ContentType,
  type Homepage,
  type PlaceContent,
  type PublicContent,
} from './types';

export const API_PREFIX = '/api/v1';

/** 允许的最大单页条数：与 API `listQuerySchema` 的 max 一致。 */
export const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// 结果类型与错误映射
// ---------------------------------------------------------------------------

export type ApiFailureReason =
  | 'unconfigured'
  | 'network'
  | 'not_found'
  | 'forbidden'
  | 'http_error'
  | 'invalid_payload';

export interface ApiFailure {
  readonly ok: false;
  readonly reason: ApiFailureReason;
  readonly message: string;
  readonly status: number | null;
  readonly requestId: string | null;
}

export interface ApiSuccess<T> {
  readonly ok: true;
  readonly data: T;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

function fail(reason: ApiFailureReason, message: string, status: number | null = null): ApiFailure {
  return { ok: false, reason, message, status, requestId: null };
}

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().nullable().optional(),
  }),
});

/** HTTP 状态码 → 降级原因。 */
export function reasonForStatus(status: number): ApiFailureReason {
  if (status === 404) return 'not_found';
  if (status === 401 || status === 403) return 'forbidden';
  return 'http_error';
}

const REASON_MESSAGES: Readonly<Record<ApiFailureReason, string>> = {
  unconfigured: '尚未配置 NEXT_PUBLIC_API_BASE_URL，内容接口暂不可用。',
  network: '内容接口暂时无法连接，请稍后重试。',
  not_found: '内容不存在或尚未发布。',
  forbidden: '该资源未对公开访问开放。',
  http_error: '内容接口返回错误状态。',
  invalid_payload: '内容接口返回的数据结构不符合公开契约。',
};

export function failureMessage(reason: ApiFailureReason): string {
  return REASON_MESSAGES[reason];
}

// ---------------------------------------------------------------------------
// URL 构造
// ---------------------------------------------------------------------------

export type QueryValue = string | number | undefined;

/**
 * slug → 路径段。slug 由 API 约束为小写 ASCII/数字/连字符，
 * 这里仍做一次百分号编码，避免上游异常值把路径结构改写。
 */
export function encodeSlug(slug: string): string {
  return encodeURIComponent(slug);
}

/** 公开内容请求参数。 */
export interface QueryParams {
  readonly type?: ContentType | undefined;
  readonly q?: string | undefined;
  readonly limit?: number | undefined;
}

/**
 * 构造绝对/相对请求地址。
 *
 * `env.API_BASE_URL` 为 null（未配置）时返回 null —— 调用方必须走降级分支，
 * 绝不允许用硬编码 localhost 假装接口可用。
 */
export function buildApiUrl(path: string, query: QueryParams = {}): string | null {
  const base = env.API_BASE_URL;
  if (base === null || base === '') return null;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const search = new URLSearchParams();
  if (query.type !== undefined) search.set('type', query.type);
  if (query.q !== undefined && query.q !== '') search.set('q', query.q);
  if (query.limit !== undefined) search.set('limit', String(query.limit));
  const queryString = search.toString();
  return `${base.replace(/\/+$/, '')}${API_PREFIX}${normalized}${queryString === '' ? '' : `?${queryString}`}`;
}

// ---------------------------------------------------------------------------
// 请求执行
// ---------------------------------------------------------------------------

export interface RequestOptions {
  readonly revalidate?: number | false;
  readonly tags?: readonly string[];
  readonly signal?: AbortSignal;
}

function parseBody(text: string): unknown {
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

async function request(path: string, query: QueryParams, options: RequestOptions): Promise<ApiResult<unknown>> {
  const url = buildApiUrl(path, query);
  if (url === null) {
    return fail('unconfigured', failureMessage('unconfigured'));
  }

  const init: RequestInit = { headers: { accept: 'application/json' } };
  if (options.revalidate !== undefined) {
    init.next = {
      ...(options.revalidate === false ? { revalidate: false } : { revalidate: options.revalidate }),
      ...(options.tags !== undefined ? { tags: [...options.tags] } : {}),
    };
  }
  if (options.signal !== undefined) init.signal = options.signal;

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return fail('network', failureMessage('network'));
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    return fail('network', failureMessage('network'), response.status);
  }

  if (!response.ok) {
    const reason = reasonForStatus(response.status);
    const envelope = errorEnvelopeSchema.safeParse(parseBody(text));
    const message = envelope.success
      ? failureMessage(reason)
      : `${failureMessage(reason)}（HTTP ${response.status}）`;
    return {
      ok: false,
      reason,
      message,
      status: response.status,
      requestId: envelope.success ? (envelope.data.error.requestId ?? null) : null,
    };
  }

  const parsed = parseBody(text);
  if (parsed === undefined) {
    return fail('invalid_payload', failureMessage('invalid_payload'), response.status);
  }
  return { ok: true, data: parsed };
}

async function requestData<T>(
  path: string,
  query: QueryParams,
  schema: z.ZodType<T>,
  options: RequestOptions,
): Promise<ApiResult<T>> {
  const raw = await request(path, query, options);
  if (!raw.ok) return raw;
  const parsed = schema.safeParse(raw.data);
  if (!parsed.success) {
    return fail('invalid_payload', failureMessage('invalid_payload'));
  }
  return { ok: true, data: parsed.data };
}

// ---------------------------------------------------------------------------
// 公开端点
// ---------------------------------------------------------------------------

/** `GET /api/v1/contents` —— 只返回 PUBLISHED 且未归档的内容。 */
export async function listPublishedContents(
  query: QueryParams = {},
  options: RequestOptions = {},
): Promise<ApiResult<PublicContent[]>> {
  const result = await requestData('/contents', query, publicContentListSchema, options);
  return result.ok ? { ok: true, data: result.data.data } : result;
}

/** `GET /api/v1/contents/:slug` —— 未发布/不存在统一 404。 */
export async function getPublishedContentBySlug(
  slug: string,
  options: RequestOptions = {},
): Promise<ApiResult<PublicContent>> {
  return requestData(`/contents/${encodeSlug(slug)}`, {}, publicContentSchema, options);
}

/** `GET /api/v1/places/:slug` —— 端点就绪前返回 not_found，调用方降级。 */
export async function getPlaceBySlug(
  slug: string,
  options: RequestOptions = {},
): Promise<ApiResult<PlaceContent>> {
  const result = await request(`/places/${encodeSlug(slug)}`, {}, options);
  if (!result.ok) return result;
  const envelope = z.object({ data: publicPlaceSchema }).safeParse(result.data);
  // zod 默认剥离未知键：内部字段不会随公开 DTO 泄漏到页面。
  if (!envelope.success) return fail('invalid_payload', failureMessage('invalid_payload'));
  return { ok: true, data: envelope.data.data };
}

/** `GET /api/v1/homepage` —— 后台槽位；未就绪时调用方降级为"无槽位内容"。 */
export async function getHomepage(options: RequestOptions = {}): Promise<ApiResult<Homepage>> {
  const raw = await request<unknown>('/homepage', {}, options);
  if (!raw.ok) return raw;
  const envelope = z.object({ data: homepageSchema }).safeParse(raw.data);
  if (!envelope.success) return fail('invalid_payload', failureMessage('invalid_payload'));
  return { ok: true, data: envelope.data.data };
}

/** `GET /api/v1/contents/:id/relations` —— 后台受保护端点，公开站预期降级。 */
export async function getContentRelations(
  contentId: string,
  options: RequestOptions = {},
): Promise<ApiResult<unknown>> {
  return request(`/contents/${encodeURIComponent(contentId)}/relations`, {}, options);
}

/** `GET /api/v1/contents/:id/sources` —— 后台受保护端点，公开站预期降级。 */
export async function getContentSources(
  contentId: string,
  options: RequestOptions = {},
): Promise<ApiResult<unknown>> {
  return request(`/contents/${encodeURIComponent(contentId)}/sources`, {}, options);
}

/** 降级原因 → 可直接展示的中文说明（供空状态与错误块复用）。 */
export function describeFailure(failure: ApiFailure): string {
  return failure.message;
}

// ---------------------------------------------------------------------------
// 列表筛选 / 分页的 URL 序列化（技术方案 §10「保存筛选至 URL」）
// ---------------------------------------------------------------------------

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_QUERY_LENGTH = 100;

export interface ListQuery {
  readonly type: ContentType | null;
  readonly q: string;
  readonly page: number;
  readonly pageSize: number;
}

export const DEFAULT_LIST_QUERY: ListQuery = {
  type: null,
  q: '',
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

function toPositiveInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed >= 1 ? parsed : null;
}

/**
 * 从 `searchParams` 解析筛选状态。
 *
 * - `type` 必须落在当前栏目允许的类型集合内（防止生成打不开的筛选链接）；
 *   未传集合时接受契约内的任意类型。
 * - `q` 去空白并截断到 100 字符（技术方案 §11 查询长度上限）；
 * - `page` / `pageSize` 越界时回落到默认值，不抛错。
 */
export function parseListQuery(
  params: Readonly<Record<string, string | string[] | undefined>>,
  allowedTypes: readonly ContentType[] = [],
): ListQuery {
  const rawType = firstValue(params['type']);
  const accepted: readonly string[] =
    allowedTypes.length > 0 ? allowedTypes : CONTENT_TYPES;
  const type =
    rawType !== null && accepted.includes(rawType) ? (rawType as ContentType) : null;

  const rawQ = firstValue(params['q']) ?? '';
  const q = rawQ.trim().slice(0, MAX_QUERY_LENGTH);

  const page = toPositiveInt(firstValue(params['page'])) ?? 1;
  const rawPageSize = toPositiveInt(firstValue(params['pageSize']));
  const pageSize =
    rawPageSize !== null && (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawPageSize)
      ? rawPageSize
      : DEFAULT_PAGE_SIZE;

  return { type, q, page, pageSize };
}

/**
 * 序列化为稳定顺序的查询串（省略默认值）。
 * `parseListQuery(parse(queryString)) === query`，往返一致由单测保证。
 */
export function serializeListQuery(query: ListQuery): string {
  const search = new URLSearchParams();
  if (query.type !== null) search.set('type', query.type);
  if (query.q !== '') search.set('q', query.q);
  if (query.page > 1) search.set('page', String(query.page));
  if (query.pageSize !== DEFAULT_PAGE_SIZE) search.set('pageSize', String(query.pageSize));
  return search.toString();
}

export function parseQueryStringToRecord(queryString: string): Record<string, string> {
  const record: Record<string, string> = {};
  new URLSearchParams(queryString).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/** 拼接栏目页地址，保留当前筛选。 */
export function withListQuery(path: string, query: ListQuery): string {
  const serialized = serializeListQuery(query);
  return serialized === '' ? path : `${path}?${serialized}`;
}

/** 切换某一维度时重置页码，避免落到空页。 */
export function toggleType(current: ListQuery, type: ContentType | null): ListQuery {
  return { ...current, type: current.type === type ? null : type, page: 1 };
}

export function setKeyword(current: ListQuery, q: string): ListQuery {
  return { ...current, q: q.trim().slice(0, MAX_QUERY_LENGTH), page: 1 };
}

export function setPage(current: ListQuery, page: number): ListQuery {
  return { ...current, page: page < 1 ? 1 : page };
}

export function setPageSize(current: ListQuery, pageSize: number): ListQuery {
  return { ...current, pageSize, page: 1 };
}

/**
 * 在已加载的窗口内分页。
 *
 * 公开列表端点当前没有游标分页（P1 契约），因此这里只对一次性取回的真实条目做切片，
 * 不伪造"下一页"数据。`capped` 表示服务端结果数达到请求上限，翻页并不覆盖全量。
 */
export function paginate<T>(
  items: readonly T[],
  query: ListQuery,
): { pageItems: T[]; totalItems: number; totalPages: number; capped: boolean } {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.pageSize;
  return {
    pageItems: items.slice(start, start + query.pageSize),
    totalItems,
    totalPages,
    capped: totalItems >= MAX_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// 签名 revalidation（P2-07）
// ---------------------------------------------------------------------------

export const REVALIDATION_TIMESTAMP_HEADER = 'x-revalidate-timestamp';
export const REVALIDATION_SIGNATURE_HEADER = 'x-revalidate-signature';
/** 防重放窗口：5 分钟。 */
export const REVALIDATION_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * 签名 = HMAC-SHA256(secret, `${timestamp}.${body}`)，输出 `sha256=<hex>`。
 * 时间戳与 body 一起签名，因此篡改 body 或时间戳都会校验失败。
 */
export function signRevalidationPayload(timestamp: string, body: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `sha256=${digest}`;
}

export type RevalidationFailure = 'missing' | 'malformed' | 'expired' | 'mismatch';

export type RevalidationCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: RevalidationFailure };

/**
 * 校验签名与时间戳。
 *
 * - 缺 header → missing
 * - 时间戳不是整数毫秒 / 签名格式不符 → malformed
 * - 超出防重放窗口 → expired（先于签名比对，避免用签名做 oracle）
 * - 签名不符 → mismatch（常量时间比较）
 */
export function verifyRevalidationSignature(input: {
  readonly timestamp: string | null;
  readonly signature: string | null;
  readonly body: string;
  readonly secret: string;
  readonly nowMs: number;
  readonly toleranceMs?: number;
}): RevalidationCheck {
  const { timestamp, signature, body, secret, nowMs } = input;
  const toleranceMs = input.toleranceMs ?? REVALIDATION_TOLERANCE_MS;

  if (timestamp === null || timestamp === '' || signature === null || signature === '') {
    return { ok: false, reason: 'missing' };
  }
  if (!/^\d{1,15}$/.test(timestamp) || !/^sha256=[0-9a-f]{64}$/.test(signature)) {
    return { ok: false, reason: 'malformed' };
  }

  const sentAt = Number.parseInt(timestamp, 10);
  if (Math.abs(nowMs - sentAt) > toleranceMs) {
    return { ok: false, reason: 'expired' };
  }

  const expected = signRevalidationPayload(timestamp, body, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}

/** `REVALIDATION_SECRET` 读取；未配置时接收端必须 503，而不是跳过校验。 */
export function getRevalidationSecret(): string | null {
  const secret = process.env['REVALIDATION_SECRET'];
  return typeof secret === 'string' && secret !== '' ? secret : null;
}
