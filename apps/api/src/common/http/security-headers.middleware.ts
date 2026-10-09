import type { Request, Response, NextFunction } from 'express';

/**
 * 安全响应头中间件（P4-04 / P4-07）。
 *
 * 技术方案 §8：「Helmet、安全响应头、严格 CSP、Referrer-Policy、
 * Permissions-Policy；生产环境关闭 Swagger 或置于管理员认证后。」
 *
 * 这里手写而不是引入 helmet：需要的头只有 6 个，且全部有明确理由；
 * 为此加一个运行时依赖不值（AGENTS.md §6.5）。
 *
 * API 只返回 JSON，不渲染 HTML，所以 CSP 可以收得很紧（`default-src 'none'`）。
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // 隐藏框架指纹（P0 已在 adapter 层 disable x-powered-by，这里兜底）
  res.removeHeader('x-powered-by');

  // 禁止 MIME 嗅探：JSON 响应被当成 HTML 渲染是 XSS 的经典前提
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 禁止被任何来源嵌入（含自己）—— 后台 UI 不需要 iframe
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  // 跨源跳转不带完整路径（避免从 Referer 泄露 slug）
  res.setHeader('Referrer-Policy', 'no-referrer');

  // API 响应不需要被任何浏览器能力使用
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  );

  // 防止被嗅探（仅 HTTPS 环境下有意义）
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  next();
}
