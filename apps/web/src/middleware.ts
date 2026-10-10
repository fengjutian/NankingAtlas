import { NextResponse, type NextRequest } from 'next/server';

import { applySecurityHeaders, cspPolicyForPath } from '@/security-headers';

/**
 * 生成 CSP nonce。
 *
 * 用 **Web Crypto**（`crypto.getRandomValues`）而不是 `node:crypto`：
 * middleware 跑在 Edge Runtime，webpack 不允许 `node:*` 内建模块进 bundle。
 * Web Crypto 在 Edge、Node 18+、现代浏览器都有，且 `getRandomValues` 是
 * CSPRNG —— nonce 必须不可预测，用 `Math.random()` 等于 CSP 失效。
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64：Edge Runtime 有 btoa；Buffer 在 Edge 不可用
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * 全站安全响应头（P4-04 / P4-07）。
 *
 * 技术方案 §8 要求「Helmet、安全响应头、严格 CSP、Referrer-Policy、
 * Permissions-Policy」。这里在 Next 的 middleware 层统一施加，
 * 比逐页 `headers()` 更难漏。
 *
 * ## nonce 的信任链（仅 strict 策略）
 *
 * CSP 的 `strict-dynamic` 有一个硬前提：**必须配合 nonce 或 hash**。
 * 没有 nonce 时，`strict-dynamic` 会让 `'self'` 失效，
 * 于是"已由 <script src> 加载的 bundle"也不再可信 ——
 * 结果是页面上所有脚本（包括 Next 注入的飞行数据）全部被拦，
 * 页面只剩 SSR 静态 HTML，不发生水合。
 *
 * 这个坑踩过一次：开发时页面看起来正常（SSR 内容都在），
 * 但地图永远卡在"正在加载"、筛选点了没反应、XHR 数为 0。
 *
 *   1. 本函数为每个请求生成随机 nonce
 *   2. 通过 `x-nonce` 请求头告诉 Next 的渲染层
 *   3. Next 在输出 <script nonce="..."> 时自动带上
 *   4. CSP 的 script-src 声明同一个 nonce
 *
 * ## 为什么地图路由例外
 *
 * 高德 JS API 与 nonce + `strict-dynamic` **设计上互斥**（详见
 * `security-headers.ts` 的 `CspPolicy` 注释）。所以 `/map` 走另一套策略：
 * 既不下发 `x-nonce`，也不用 nonce —— 若此时仍下发，Next 会给每个内联
 * script 打上一个"对不上任何策略"的 nonce 属性，最终还是靠
 * `'unsafe-inline'` 放行，只是白白多一层误导性的假象。
 *
 * 匹配范围：排除 `_next/static`、`_next/image`（Next 自己管缓存头）
 * 与静态资源；其余全部路径（含 `/api/revalidate`）都加。
 */
export function middleware(request: NextRequest): NextResponse {
  const policy = cspPolicyForPath(request.nextUrl.pathname);
  const nonce = policy === 'strict' ? generateNonce() : null;

  const requestHeaders = new Headers(request.headers);
  if (nonce !== null) {
    // Next 会读取 `x-nonce` 请求头并把它写进渲染出的 <script nonce="...">。
    requestHeaders.set('x-nonce', nonce);
  } else {
    requestHeaders.delete('x-nonce');
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return applySecurityHeaders(response, { policy, nonce }) as NextResponse;
}

export const config = {
  matcher: [
    /*
     * 排除 _next 内部资源：那里已经有正确的内容类型与缓存头，
     * 中间件重复处理只会增加开销。
     * 注意 `/api/revalidate` **不在**排除列表里 —— 它也要带 CSP，
     * 否则响应会被当成可被任意来源嵌入的资源。
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
