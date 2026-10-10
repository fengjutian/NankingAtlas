import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applySecurityHeaders, buildCsp, cspPolicyForPath } from './security-headers';

/**
 * CSP 单测。
 *
 * 这里锁的是**一条浏览器规范的矛盾**，不是某个字符串：
 * nonce 与 `'unsafe-inline'` 在 `script-src` 里互斥（见 `CspPolicy` 注释）。
 * 一旦两条同时出现，`'unsafe-inline'` 会被静默忽略 —— 测试不报错、构建不报错、
 * 线上地图白屏，排查成本极高。所以把矛盾本身写成断言。
 */
const NONCE = 'TESTNONCE1234567890abcdef=';

function cspFor(policy: 'strict' | 'amap', nonce: string | null = NONCE): string {
  const response = applySecurityHeaders(new Response(), { policy, nonce });
  const value = response.headers.get('Content-Security-Policy');
  if (value === null) throw new Error('CSP header missing');
  return value;
}

/**
 * `buildCsp` 是导出给 middleware 用的：Next 渲染层靠**请求头**里的 CSP 解析 nonce。
 * 这层如果只测「响应头」，就漏掉了线上整站无 JS 的那个故障 —— 本地 `next start`
 * 会替 middleware 把响应头桥接成请求头，本地永远测不出来，只有部署后才暴露。
 */
describe('buildCsp 供 middleware 写入请求头', () => {
  it('strict 策略的 CSP 里带 nonce，Next 才能据此给 script 打 nonce 属性', () => {
    const csp = buildCsp({ policy: 'strict', nonce: NONCE });
    expect(csp).toContain(`'nonce-${NONCE}'`);
  });

  it('amap 策略不含 nonce，避免让 Next 打一个对不上 unsafe-inline 的 nonce 属性', () => {
    expect(buildCsp({ policy: 'amap', nonce: null })).not.toContain('nonce-');
  });

  it('响应头与请求头用的是同一个函数，两份策略不可能漂移', () => {
    for (const policy of ['strict', 'amap'] as const) {
      const context = { policy, nonce: policy === 'strict' ? NONCE : null } as const;
      expect(buildCsp(context)).toBe(cspFor(policy, context.nonce));
    }
  });
});

/** 取某条指令的完整取值（含它后面的多个 source）。 */
function directive(csp: string, name: string): string {
  const found = csp.split('; ').find((part) => part === name || part.startsWith(`${name} `));
  if (found === undefined) throw new Error(`directive ${name} not found in: ${csp}`);
  return found;
}

describe('cspPolicyForPath', () => {
  it('地图页走 amap 策略，其余走 strict', () => {
    expect(cspPolicyForPath('/map')).toBe('amap');
    expect(cspPolicyForPath('/map/')).toBe('amap');
    expect(cspPolicyForPath('/map/nanjing')).toBe('amap');
    expect(cspPolicyForPath('/')).toBe('strict');
    expect(cspPolicyForPath('/places/qinhuai')).toBe('strict');
  });

  // 忘了加斜杠：`/mapillary` 这类前缀同名路由会被误判成地图页，
  // 结果是全站范围的 CSP 静默降级 —— 必须挡住。
  it('只匹配路径段，不做前缀匹配', () => {
    expect(cspPolicyForPath('/mapillary')).toBe('strict');
    expect(cspPolicyForPath('/maps')).toBe('strict');
    expect(cspPolicyForPath('/mapi/foo')).toBe('strict');
  });
});

describe('strict 策略', () => {
  it('带 nonce 与 strict-dynamic，且不给脚本 unsafe-inline', () => {
    const scriptSrc = directive(cspFor('strict'), 'script-src');
    expect(scriptSrc).toContain(`'nonce-${NONCE}'`);
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('仍保留高德域名作为老浏览器回退', () => {
    expect(directive(cspFor('strict'), 'script-src')).toContain('https://webapi.amap.com');
  });
});

describe('amap 策略（地图页）', () => {
  it('必须彻底去掉 nonce —— 否则 unsafe-inline 会被浏览器忽略', () => {
    const csp = cspFor('amap');
    const scriptSrc = directive(csp, 'script-src');
    expect(scriptSrc).not.toContain('nonce-');
    expect(scriptSrc).not.toContain("'strict-dynamic'");
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'unsafe-eval'");
  });

  it('放行高德脚本域名与 blob worker', () => {
    const csp = cspFor('amap');
    expect(directive(csp, 'script-src')).toContain('https://webapi.amap.com');
    expect(directive(csp, 'worker-src')).toContain('blob:');
  });

  it('瓦片与数据域名仍然精确列举，不放开 https:', () => {
    const csp = cspFor('amap');
    expect(directive(csp, 'img-src')).toContain('https://*.amap.com');
    expect(directive(csp, 'connect-src')).toContain('https://*.autonavi.com');
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
  });

  it('即便调用方误传 nonce，amap 策略也不会把它写进 script-src', () => {
    // middleware 正常路径在 /map 上不下发 x-nonce；但这里是第二道闸：
    // 就算有人改坏 middleware 传了 nonce，CSP 这层也不会重新引入矛盾。
    const csp = cspFor('amap', NONCE);
    const scriptSrc = directive(csp, 'script-src');
    expect(scriptSrc).not.toContain('nonce-');
    expect(scriptSrc).toContain("'unsafe-inline'");
  });
});

describe('API 源注入', () => {
  const original = process.env.NEXT_PUBLIC_API_BASE_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = original;
  });

  it('配置了外部 API 时补进 img-src 与 connect-src', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com/v1/';
    const csp = cspFor('amap');
    expect(directive(csp, 'img-src')).toContain('https://api.example.com');
    expect(directive(csp, 'connect-src')).toContain('https://api.example.com');
  });

  it('URL 非法时不得把原始字符串塞进 CSP', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'not a url';
    const csp = cspFor('amap');
    expect(csp).not.toContain('not a url');
  });
});
