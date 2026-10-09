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

/**
 * revalidation 请求体。
 *
 * **必须与 web 端 `apps/web/src/app/api/revalidate/route.ts` 的
 * `payloadSchema` 严格一致** —— web 端用的是 `.strict()`，多发任何字段
 * 都会得到 422 `INVALID_PAYLOAD`。
 *
 * 这正是 P4 修复的第二个真实缺陷：API 原本多发一个 `reason`，
 * 导致即使签名正确，接收端仍返回 422。
 */
export interface RevalidationPayload {
  /** 需要失效的路径，例如 `/chronicle/qinhuai`。 */
  paths?: readonly string[];
  /** cache tag，便于 web 端做 tag 粒度失效。 */
  tags?: readonly string[];
  /** 内容 slug（详情页 tag 失效用）。 */
  slug?: string;
  /** 内容类型（决定详情页路径）。 */
  type?: string;
}

/** 签名窗口（秒）：超过则拒绝，防重放。 */
export const REVALIDATION_MAX_AGE_SECONDS = 300;

/**
 * revalidation 请求头名与签名格式（P2-07）。
 *
 * 必须与 web 端 `apps/web/src/lib/api.ts` 的
 * `REVALIDATION_TIMESTAMP_HEADER` / `REVALIDATION_SIGNATURE_HEADER` /
 * `signRevalidationPayload` 完全一致，否则接收端第一步就判 `missing` → 401。
 *
 * 时间戳用**毫秒**：与 `Date.now()` 同单位，避免两侧各自换算时引入偏差
 * （秒级时间戳在 web 侧要 ×1000，忘乘就是 1970 年的巨大偏差）。
 */
export const REVALIDATION_TIMESTAMP_HEADER = 'x-revalidate-timestamp' as const;
export const REVALIDATION_SIGNATURE_HEADER = 'x-revalidate-signature' as const;

/** 签名格式前缀，便于未来换算法（`hmac-sha256=`）时不破坏解析。 */
export const REVALIDATION_SIGNATURE_PREFIX = 'sha256' as const;

/**
 * 计算签名值。
 *
 * 签名输入：`<毫秒时间戳>.<body>`；输出 `<prefix>=<hex>`。
 * body 参与签名 → 篡改路径列表会校验失败。
 */
export function signRevalidationPayload(timestamp: number, body: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(`${String(timestamp)}.${body}`)
    .digest('hex');
  return `${REVALIDATION_SIGNATURE_PREFIX}=${digest}`;
}

export type RevalidationVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_signature' | 'malformed_timestamp' | 'stale' | 'bad_signature' };

/**
 * 校验来自 web 的 revalidation 请求。
 *
 * 协议与 web 端 `verifyRevalidationSignature` 一致：
 *   `x-revalidate-timestamp`（毫秒整数）+ `x-revalidate-signature`（`sha256=<hex>`）
 *
 * 逐项失败都返回明确 reason，便于调用方记录告警（区分"网络抖动"
 * 与"密钥不对"这两类完全不同的问题）。
 *
 * 顺序：先格式 → 再时间窗 → 最后签名。原因：时间窗检查在签名之前，
 * 才能避免攻击者用"签名是否匹配"当 oracle 探测密钥；同时过期请求
 * 直接拒绝，省掉一次昂贵的 HMAC 计算。
 */
export function verifyRevalidation(input: {
  timestamp: string | undefined;
  signature: string | undefined;
  body: string;
  now?: Date;
}): RevalidationVerifyResult {
  if (
    input.timestamp === undefined ||
    input.timestamp === '' ||
    input.signature === undefined ||
    input.signature === ''
  ) {
    return { ok: false, reason: 'missing_signature' };
  }

  if (!/^\d{1,15}$/.test(input.timestamp)) {
    return { ok: false, reason: 'malformed_timestamp' };
  }
  const signaturePattern = new RegExp(`^${REVALIDATION_SIGNATURE_PREFIX}=[0-9a-f]{64}$`, 'u');
  if (!signaturePattern.test(input.signature)) {
    return { ok: false, reason: 'malformed_timestamp' };
  }

  const timestamp = Number.parseInt(input.timestamp, 10);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    return { ok: false, reason: 'malformed_timestamp' };
  }

  const nowMs = (input.now ?? new Date()).getTime();
  const ageMs = Math.abs(nowMs - timestamp);
  if (ageMs > REVALIDATION_MAX_AGE_SECONDS * 1000) {
    return { ok: false, reason: 'stale' };
  }

  const expected = signRevalidationPayload(timestamp, input.body, env.REVALIDATION_SECRET);
  const expectedBuf = Buffer.from(expected.slice(expected.indexOf('=') + 1), 'hex');
  const actualBuf = Buffer.from(input.signature.slice(input.signature.indexOf('=') + 1), 'hex');
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
): Promise<{ ok: true; attempts: number } | { ok: false; reason: string; attempts: number }> {
  if (env.REVALIDATION_URL === null) {
    // 未配置 revalidation 端点（例如本地开发）：跳过而非报错。
    return { ok: true, attempts: 0 };
  }

  const body = JSON.stringify(payload);
  let lastReason = 'unknown';
  // 退避序列 250ms / 1000ms / 4000ms —— 总预算约 5 秒，
  // 足以覆盖 web 端短暂重启，又不会把 API 请求线程拖太久
  // （revalidation 尽力而为，永远不能阻塞内容发布）。
  const backoffMs = [250, 1000, 4000] as const;

  for (let attempt = 0; attempt <= backoffMs.length; attempt += 1) {
    const timestamp = Date.now();
    const signature = signRevalidationPayload(timestamp, body, env.REVALIDATION_SECRET);

    try {
      const response = await fetch(env.REVALIDATION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [REVALIDATION_TIMESTAMP_HEADER]: String(timestamp),
          [REVALIDATION_SIGNATURE_HEADER]: signature,
        },
        body,
        signal: AbortSignal.timeout(5_000),
      });

      if (response.ok) {
        return { ok: true, attempts: attempt + 1 };
      }
      lastReason = `HTTP ${String(response.status)}`;
    } catch (cause) {
      lastReason = cause instanceof Error ? cause.message : String(cause);
    }

    const wait = backoffMs[attempt];
    if (wait === undefined) {
      break;
    }
    await sleep(wait);
  }

  return { ok: false, reason: lastReason, attempts: backoffMs.length + 1 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
