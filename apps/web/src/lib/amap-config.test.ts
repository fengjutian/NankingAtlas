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

  it('只有 Key、没 jscode → 仍然 ok，securityJsCode 为 null', () => {
    // 实测结论：配了 Key 不配 jscode，底图完全正常渲染。
    // 因此 jscode **不能**成为硬性前置，否则等于白拿一张能用的地图换一张灰屏。
    // 代价是地理编码/路径规划等 Web 服务不可用 —— 本项目一条都不用。
    process.env.NEXT_PUBLIC_AMAP_KEY = KEY;
    expect(resolveAmapConfig()).toEqual({ ok: true, key: KEY, securityJsCode: null });
  });

  it('jscode 形状不合法时按"未配置"处理，而不是让整个地图降级', () => {
    // jscode 是可选增强项，它坏了不该连累底图。
    for (const bad of ['short', `"${JSCODE}"`, `${JSCODE}\\`]) {
      process.env.NEXT_PUBLIC_AMAP_KEY = KEY;
      process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE = bad;
      expect(resolveAmapConfig()).toEqual({ ok: true, key: KEY, securityJsCode: null });
    }
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
    for (const reason of ['missing_key'] as const) {
      expect(AMAP_CONFIG_HINTS[reason].length).toBeGreaterThan(0);
    }
  });

  it('脚本地址固定为高德官方域名', () => {
    expect(AMAP_SCRIPT_ORIGIN).toBe('https://webapi.amap.com');
  });
});
