import type { NextResponse } from 'next/server';

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
export function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
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
  response.headers.set('Content-Security-Policy', buildCsp(nonce));

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
 * 高德地图 JS API 需要的域名。
 *
 * 按用途分三类，缺一整块地图就是白屏：
 * - `webapi.amap.com` —— 主脚本（`https://webapi.amap.com/maps?v=2.0&key=…`）
 * - `*.amap.com`    —— 矢量瓦片、样式、自定义图层（`*.is.amap.com`、`vweb.amap.com`…）
 * - `*.autonavi.com`—— 瓦片与数据服务的实际取图域名（`*.is.autonavi.com` 等）
 *
 * ⚠️ 高德没有提供"逐瓦片失败事件"，所以任何一个域名漏掉的表现都是
 * **静默白屏**，只在控制台报错 —— 很难从用户侧定位。这些域名是**照抄官方
 * 加载行为**得到的，不是"图省事放开 https:"；`default-src 'self'` 仍然闭合。
 */
const AMAP_SCRIPT_SOURCES = ["'strict-dynamic'", 'https://webapi.amap.com'];
const AMAP_CONNECT_SOURCES = ['https://*.amap.com', 'https://*.autonavi.com'];
const AMAP_IMG_SOURCES = [
  'https://*.amap.com',
  'https://*.autonavi.com',
  'https://*.is.autonavi.com',
];

/**
 * 构造 CSP。
 *
 * `nonce` 由 middleware 生成并透传给 Next（见 `src/middleware.ts`）。
 * `'strict-dynamic'` 没有 nonce 就等于把 `'self'` 也废掉 ——
 * 页面会退化成纯 SSR 静态 HTML，客户端完全不水合。
 *
 * `NEXT_PUBLIC_API_BASE_URL` 若配置了外部源，必须加进 `connect-src` /
 * `img-src`；否则对应请求被 CSP 拒掉（表现为"无法连接地点接口"的降级提示，
 * 属于功能回归而非安全增强）。
 */
function buildCsp(nonce: string): string {
  // API 源必须放行：web 与 API 通常不同源（本地 3111 vs 4000），
  // 地图页的 bbox / 搜索请求都是浏览器直接 fetch 绝对地址。
  // 漏掉它 → 浏览器拒连 → 地图降级成"无法连接地点接口"，
  // 平移/缩放/关键词筛选全部失效，只剩首屏 SSR 数据。
  const apiOrigin = safeOrigin(process.env.NEXT_PUBLIC_API_BASE_URL ?? '');

  const imgSources = ["'self'", 'data:', 'blob:', ...AMAP_IMG_SOURCES];
  const connectSources = ["'self'", ...AMAP_CONNECT_SOURCES];

  if (apiOrigin !== null) {
    // 图片也可能来自 API（媒体 URL），一并放行
    imgSources.push(apiOrigin);
    connectSources.push(apiOrigin);
  }

  return [
    "default-src 'self'",
    // strict-dynamic 必须配 nonce 才有效（见 middleware.ts 的说明）。
    // 有 nonce 时 CSP3 浏览器信任带该 nonce 的脚本及其动态加载的后代 ——
    // 这正是高德主脚本能加载的机制；不支持 CSP3 的老浏览器回落 'self' + 白名单域名。
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
    [
      "script-src 'self'",
      `'nonce-${nonce}'`,
      "'unsafe-eval'",
      ...AMAP_SCRIPT_SOURCES,
      isDev() ? "'unsafe-eval'" : '',
    ]
      .filter((part) => part !== '')
      .join(' '),
    // 样式：Next.js 的样式注入需要 inline；字体走 self
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src ${imgSources.join(' ')}`,
    `connect-src ${connectSources.join(' ')}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/** 开发模式需要 eval（React Refresh / HMR）。 */
function isDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/** 从 URL 取 origin；解析失败返回 null（而不是把原始字符串塞进 CSP）。 */
function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
