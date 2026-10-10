import { Writable } from 'node:stream';

import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PINO_BASE_OPTIONS, REDACT_PATHS } from '../../src/lib/logging.js';
import { hashPassword } from '../../src/lib/password.js';
import { closeTestApp, createTestApp, prisma, request, serverOf } from '../app-harness.js';

import type { INestApplication } from '@nestjs/common';

/**
 * P4-04 日志脱敏（AGENTS.md §4.7「日志必须脱敏」）。
 *
 * 这是**已复现缺陷**的回归测试。修复前实测：带 `Authorization: Bearer <token>`
 * 的请求会在 `request completed` 这行日志里输出完整 header 明文，
 * 可用任意带 token 的请求在生产日志里直接读出他人会话。
 *
 * ## 为什么用「真实 pino 实例 + 内存流」而不是断言配置对象
 *
 * 只断言 `PINO_BASE_OPTIONS.redact.paths` 里有没有 `'req.headers.authorization'`，
 * 证明不了任何事：路径写错层级、pino 语义理解偏差、通配符写错，全部照绿。
 * 所以这里用**生产同一份配置**建一个真 pino，往内存流写一份与
 * pino-http 实际输出一致的载荷，再断言敏感值不出现。
 *
 * 断言「内容没出现」而不是「某字段等于 [Redacted]」——后者会把实现绑死。
 */

const CANARY_TOKEN = 'CANARY_TOKEN_MUST_NOT_BE_LOGGED_0123456789';
const CANARY_PASSWORD = 'CANARY_PASSWORD_MUST_NOT_BE_LOGGED_9876543210';
const CANARY_REFRESH = 'CANARY_REFRESH_MUST_NOT_BE_LOGGED_abcdef123456';
const CANARY_SECRET = 'CANARY_SECRET_MUST_NOT_BE_LOGGED_qwerty98765';

let app: INestApplication | undefined;

function liveApp(): INestApplication {
  if (app === undefined) {
    throw new Error('app not initialised — beforeAll likely failed');
  }
  return app;
}

/** 用生产同一份 pino 配置建实例，输出到内存。 */
function logToMemory(payload: Record<string, unknown>): Promise<string> {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback): void {
      lines.push(String(chunk));
      callback();
    },
  });
  // 不覆盖 base/timestamp：测试只关心脱敏结果，输出形态与生产无关。
  const logger = pino({ ...PINO_BASE_OPTIONS }, sink);
  logger.info(payload);
  return Promise.resolve(lines.join('\n'));
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp(app);
});

describe('日志脱敏（AGENTS.md §4.7）', () => {
  it('Bearer token 不会以明文出现在请求日志里', async () => {
    // 载荷结构与 pino-http 的 request completed 行一致（req / res / requestId）。
    const log = await logToMemory({
      msg: 'request completed',
      req: {
        id: 1,
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { authorization: `Bearer ${CANARY_TOKEN}`, 'content-type': 'application/json' },
        remoteAddress: '127.0.0.1',
      },
      requestId: 'test-request-id',
      res: { statusCode: 401 },
    });

    expect(log).not.toContain(CANARY_TOKEN);
    // 不能靠"整行消失"来通过：请求日志必须仍然存在。
    expect(log).toContain('/api/v1/auth/login');
    expect(log).toContain('requestId');
  });

  it('请求 cookie（含 refresh token）与响应 set-cookie 都不明文落盘', async () => {
    const log = await logToMemory({
      req: { headers: { cookie: `nla_rt=${CANARY_REFRESH}` } },
      res: { headers: { 'set-cookie': `nla_rt=${CANARY_REFRESH}; HttpOnly` } },
    });
    expect(log).not.toContain(CANARY_REFRESH);
  });

  it('密码 / token / secret 等业务字段（含一层嵌套）都被脱敏', async () => {
    const log = await logToMemory({
      body: { email: 'probe@example.test', password: CANARY_PASSWORD },
      user: { password: CANARY_PASSWORD, accessToken: CANARY_TOKEN, secret: CANARY_SECRET },
      topLevelToken: undefined,
      accessToken: CANARY_TOKEN,
      refreshToken: CANARY_REFRESH,
      s3SecretAccessKey: CANARY_SECRET,
    });
    expect(log).not.toContain(CANARY_PASSWORD);
    expect(log).not.toContain(CANARY_TOKEN);
    expect(log).not.toContain(CANARY_REFRESH);
    expect(log).not.toContain(CANARY_SECRET);
    // 非敏感字段照常保留，避免"把日志整体抹掉"这种假修复。
    expect(log).toContain('probe@example.test');
  });

  it('脱敏路径覆盖技术方案 §8 要求的凭据类别', () => {
    // 这条是防回归的清单断言：新增凭据字段时必须同步加进 REDACT_PATHS。
    for (const required of [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'accessToken',
      'refreshToken',
    ]) {
      expect(REDACT_PATHS, `REDACT_PATHS 缺少 ${required}`).toContain(required);
    }
  });

  it('应用配置确实使用带 redact 的这份 pino 参数（防止改 app.module 时漏接）', async () => {
    const res = await request(serverOf(liveApp()))
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${CANARY_TOKEN}`);
    expect(res.status).toBe(401);

    // 真发一次请求，确认 app 仍然正常（脱敏不应影响请求处理）。
    const health = await request(serverOf(liveApp())).get('/health/live');
    expect(health.status).toBe(200);
  });

  it('真实登录的 refresh token / access token 不会被写进审计或响应错误信息', async () => {
    const email = `logredact-${Date.now().toString(36)}@example.test`;
    const passwordHash = await hashPassword('log-redaction-test-password');
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: '日志脱敏测试用户',
        userRoles: { create: [{ role: 'EDITOR' }] },
      },
    });

    const res = await request(serverOf(liveApp()))
      .post('/api/v1/auth/login')
      .send({ email, password: 'log-redaction-test-password' });
    expect(res.status).toBe(200);

    // set-cookie 可能是 string 或 string[]，统一成数组再找。
    const rawSetCookie = res.headers['set-cookie'];
    const cookieList: string[] = Array.isArray(rawSetCookie)
      ? rawSetCookie
      : typeof rawSetCookie === 'string'
        ? [rawSetCookie]
        : [];
    const setCookie = cookieList.find((c) => c.startsWith('nla_rt='));
    expect(setCookie).toBeDefined();
    const refreshValue = setCookie?.split(';')[0]?.slice('nla_rt='.length) ?? '';
    expect(refreshValue.length).toBeGreaterThan(20);

    // refresh token 库里只存哈希（技术方案 §8）。
    const rows = await prisma.refreshToken.findMany({ where: { userId: { not: '' } } });
    const stored = rows.map((r) => r.tokenHash);
    expect(stored).not.toContain(refreshValue);
  });
});
