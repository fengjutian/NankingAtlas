import { beforeAll, describe, expect, it, vi } from 'vitest';

// api.ts 在模块加载期读取 env（`src/lib/env.ts` 是 fail-fast 校验），
// 所以必须在 import 被测模块**之前**注入，否则加载就抛错。
vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'test');

const { failureMessage, isServiceUnavailable, isTerminalNotFound } = await import('./api');

beforeAll(() => {
  vi.unstubAllEnvs();
});

/**
 * 失败原因分类的单测。
 *
 * 这条分类直接决定 HTTP 语义：
 *   - `isTerminalNotFound` → 404（内容确实不可见，爬虫应从索引移除）
 *   - `isServiceUnavailable` → 503（站点或接口故障，内容可能仍然存在）
 *
 * 把两者混为一谈会产生真实故障：接口抖动时搜索引擎把"暂时不可用"
 * 当成"内容已撤"而删除索引；运维也看不出站点挂了。
 */
describe('API failure classification', () => {
  describe('isTerminalNotFound', () => {
    it('treats not_found as terminal (404)', () => {
      expect(isTerminalNotFound('not_found')).toBe(true);
    });

    it('treats forbidden as terminal (404)', () => {
      // 403 说明该内容存在但不对公开访问；对外仍按 404，避免泄露存在性
      expect(isTerminalNotFound('forbidden')).toBe(true);
    });

    it('treats invalid_payload as terminal (数据不对，页面对访客无意义)', () => {
      expect(isTerminalNotFound('invalid_payload')).toBe(true);
    });

    it('does NOT treat service failures as terminal', () => {
      expect(isTerminalNotFound('unconfigured')).toBe(false);
      expect(isTerminalNotFound('network')).toBe(false);
      expect(isTerminalNotFound('http_error')).toBe(false);
    });
  });

  describe('isServiceUnavailable', () => {
    it('treats unconfigured as service unavailability', () => {
      expect(isServiceUnavailable('unconfigured')).toBe(true);
    });

    it('treats network failure as service unavailability', () => {
      expect(isServiceUnavailable('network')).toBe(true);
    });

    it('treats upstream http error as service unavailability', () => {
      expect(isServiceUnavailable('http_error')).toBe(true);
    });

    it('does NOT treat content-level failures as service unavailability', () => {
      expect(isServiceUnavailable('not_found')).toBe(false);
      expect(isServiceUnavailable('forbidden')).toBe(false);
      expect(isServiceUnavailable('invalid_payload')).toBe(false);
    });

    it('is exactly the complement of isTerminalNotFound', () => {
      const reasons = [
        'unconfigured',
        'network',
        'not_found',
        'forbidden',
        'http_error',
        'invalid_payload',
      ] as const;
      for (const reason of reasons) {
        expect(isServiceUnavailable(reason)).toBe(!isTerminalNotFound(reason));
      }
    });
  });

  describe('failureMessage', () => {
    it('gives an actionable message for unconfigured', () => {
      expect(failureMessage('unconfigured')).toContain('NEXT_PUBLIC_API_BASE_URL');
    });

    it('gives a distinct message per reason', () => {
      const messages = new Set([
        failureMessage('unconfigured'),
        failureMessage('network'),
        failureMessage('not_found'),
        failureMessage('forbidden'),
        failureMessage('http_error'),
        failureMessage('invalid_payload'),
      ]);
      // 六种原因不能共用同一句文案，否则用户无法判断该做什么
      expect(messages.size).toBe(6);
    });
  });
});
