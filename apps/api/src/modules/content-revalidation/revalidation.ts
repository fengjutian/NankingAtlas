import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '../../lib/env.js';

/**
 * 发布 → revalidation 的签名协议（P2-07）。
 *
 * 技术方案 §9.1：「发布成功后 API 以签名请求触发受影响路径 revalidation；
 * 失败进入重试并告警，但数据库发布事务不依赖 Netlify 成功。」
 *
 * 设计要点：
 *   1. **数据库事务不依赖 revalidation 成功** —— 发布事务先提交，
 *      revalidation 是之后独立的一步；失败只影响站点收敛速度，
 *      不回滚发布。这是本模块存在的根本原因。
 *   2. **签名覆盖 body + 时间戳**，防止重放与篡改。
 *   3. 时间戳窗口默认 300 秒 —— 足够覆盖重试，又不会让旧请求长期有效。
 */

export interface RevalidationPayload {
  /** 需要失效的路径，例如 `/chronicle/qinhuai`。 */
  paths: readonly string[];
  /** 可选的 cache tag，便于 web 端做 tag 粒度失效。 */
  tags?: readonly string[];
  /** 触发原因，写进日志便于排查。 */
  reason: string;
}

/** 签名窗口（秒）：超过则拒绝，防重放。 */
export const REVALIDATION_MAX_AGE_SECONDS = 300;

/**
 * 计算签名。
 *
 * 签名输入：`<timestamp>.<body>` 的 HMAC-SHA256（hex）。
 * 用点号分隔避免 `123` + `456` 与 `12` + `3456` 的歧义。
 */
export function signRevalidation(body: string, timestamp: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${String(timestamp)}.${body}`)
    .digest('hex');
}

export type RevalidationVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_signature' | 'malformed_timestamp' | 'stale' | 'bad_signature' };

/**
 * 校验来自 web 的 revalidation 请求。
 *
 * 逐项失败都返回明确 reason，便于调用方记录告警（区分"网络抖动"
 * 与"密钥不对"这两类完全不同的问题）。
 */
export function verifyRevalidation(input: {
  signature: string | undefined;
  body: string;
  now?: Date;
}): RevalidationVerifyResult {
  if (input.signature === undefined || input.signature === '') {
    return { ok: false, reason: 'missing_signature' };
  }

  const parts = input.signature.split(':');
  if (parts.length !== 2) {
    return { ok: false, reason: 'malformed_timestamp' };
  }
  const [timestampPart, signaturePart] = parts;
  if (timestampPart === undefined || signaturePart === undefined) {
    return { ok: false, reason: 'malformed_timestamp' };
  }

  const timestamp = Number.parseInt(timestampPart, 10);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    return { ok: false, reason: 'malformed_timestamp' };
  }

  const nowMs = (input.now ?? new Date()).getTime();
  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - timestamp);
  if (ageSeconds > REVALIDATION_MAX_AGE_SECONDS) {
    return { ok: false, reason: 'stale' };
  }

  const expected = signRevalidation(input.body, timestamp, env.REVALIDATION_SECRET);
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signaturePart, 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return { ok: false, reason: 'bad_signature' };
  }

  return { ok: true };
}

/**
 * 构造带签名的请求头。
 *
 * 供 `ContentService.transition` 在发布成功后调用 —— 失败只记日志，
 * 不影响发布事务（技术方案 §9.1 的硬要求）。
 */
export async function triggerRevalidation(
  payload: RevalidationPayload,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (env.REVALIDATION_URL === null) {
    // 未配置 revalidation 端点（例如本地开发）：跳过而非报错。
    return { ok: true };
  }

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `${String(timestamp)}:${signRevalidation(body, timestamp, env.REVALIDATION_SECRET)}`;

  try {
    const response = await fetch(env.REVALIDATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nla-signature': signature,
      },
      body,
      // 不无限等待：revalidation 是尽力而为，不能拖住请求线程。
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return { ok: false, reason: `HTTP ${String(response.status)}` };
    }
    return { ok: true };
  } catch (cause) {
    // 网络错误、超时等 —— 归为失败但不抛（调用方只记日志）。
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, reason: message };
  }
}

/** 发布成功后需要失效的路径（按内容类型推导）。 */
export function revalidationPathsFor(input: { slug: string; type: string }): string[] {
  const paths = new Set<string>(['/', '/sitemap.xml']);
  paths.add(`/chronicle/${input.slug}`);
  paths.add(`/living/${input.slug}`);
  switch (input.type) {
    case 'PLACE':
      paths.add(`/places/${input.slug}`);
      paths.add('/map');
      break;
    case 'TOPIC':
      paths.add(`/topics/${input.slug}`);
      break;
    case 'ROUTE':
      paths.add(`/routes/${input.slug}`);
      break;
    case 'PERSON':
    case 'EVENT':
    case 'ARCHITECTURE':
    case 'TRADITION':
      // 统一档案模板复用 chronicle / living 路径
      break;
    default:
      break;
  }
  return [...paths];
}
