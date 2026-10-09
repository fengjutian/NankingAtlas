// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AmapLoadError, loadAmap, resetAmapLoaderForTests } from './amap-loader';

import type { ResolvedAmapConfig } from './amap-config';

/**
 * 高德脚本加载器单测。
 *
 * 这一层的失败模式全是**静默**的：脚本被 CSP 拦、被扩展拦、Key 被拒时，
 * 页面上只是没有地图，控制台信息又指向不到根因。因此这里逐条钉住
 * "什么时候 reject、reject 成什么、失败后还能不能重试"。
 */
describe('loadAmap', () => {
  const CONFIG: ResolvedAmapConfig = {
    key: 'a'.repeat(32),
    securityJsCode: 'b'.repeat(32),
  };

  let appended: HTMLScriptElement[] = [];
  let securityAtAppend: (string | undefined)[] = [];

  beforeEach(() => {
    resetAmapLoaderForTests();
    appended = [];
    securityAtAppend = [];
    delete window.AMap;
    delete window._AMapSecurityConfig;

    // 拦截插入点：jsdom 默认不加载外部脚本，这里只记录并保留我们手动触发事件的能力。
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      appended.push(node as HTMLScriptElement);
      securityAtAppend.push(window._AMapSecurityConfig?.securityJsCode);
      return node;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.AMap;
    delete window._AMapSecurityConfig;
    resetAmapLoaderForTests();
  });

  it('安全配置在插入脚本**之前**就已经存在（顺序反了会白屏）', async () => {
    const pending = loadAmap(CONFIG);
    expect(appended).toHaveLength(1);
    // 这就是官方文档反复强调的那一行：必须在插 script 之前赋值。
    expect(securityAtAppend[0]).toBe(CONFIG.securityJsCode);

    window.AMap = { Map: class {}, Marker: class {}, Pixel: class {} } as never;
    appended[0]?.dispatchEvent(new Event('load'));
    await pending;
  });

  it('脚本地址带 v=2.0 与 key', async () => {
    const pending = loadAmap(CONFIG);
    const src = appended[0]?.src ?? '';
    expect(src).toContain('https://webapi.amap.com/maps');
    expect(src).toContain('v=2.0');
    expect(src).toContain(`key=${CONFIG.key}`);
    expect(appended[0]?.id).toBe('nanking-atlas-amap-sdk');

    window.AMap = { Map: class {}, Marker: class {}, Pixel: class {} } as never;
    appended[0]?.dispatchEvent(new Event('load'));
    await pending;
  });

  it('脚本 load 且挂上 AMap → resolve', async () => {
    const pending = loadAmap(CONFIG);
    window.AMap = { Map: class {}, Marker: class {}, Pixel: class {} } as never;
    appended[0]?.dispatchEvent(new Event('load'));
    await expect(pending).resolves.toBe(window.AMap);
  });

  it('脚本 error（CSP 拦截 / 断网）→ reject script_error 并移除 script', async () => {
    const pending = loadAmap(CONFIG);
    appended[0]?.dispatchEvent(new Event('error'));
    await expect(pending).rejects.toMatchObject({ reason: 'script_error' });
    expect(document.getElementById('nanking-atlas-amap-sdk')).toBeNull();
  });

  it('脚本 load 但没有挂上 AMap（Key 被拒的典型表现）→ reject script_error', async () => {
    const pending = loadAmap(CONFIG);
    appended[0]?.dispatchEvent(new Event('load'));
    // window.AMap 仍然 undefined —— 高德对无效 Key 就是"加载成功但没有全局对象"
    await expect(pending).rejects.toBeInstanceOf(AmapLoadError);
  });

  it('并发调用共享同一次加载，不重复插 script（重复加载会覆盖 window.AMap）', async () => {
    const a = loadAmap(CONFIG);
    const b = loadAmap(CONFIG);
    expect(appended).toHaveLength(1);

    window.AMap = { Map: class {}, Marker: class {}, Pixel: class {} } as never;
    appended[0]?.dispatchEvent(new Event('load'));
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb);
  });

  it('已经加载过时直接返回，不插第二个 script', async () => {
    const existing = { Map: class {}, Marker: class {}, Pixel: class {} } as never;
    window.AMap = existing;
    await expect(loadAmap(CONFIG)).resolves.toBe(existing);
    expect(appended).toHaveLength(0);
  });

  it('失败后清空缓存，retry 能重新插入（否则一次抖动会让地图永久不可用）', async () => {
    const first = loadAmap(CONFIG);
    appended[0]?.dispatchEvent(new Event('error'));
    await expect(first).rejects.toMatchObject({ reason: 'script_error' });

    const second = loadAmap(CONFIG);
    expect(appended).toHaveLength(2);

    window.AMap = { Map: class {}, Marker: class {}, Pixel: class {} } as never;
    appended[1]?.dispatchEvent(new Event('load'));
    await expect(second).resolves.toBe(window.AMap);
  });

  it('拦截器只让请求发出、不触发 error 时，靠超时兜底而不是永远挂起', async () => {
    vi.useFakeTimers();
    try {
      const pending = loadAmap(CONFIG);
      const assertion = expect(pending).rejects.toMatchObject({ reason: 'timeout' });
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
