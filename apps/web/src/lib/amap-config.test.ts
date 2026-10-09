import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AMAP_CONFIG_HINTS, AMAP_SCRIPT_ORIGIN, resolveAmapConfig } from './amap-config';

/**
 * 高德接入配置单测。
 *
 * 这一层是 **fail-closed** 的：配置不完整必须让地图降级成纯列表，
 * 而不是"带病加载"。反过来也必须成立 —— 配置完整时**不能**被误判为缺失，
 * 否则线上地图会静默消失，而日志里什么线索都没有。
 */
describe('resolveAmapConfig', () => {
  const KEY = 'a'.repeat(32);
  const JSCODE = 'b'.repeat(32);

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_AMAP_KEY;
    delete process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AMAP_KEY;
    delete process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;
  });

  it('Key 与 jscode 都在时返回配置', () => {
    process.env.NEXT_PUBLIC_AMAP_KEY = KEY;
    process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE = JSCODE;
    expect(resolveAmapConfig()).toEqual({ ok: true, key: KEY, securityJsCode: JSCODE });
  });

  it('两者都未配置 → missing_key', () => {
    expect(resolveAmapConfig()).toEqual({ ok: false, reason: 'missing_key' });
  });

  it('空串等价于未配置（与仓库既有 env 约定一致）', () => {
    process.env.NEXT_PUBLIC_AMAP_KEY = '';
    process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE = JSCODE;
    expect(resolveAmapConfig()).toEqual({ ok: false, reason: 'missing_key' });
  });

  it('有 Key 无 jscode → missing_security_code（2.0 缺它会白屏）', () => {
    process.env.NEXT_PUBLIC_AMAP_KEY = KEY;
    expect(resolveAmapConfig()).toEqual({ ok: false, reason: 'missing_security_code' });
  });

  it('有 jscode 无 Key → missing_key（不因为"有一个就当配好了"）', () => {
    process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE = JSCODE;
    expect(resolveAmapConfig()).toEqual({ ok: false, reason: 'missing_key' });
  });

  it('首尾空白被裁掉，不会变成"看起来配了其实没配"', () => {
    process.env.NEXT_PUBLIC_AMAP_KEY = `  ${KEY}  `;
    process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE = `\t${JSCODE}\n`;
    const result = resolveAmapConfig();
    expect(result).toEqual({ ok: true, key: KEY, securityJsCode: JSCODE });
  });

  it('明显不是凭据的值被拒（过短 / 含引号 / 含反斜杠）', () => {
    for (const bad of ['short', `"${KEY}"`, `${KEY}\\`, `${KEY}'`]) {
      process.env.NEXT_PUBLIC_AMAP_KEY = bad;
      process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE = JSCODE;
      expect(resolveAmapConfig()).toEqual({ ok: false, reason: 'missing_key' });
    }
  });

  it('长度放宽到 64 位：格式变更不会让线上地图整体失效', () => {
    const longKey = 'c'.repeat(64);
    process.env.NEXT_PUBLIC_AMAP_KEY = longKey;
    process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE = JSCODE;
    expect(resolveAmapConfig()).toEqual({ ok: true, key: longKey, securityJsCode: JSCODE });
  });

  it('每种失败原因都有可操作的说明', () => {
    for (const reason of ['missing_key', 'missing_security_code'] as const) {
      expect(AMAP_CONFIG_HINTS[reason].length).toBeGreaterThan(0);
    }
    // 漏配 jscode 最容易被误判成"Key 无效"，提示必须点名变量名。
    expect(AMAP_CONFIG_HINTS.missing_security_code).toContain('NEXT_PUBLIC_AMAP_SECURITY_CODE');
  });

  it('脚本地址固定为高德官方域名', () => {
    expect(AMAP_SCRIPT_ORIGIN).toBe('https://webapi.amap.com');
  });
});
