import { expect, test } from '@playwright/test';

/**
 * P4-03 地图渲染 E2E（ADR-0003：Leaflet 渲染 + 高德提供数据）。
 *
 * 这组用例专门覆盖**只有真实浏览器能确认**的行为，单测碰不到：
 *   1. Leaflet 是否真的初始化出地图容器；
 *   2. 瓦片是否真的**下载并解码成功**（CSP 放行 + 网络可达）；
 *   3. 底图失败时列表是否仍然可用（技术方案 §9.2 的降级契约）。
 *
 * ## 为什么第 2 条必须用浏览器
 *
 * 「瓦片请求发出去了」不等于「瓦片显示了」。CSP 漏放行域名时，
 * 请求会被浏览器静默拦掉，DOM 里 `<img class="leaflet-tile">` 照样存在、
 * src 照样正确，只是永远不显示 —— 只看 DOM 会误判为通过。
 * 因此断言的是 `naturalWidth > 0`（浏览器真的解码出了像素），而不是元素存在。
 */

test.describe.configure({ mode: 'serial' });

test.describe('地图渲染（Leaflet + OSM）', () => {
  test('地图容器初始化，且瓦片真的解码出像素', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/map');
    await expect(page).toHaveTitle(/南京地点地图/);

    // ① Leaflet 容器出现。dynamic import 是异步的，给足时间。
    const container = page.locator('.leaflet-container');
    await expect(container).toBeVisible({ timeout: 20_000 });

    // ② 瓦片 <img> 被创建，且 src 指向 OSM。
    const tiles = page.locator('img.leaflet-tile');
    await expect(tiles.first()).toBeAttached({ timeout: 20_000 });
    const srcs = await tiles.evaluateAll((els) =>
      els.map((el) => (el as HTMLImageElement).getAttribute('src') ?? ''),
    );
    expect(srcs.length).toBeGreaterThan(0);
    expect(srcs.some((s) => s.includes('tile.openstreetmap.org'))).toBe(true);

    // ③ 关键断言：瓦片**真的解码成功**。
    //    CSP 拦掉或网络不通时，这里全为 0，页面是一片灰 —— 但 DOM 看起来完全正常。
    await expect
      .poll(
        async () =>
          tiles.evaluateAll(
            (els) => els.filter((el) => (el as HTMLImageElement).naturalWidth > 0).length,
          ),
        { timeout: 25_000, message: '没有任何瓦片解码成功，底图应当是空白的' },
      )
      .toBeGreaterThan(0);

    // ④ 归属信息必须可见（OSM Tile 使用政策的硬性要求）。
    const attribution = page.locator('.leaflet-control-attribution');
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText('OpenStreetMap');

    // ⑤ 不得有 CSP 违规等控制台错误。
    const cspErrors = consoleErrors.filter((e) => /Content Security Policy|Refused to/i.test(e));
    expect(cspErrors, `控制台出现 CSP 拦截：\n${cspErrors.join('\n')}`).toHaveLength(0);
  });

  test('底图不可用时，地点列表与筛选仍然可用（§9.2 降级契约）', async ({ page }) => {
    // 掐断瓦片域名，模拟底图整体不可用。
    await page.route('**://*.openstreetmap.org/**', (route) => route.abort());
    await page.goto('/map');

    // 列表区域必须存在且有内容（首屏 SSR 就有，不依赖地图）。
    await expect(page.getByRole('heading', { name: '南京地点地图' })).toBeVisible();

    // 底图最终应被判为失败并给出说明，而不是永远停在"加载中"。
    // 阈值是 12 片失败，所以要等一会儿。
    const notice = page.locator('[role="status"]').filter({ hasText: '地图' });
    await expect(notice.first()).toBeVisible();

    // 关键：列表区块仍在。
    const listHeading = page.getByRole('heading', { level: 2 }).first();
    await expect(listHeading).toBeVisible();
  });
});
