import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';

import {
  REVALIDATION_SIGNATURE_HEADER,
  REVALIDATION_TIMESTAMP_HEADER,
  getRevalidationSecret,
  verifyRevalidationSignature,
} from '@/lib/api';

/**
 * 发布后缓存更新接收端（P2-07）。
 *
 * 边界（技术方案 §9.1）：
 * - API 在发布事务提交后向本端点发起**签名**请求；数据库发布事务不依赖本端点成功，
 *   失败只影响缓存新鲜度（并由 API 侧重试与告警）。
 * - 签名 = HMAC-SHA256(secret, `${timestamp}.${body}`)；时间戳与 body 一起签名，
 *   任何篡改都会校验失败；超出 5 分钟窗口按重放拒绝。
 * - 未配置密钥时返回 503，**绝不**降级为"无签名也放行"。
 */

export const dynamic = 'force-dynamic';

const payloadSchema = z
  .object({
    paths: z.array(z.string().startsWith('/')).max(50).optional(),
    tags: z.array(z.string().min(1)).max(50).optional(),
    slug: z.string().min(1).max(200).optional(),
    type: z.string().min(1).max(40).optional(),
  })
  .strict();

function respond(status: number, code: string, message: string, requestId: string): Response {
  return Response.json(
    { error: { code, message, requestId } },
    { status, headers: { 'x-request-id': requestId } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const secret = getRevalidationSecret();
  if (secret === null) {
    return respond(
      503,
      'REVALIDATION_NOT_CONFIGURED',
      '服务端未配置 REVALIDATION_SECRET，已拒绝请求。',
      requestId,
    );
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return respond(400, 'INVALID_BODY', '无法读取请求体。', requestId);
  }

  const check = verifyRevalidationSignature({
    timestamp: request.headers.get(REVALIDATION_TIMESTAMP_HEADER),
    signature: request.headers.get(REVALIDATION_SIGNATURE_HEADER),
    body,
    secret,
    nowMs: Date.now(),
  });
  if (!check.ok) {
    return respond(401, 'INVALID_SIGNATURE', `签名校验失败（${check.reason}）。`, requestId);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body) as unknown;
  } catch {
    return respond(400, 'INVALID_JSON', '请求体不是合法 JSON。', requestId);
  }
  const payload = payloadSchema.safeParse(raw);
  if (!payload.success) {
    return respond(422, 'INVALID_PAYLOAD', '请求体不符合 revalidation 契约。', requestId);
  }

  // 列表/首页类标签：任何内容变更都让公共列表失效。
  revalidateTag('contents');
  revalidatePath('/');

  const tags = [...(payload.data.tags ?? [])];
  if (payload.data.slug !== undefined) {
    tags.push(`content:${payload.data.slug}`);
    if (payload.data.type === 'PLACE') tags.push(`place:${payload.data.slug}`);
  }
  for (const tag of tags) revalidateTag(tag);

  for (const path of payload.data.paths ?? []) revalidatePath(path);
  if (payload.data.slug !== undefined && payload.data.type !== undefined) {
    revalidatePath(detailPathFor(payload.data.type, payload.data.slug));
  }

  return Response.json(
    { data: { revalidated: true, tags, paths: payload.data.paths ?? [], requestId } },
    { headers: { 'x-request-id': requestId } },
  );
}

function detailPathFor(type: string, slug: string): string {
  switch (type) {
    case 'PLACE':
      return `/places/${slug}`;
    case 'TOPIC':
      return `/topics/${slug}`;
    case 'ROUTE':
      return `/routes/${slug}`;
    case 'PERSON':
      return `/people/${slug}`;
    case 'EVENT':
      return `/events/${slug}`;
    case 'ARCHITECTURE':
      return `/architectures/${slug}`;
    default:
      return `/chronicle/${slug}`;
  }
}

/** GET 不提供任何缓存操作能力。 */
export function GET(): Response {
  return Response.json(
    {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: '仅支持 POST。',
        requestId: crypto.randomUUID(),
      },
    },
    { status: 405, headers: { allow: 'POST' } },
  );
}
