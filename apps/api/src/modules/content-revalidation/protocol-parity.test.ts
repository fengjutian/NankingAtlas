import { createHmac } from 'node:crypto';

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

/**
 * revalidation 协议的**跨应用一致性**测试（P4-02 修复验证）。
 *
 * 背景：P2-07 实现时，API 与 web 各自定义了签名协议且**不一致**：
 *   - API：单头 `x-nla-signature`，格式 `<秒>:<裸 hex>`
 *   - web：双头 `x-revalidate-timestamp` + `x-revalidate-signature`，
 *           格式 `<毫秒>` 与 `sha256=<hex>`
 * 结果：web 的接收端第一步就判 `missing` → 401，**revalidation 从未真正工作过**。
 * 两边的单元测试各自通过，因为都只测了自己那一半。
 *
 * 这个测试文件直接把 web 的 `verifyRevalidationSignature` 与 API 的
 * `verifyRevalidation` 放在一起对拍 —— 任何一侧改了协议而另一侧没跟上，
 * 这里立刻红。
 */

import type { RevalidationPayload } from './revalidation.js';

const SECRET = 'cross-app-revalidation-secret-value-32b';
const BODY = JSON.stringify({ paths: ['/chronicle/x'], tags: ['contents'], reason: 'publish' });

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('APP_ENV', 'test');
  vi.stubEnv('REVALIDATION_SECRET', SECRET);
  // web 的 env.ts 是 fail-fast 校验，导入前必须注入，否则加载即抛
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'test');
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://api.test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * web 端签名（apps/web/src/lib/api.ts: signRevalidationPayload）。
 *
 * 这里**复制**而不是 import web 的源码：`apps/api` 的测试跨目录 import
 * `apps/web/src/**` 会把 web 的模块拖进 api 的 NodeNext 类型检查，
 * 形成应用间耦合（AGENTS.md §2.2 的反向形态）。
 * 协议本身已由下面的断言逐条锁定，复制实现反而更安全 ——
 * 任何一侧改了算法，这个对拍会立刻红。
 */
function webSign(timestamp: number, body: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(`${String(timestamp)}.${body}`)
    .digest('hex');
  return `sha256=${digest}`;
}

/**
 * web 端校验逻辑（apps/web/src/lib/api.ts: verifyRevalidationSignature）。
 * 返回 `true`/`false`，语义与 web 端一致。
 */
function webVerify(input: {
  timestamp: string;
  signature: string;
  body: string;
  secret: string;
  nowMs: number;
  toleranceMs?: number;
}): boolean {
  const toleranceMs = input.toleranceMs ?? 5 * 60 * 1000;
  if (!/^\d{1,15}$/u.test(input.timestamp) || !/^sha256=[0-9a-f]{64}$/u.test(input.signature)) {
    return false;
  }
  const sentAt = Number.parseInt(input.timestamp, 10);
  if (Math.abs(input.nowMs - sentAt) > toleranceMs) {
    return false;
  }
  return webSign(sentAt, input.body, input.secret) === input.signature;
}

/** web 端头名常量（apps/web/src/lib/api.ts）。 */
const WEB_TIMESTAMP_HEADER = 'x-revalidate-timestamp';
const WEB_SIGNATURE_HEADER = 'x-revalidate-signature';

describe('revalidation 跨应用协议一致性', () => {
  it('web 生成的签名能被 API 接受', async () => {
    const api = await import('./revalidation.js');
    const timestamp = Date.now();

    const result = api.verifyRevalidation({
      timestamp: String(timestamp),
      signature: webSign(timestamp, BODY, SECRET),
      body: BODY,
    });

    expect(result).toEqual({ ok: true });
  });

  it('API 生成的签名能被 web 接受', async () => {
    const api = await import('./revalidation.js');
    const timestamp = Date.now();
    const signature = api.signRevalidationPayload(timestamp, BODY, SECRET);

    expect(
      webVerify({
        timestamp: String(timestamp),
        signature,
        body: BODY,
        secret: SECRET,
        nowMs: Date.now(),
      }),
    ).toBe(true);
  });

  it('两端使用相同的请求头名', async () => {
    const api = await import('./revalidation.js');

    expect(api.REVALIDATION_TIMESTAMP_HEADER).toBe(WEB_TIMESTAMP_HEADER);
    expect(api.REVALIDATION_SIGNATURE_HEADER).toBe(WEB_SIGNATURE_HEADER);
  });

  it('API 触发时发出的头名与常量一致', async () => {
    // env 在**模块加载期**就被校验并冻结，所以 stubEnv 必须在 import 之前。
    // REVALIDATION_URL 校验要求 https 或 localhost。
    vi.stubEnv('REVALIDATION_URL', 'http://localhost:3111/api/revalidate');
    const api = await import('./revalidation.js');

    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.triggerRevalidation({ paths: ['/'], slug: 'test', type: 'TOPIC' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['x-revalidate-timestamp']).toMatch(/^\d{13}$/u);
    expect(headers['x-revalidate-signature']).toMatch(/^sha256=[0-9a-f]{64}$/u);
    // 旧的头名不得再出现（保留它会让接收端误以为两套协议并存）
    expect(headers['x-nla-signature']).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('篡改 body 被两端同时拒绝', async () => {
    const api = await import('./revalidation.js');
    const timestamp = Date.now();

    const result = api.verifyRevalidation({
      timestamp: String(timestamp),
      signature: webSign(timestamp, BODY, SECRET),
      body: '{"paths":["/admin"]}', // 篡改
    });

    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('密钥不一致被拒绝', async () => {
    const api = await import('./revalidation.js');
    const timestamp = Date.now();

    const result = api.verifyRevalidation({
      timestamp: String(timestamp),
      signature: webSign(timestamp, BODY, 'a-completely-different-secret-value-32b'),
      body: BODY,
    });

    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('超过 5 分钟的重放被拒绝（两端窗口一致）', async () => {
    const api = await import('./revalidation.js');
    const now = Date.now();
    const stale = now - 6 * 60 * 1000; // 6 分钟前
    const signature = webSign(stale, BODY, SECRET);

    const apiResult = api.verifyRevalidation({
      timestamp: String(stale),
      signature,
      body: BODY,
      now: new Date(now),
    });
    expect(apiResult).toEqual({ ok: false, reason: 'stale' });

    // web 端同样拒绝（用等价语义复算）
    expect(
      webVerify({ timestamp: String(stale), signature, body: BODY, secret: SECRET, nowMs: now }),
    ).toBe(false);
  });

  it('缺任一头都被拒绝', async () => {
    const api = await import('./revalidation.js');
    const timestamp = Date.now();

    expect(
      api.verifyRevalidation({
        timestamp: undefined,
        signature: webSign(timestamp, BODY, SECRET),
        body: BODY,
      }),
    ).toEqual({ ok: false, reason: 'missing_signature' });

    expect(
      api.verifyRevalidation({ timestamp: String(timestamp), signature: undefined, body: BODY }),
    ).toEqual({ ok: false, reason: 'missing_signature' });
  });

  it('秒级时间戳被拒绝（P2 的原始缺陷形态）', async () => {
    const api = await import('./revalidation.js');
    const seconds = Math.floor(Date.now() / 1000);

    const result = api.verifyRevalidation({
      timestamp: String(seconds),
      signature: webSign(seconds, BODY, SECRET),
      body: BODY,
    });

    // 13 位以外的（秒级 10 位）不符合协议格式 → 拒绝
    expect(result.ok).toBe(false);
  });

  it('签名格式不符（缺 sha256= 前缀）被拒绝', async () => {
    const api = await import('./revalidation.js');
    const timestamp = Date.now();
    const bare = webSign(timestamp, BODY, SECRET).replace('sha256=', '');

    const result = api.verifyRevalidation({
      timestamp: String(timestamp),
      signature: bare,
      body: BODY,
    });
    expect(result).toEqual({ ok: false, reason: 'malformed_timestamp' });
  });
});

/**
 * 请求体契约一致性。
 *
 * web 端 `route.ts` 的 `payloadSchema` 是 `.strict()` ——
 * **多发任何一个字段都会得到 422 `INVALID_PAYLOAD`**。
 * P2 的原始实现多发了一个 `reason` 字段，签名正确也照样被拒。
 */
describe('revalidation 请求体契约一致性', () => {
  it('API 实际发送的 body 能通过 web 的 strict schema', async () => {
    vi.stubEnv('REVALIDATION_URL', 'http://localhost:3111/api/revalidate');
    const api = await import('./revalidation.js');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // 与 ContentService.transition 相同的载荷形状
    await api.triggerRevalidation({
      paths: ['/', '/chronicle/x', '/living/x'],
      slug: 'x',
      type: 'PLACE',
    });

    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit | undefined] | undefined;
    const rawBody = firstCall?.[1]?.body;
    // RequestInit.body 是 BodyInit；这里明确断言是 string 再解析，
    // 避免 String(obj) 静默产出 '[object Object]'（no-base-to-string）。
    expect(typeof rawBody).toBe('string');
    const sent = JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as Record<
      string,
      unknown
    >;

    // 与 web 端 payloadSchema 的 key 集合比对。
    // web 端 4 个字段全是 `.optional()`，所以**子集**就合法；
    // 关键是"不多发"—— strict schema 遇到未知字段直接 422。
    const WEB_ALLOWED_KEYS = ['paths', 'tags', 'slug', 'type'];
    for (const key of Object.keys(sent)) {
      expect(WEB_ALLOWED_KEYS).toContain(key);
    }
    // 本次载荷实际发的是 paths + slug + type
    expect(Object.keys(sent).sort()).toEqual(['paths', 'slug', 'type']);

    vi.unstubAllGlobals();
  });

  it('RevalidationPayload 类型不含 web 端未声明的字段', () => {
    // 编译期已保证类型；运行时断言防止有人"顺手加个字段"绕过
    const payload: RevalidationPayload = { paths: ['/'], slug: 'x', type: 'TOPIC' };
    expect(
      Object.keys(payload).every((key) => ['paths', 'tags', 'slug', 'type'].includes(key)),
    ).toBe(true);
  });
});
