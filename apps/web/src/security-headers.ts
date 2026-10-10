/**
 * 安全响应头中间件（P4-04 / P4-07）。
 *
 * 技术方案 §8：「Helmet、安全响应头、严格 CSP、Referrer-Policy、
 * Permissions-Policy；生产环境关闭 Swagger 或置于管理员认证后。」
 *
 * 设计要点：
 *   - CSP 用 `frame-ancestors` 而不是 `X-Frame-Options`：能覆盖现代浏览器，
 *     且能同时拒绝自己被嵌套（`SAMEORIGIN`）。X-Frame-Options 作为
 *     老浏览器回退同时保留。
 *   - `unsafe-inline` 只保留给样式；脚本不给 inline —— 内容正文里的
 *     Tiptap JSON 走 `renderTiptapToSafeHtml` 生成**已转义** HTML，
 *     不需要 inline script。Next.js 自己注入的 bootstrap script 由
 *     nonce 机制处理，这里用 `strict-dynamic` 放行已加载的 bundle。
 *   - CSP **不在 `default-src` 里放开 `https:`** —— 那等于放弃 CSP。
 *     地图瓦片需要外域，走 `img-src`/`connect-src` 精确列举。
 */

/**
 * 两套 CSP 策略。
 *
 * `strict` —— nonce + `strict-dynamic`，不给脚本 `unsafe-inline`。
 *   全站默认，除地图页外都用这套。
 *
 * `amap` —— 高德 JS API 专用，**放弃 nonce**。
 *
 * ## 为什么高德页必须放弃 nonce（不是"再加个域名"就能修）
 *
 * CSP 里有两条规则互相咬死，高德 JS API 2.0 两条都踩：
 *
 * 1. `'strict-dynamic'` 一旦出现，浏览器就**关闭基于 host 的白名单**
 *    （报错原文：「Note that 'strict-dynamic' is present, so host-based
 *    allowlisting is disabled」）。高德主脚本是 `amap-loader.ts` 用
 *    `document.createElement('script')` 动态插入的，**不可能带上我们
 *    每请求随机生成的 nonce** → 被拦。
 * 2. `script-src` 里只要出现 nonce 或 hash，浏览器就**忽略
 *    `'unsafe-inline'`**。高德主脚本跑起来后会继续注入自己的 inline
 *    script（插件加载、能力协商），这些既没有 nonce 也没有 hash → 被拦。
 *
 * 即：**nonce/strict-dynamic 与高德在设计上互斥**。唯一的出路是这个
 * 路由放弃 nonce 机制，改用 `'unsafe-inline'`。这也正是高德官方与社区
 * 通用解法（`script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:
 * https://webapi.amap.com`）的形态。
 *
 * ## 风险边界
 *
 * `amap` 策略只作用在 `/map`，不是全站 —— 其余页面保留 nonce 保护。
 * 该页放弃的是"注入 HTML 即可执行内联脚本"这层防护，
 * 因此输入净化 / DTO 白名单 / 正文安全渲染一条都不能松（AGENTS.md §4）。
 * 真要收回，只能换掉高德（无自托管 SDK），属架构变更，需 ADR + 人工批准。
 */
export type CspPolicy = 'strict' | 'amap';

/** 会加载高德 JS API 的路由前缀（单一事实来源）。 */
export const AMAP_ROUTE_PREFIX = '/map';

/**
 * 路径 → CSP 策略。
 *
 * 若日后把地图挂到别的页面（例如 `/places` 内嵌小地图），
 * **必须**同步改这里，否则那个页面会以"地图静默白屏 + 控制台红字"的
 * 形式回归 —— CSP 拦截发生在浏览器里，应用层拿不到异常。
 */
export function cspPolicyForPath(pathname: string): CspPolicy {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return normalized === AMAP_ROUTE_PREFIX || normalized.startsWith(`${AMAP_ROUTE_PREFIX}/`)
    ? 'amap'
    : 'strict';
}

export interface SecurityHeadersContext {
  /**
   * 每请求随机 nonce。`null` 表示本次响应**不使用** nonce 机制 ——
   * 此时 `script-src` 里不能出现 nonce，否则 `'unsafe-inline'` 会被忽略。
   */
  readonly nonce: string | null;
  readonly policy: CspPolicy;
}

export function applySecurityHeaders(
  response: Response,
  context: SecurityHeadersContext,
): Response {
  // 生产才发 HSTS：本地与预览环境发 HSTS 会把开发者浏览器锁死在 https
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');

  // 管理后台需要 iframe 嵌入吗？技术方案未要求。默认 DENY。
  response.headers.set('Content-Security-Policy', buildCsp(context));

  // Permissions-Policy：默认全部关闭，只放行同源需要的。
  response.headers.set(
    'Permissions-Policy',
    [
      'accelerometer=()',
      'camera=()',
      'geolocation=(self)',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
    ].join(', '),
  );

  // 公开站是只读内容站，跨源资源（瓦片、字体）不需要 Referrer 泄漏路径
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  return response;
}

/**
 * 底图瓦片与数据源域名（ADR-0003）。
 *
 * 渲染改用 Leaflet + OSM 瓦片后，取图域名从高德变成 OSM；
 * 高德只剩「数据」职责（地理编码），仍需放行其脚本与接口域名。
 *
 * 分开列是因为两者用途不同，混在一起会让"为什么要放行这个域名"无法回答：
 * - `tile.openstreetmap.org` —— 底图瓦片（Leaflet 用 `<img>` 拉，故走 `img-src`）
 * - `*.amap.com` / `*.autonavi.com` —— 高德地理编码的脚本与接口
 *
 * ⚠️ 漏掉 `img-src` 里的 OSM 域名，底图会**静默空白**：脚本正常、marker 正常、
 * 地图容器正常，唯独没有瓦片 —— 很容易误判成"坐标错了"或"Leaflet 没生效"。
 */
const OSM_TILE_SOURCES = ['https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'];
const AMAP_CONNECT_SOURCES = ['https://*.amap.com', 'https://*.autonavi.com'];
const AMAP_IMG_SOURCES = ['https://*.amap.com', 'https://*.autonavi.com'];
const AMAP_HOST_SOURCES = [
  'https://webapi.amap.com',
  'https://*.amap.com',
  'https://*.autonavi.com',
];

/**
 * 构造 CSP。
 *
 * `strict` 策略下 `nonce` 由 middleware 生成并透传给 Next（见 `src/middleware.ts`）。
 * `'strict-dynamic'` 没有 nonce 就等于把 `'self'` 也废掉 ——
 * 页面会退化成纯 SSR 静态 HTML，客户端完全不水合。
 *
 * `NEXT_PUBLIC_API_BASE_URL` 若配置了外部源，必须加进 `connect-src` /
 * `img-src`；否则对应请求被 CSP 拒掉（表现为"无法连接地点接口"的降级提示，
 * 属于功能回归而非安全增强）。
 */
export function buildCsp(context: SecurityHeadersContext): string {
  // API 源必须放行：web 与 API 通常不同源（本地 3111 vs 4000），
  // 地图页的 bbox / 搜索请求都是浏览器直接 fetch 绝对地址。
  // 漏掉它 → 浏览器拒连 → 地图降级成"无法连接地点接口"，
  // 平移/缩放/关键词筛选全部失效，只剩首屏 SSR 数据。
  const apiOrigin = safeOrigin(process.env.NEXT_PUBLIC_API_BASE_URL ?? '');

  const imgSources = ["'self'", 'data:', 'blob:', ...OSM_TILE_SOURCES, ...AMAP_IMG_SOURCES];
  const connectSources = ["'self'", ...OSM_TILE_SOURCES, ...AMAP_CONNECT_SOURCES];

  if (apiOrigin !== null) {
    // 图片也可能来自 API（媒体 URL），一并放行
    imgSources.push(apiOrigin);
    connectSources.push(apiOrigin);
  }

  const directives = [
    "default-src 'self'",
    buildScriptSrc(context),
    // 样式：Next.js 的样式注入需要 inline；字体走 self
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src ${imgSources.join(' ')}`,
    `connect-src ${connectSources.join(' ')}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  if (context.policy === 'amap') {
    // 高德 WebGL 用 blob: worker 渲染瓦片。`worker-src` 未显式声明时会
    // 回落到 child-src → default-src 'self'，blob: 被拒 → 只剩空容器。
    directives.push("worker-src 'self' blob:");
  }

  return directives.join('; ');
}

/** 拼 `script-src`。两套策略互斥，不能混用 —— 原因见 `CspPolicy` 的注释。 */
function buildScriptSrc(context: SecurityHeadersContext): string {
  if (context.policy === 'amap') {
    return [
      "script-src 'self'",
      // 高德自己注入的 inline script（插件加载 / 能力协商）拿不到我们的
      // nonce。只要 script-src 里有 nonce 或 hash，浏览器就忽略
      // 'unsafe-inline' —— 所以这里必须**彻底不带 nonce**。
      "'unsafe-inline'",
      // 同 buildCsp 注释：高德 `window._jsload_` 对字符串求值，去掉即灰屏。
      "'unsafe-eval'",
      'blob:',
      'data:',
      ...AMAP_HOST_SOURCES,
    ].join(' ');
  }

  return [
    "script-src 'self'",
    // nonce 必须存在：'strict-dynamic' 没有 nonce 会把 'self' 也废掉。
    // 有 nonce 时 CSP3 浏览器信任带该 nonce 的脚本及其动态加载的后代；
    // 不支持 CSP3 的老浏览器回落 'self' + 高德域名白名单。
    //
    // ⚠️ `'unsafe-eval'` 在**生产也必须保留**，这不是偷懒，是高德 2.0 的硬要求。
    // 实测（真实浏览器 + 真实 Key）：高德插件加载器
    // `jsapi-service.amap.com/mapsplugincdn` 的 `window._jsload_` 内部对字符串求值，
    // CSP 不给 `unsafe-eval` 时直接抛 EvalError，表现为 **WebGLRender is not a constructor**，
    // 底图一片灰、控制台两条红 —— 而所有网络请求都是 200，极易误判成"Key 有问题"。
    //
    // 残余风险与边界：放开 `unsafe-eval` 只放宽"能否 eval 字符串"，
    // **不放宽脚本来源**（nonce + strict-dynamic 仍在），`unsafe-inline` 也没有给脚本。
    // 即前提仍是"先有 XSS 才能利用"，但相比 strict CSP 这条前提被削弱了 ——
    // 因此 §4 的输入净化、DTO 白名单、正文安全渲染一条都不能松。
    // 若日后要收回，需换掉高德（自托管 SDK 不存在），属架构变更，需 ADR + 人工批准。
    ...(context.nonce === null ? [] : [`'nonce-${context.nonce}'`]),
    "'unsafe-eval'",
    // 仅作为不支持 CSP3 的老浏览器回退；在支持 strict-dynamic 的浏览器上
    // host 白名单被浏览器忽略，主脚本能加载靠的是 nonce + strict-dynamic。
    "'strict-dynamic'",
    'https://webapi.amap.com',
  ].join(' ');
}

/** 从 URL 取 origin；解析失败返回 null（而不是把原始字符串塞进 CSP）。 */
function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
