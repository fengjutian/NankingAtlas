import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as GeocodeModule from './geocode.js';

/**
 * 地理编码的**可测边界**（ADR-0003：高德提供数据的入口）。
 *
 * 这里只覆盖不碰网络就能判定的分支。真正调用高德的路径由 E2E / 人工验证 ——
 * 单测里 mock 一个"永远返回 ok"的 SDK，只会证明 mock 能跑通。
 *
 * ⚠️ 为什么用**动态 import**：被测模块在顶层被静态 import 时就已经把
 * `./amap-config` 绑定好了，之后再 `vi.doMock` 对它无效（已实测踩过：
 * 断言拿到的是真实配置的 `unavailable` 分支，而不是 mock 的返回）。
 * 所以每次都先 mock、再 `await import()`，让模块在 mock 生效后重新求值。
 */

/** 高德返回的 POI 形状（与 amap-sdk.ts 对齐）。 */
function poi(
  lng: number,
  lat: number,
): { location: { lng: number; lat: number }; address: string } {
  return { location: { lng, lat }, address: '示例地址（待核验）' };
}

/** 让 `./amap-config` 返回「已配置」。 */
function mockConfigured(): void {
  vi.doMock('./amap-config', () => ({
    resolveAmapConfig: () => ({ ok: true, key: 'k'.repeat(32), securityJsCode: null }),
  }));
}

/** 让 `./amap-config` 返回「未配置 Key」。 */
function mockMissingKey(): void {
  vi.doMock('./amap-config', () => ({
    resolveAmapConfig: () => ({ ok: false, reason: 'missing_key' }),
  }));
}

/**
 * 一次性组合：配置状态 + Geocoder 回放，然后取一份全新的被测模块。
 *
 * ⚠️ 两个 doMock 都必须在 `import('./geocode.js')` **之前**注册：
 * 被测模块顶层会把 `./amap-loader` 一起求值，之后再 mock 对它无效。
 */
async function loadGeocode(input: {
  readonly configured: boolean;
  readonly status: string;
  readonly pois: readonly unknown[];
}): Promise<typeof GeocodeModule.geocodeAddress> {
  vi.resetModules();
  if (input.configured) {
    mockConfigured();
  } else {
    mockMissingKey();
  }
  // 不用 async：这里没有 await，`require-await` 会拦下无意义的 async。
  vi.doMock('./amap-loader', () => ({
    loadAmap: () =>
      Promise.resolve({
        Geocoder: class {
          search(
            _address: string,
            _options: { city?: string },
            callback: (s: string, r: { pois?: unknown }) => void,
          ): void {
            callback(input.status, { pois: input.pois });
          }
        },
      }),
  }));
  const { geocodeAddress } = await import('./geocode.js');
  return geocodeAddress;
}

beforeEach(() => {
  vi.resetModules();
});

describe('geocodeAddress', () => {
  it('空地址直接判未找到，不去打高德', async () => {
    const geocodeAddress = await loadGeocode({
      configured: true,
      status: 'complete',
      pois: [poi(118.7885, 32.0225)],
    });
    const result = await geocodeAddress('   ', '南京');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('not_found');
  });

  it('未配置高德 Key 时判为 unavailable', async () => {
    const geocodeAddress = await loadGeocode({ configured: false, status: 'complete', pois: [] });
    const result = await geocodeAddress('夫子庙', '南京');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    // 区分「运维没配 Key」与「用户输入没查到」：处理方式完全不同。
    expect(result.reason).toBe('unavailable');
    expect(result.message).toContain('高德');
  });

  it('高德返回非 complete 状态时视为未找到（不编造结果）', async () => {
    const geocodeAddress = await loadGeocode({ configured: true, status: 'no_data', pois: [] });
    const result = await geocodeAddress('不存在的地方', '南京');
    expect(result.ok).toBe(false);
  });

  it('坐标已转为 WGS-84：与高德原值不同，且偏移在几百米量级', async () => {
    const geocodeAddress = await loadGeocode({
      configured: true,
      status: 'complete',
      pois: [poi(118.7885, 32.0225)],
    });
    const result = await geocodeAddress('夫子庙', '南京');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');

    // ⚠️ 核心断言：返回值必须已被 GCJ-02 → WGS-84 转换。
    // 漏掉转换时点位会偏约 300 米，而且**不会报任何错**。
    expect(result.point.lon).not.toBe(118.7885);
    expect(Math.abs(result.point.lon - 118.7885)).toBeLessThan(0.01);
    expect(Math.abs(result.point.lat - 32.0225)).toBeLessThan(0.01);
    expect(result.point.lon).toBeGreaterThan(118);
    expect(result.point.lon).toBeLessThan(119);
  });

  it('POI 缺少合法 location 时跳过，不返回 NaN 坐标', async () => {
    const geocodeAddress = await loadGeocode({
      configured: true,
      status: 'complete',
      pois: [{ location: { lng: 'x', lat: null }, address: '' }],
    });
    const result = await geocodeAddress('奇怪的地方', '南京');
    expect(result.ok).toBe(false);
  });

  it('高德脚本加载失败时降级为 unavailable，不抛异常', async () => {
    vi.resetModules();
    mockConfigured();
    vi.doMock('./amap-loader', () => ({
      loadAmap: () => Promise.reject(new Error('script blocked by CSP')),
    }));
    const { geocodeAddress } = await import('./geocode.js');
    const result = await geocodeAddress('夫子庙', '南京');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('unavailable');
  });
});
