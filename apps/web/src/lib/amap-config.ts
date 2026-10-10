/**
 * 高德地图接入配置（Web 端 JS API 2.0）。
 *
 * ## 为什么是 fail-closed
 *
 * JS API 2.0 **强制**要求「Key + 安全密钥(jscode)」成对存在。官方明确说明：
 * 只配 Key 不配 `securityJsCode` 时页面**白屏且控制台报错**，而部分 Web 服务
 * （路径规划、地理编码）会**静默失败** —— 没有异常、没有降级提示，只是没有结果。
 *
 * 因此这里不做"缺了就用默认"的兜底：配置不完整就返回 `ok:false`，
 * 由 `MapCanvas` 走**纯列表降级**，并在页面上说明原因。宁可少一块地图，
 * 也不能让用户面对一个没有解释的白块。
 *
 * ## 这两个值算不算秘密
 *
 * **不算**，但要按"公开凭据"管理：
 * - `NEXT_PUBLIC_AMAP_KEY` 必然出现在浏览器里，任何用高德 JS API 的站点都是如此；
 * - `securityJsCode` 同样由前端注入（`window._AMapSecurityConfig`）。
 * 真正的防护手段是**高德控制台里的域名白名单 + 配额**，而不是"藏起来" ——
 * 藏不住的凭据不构成安全边界。
 *
 * ## jscode 到底要不要配（实测结论，勿凭文档想当然）
 *
 * 官方文档与大量博客都说「2.0 不配 jscode 一定白屏」。**在本项目的真实浏览器里
 * 实测过：配了 Key、不配 jscode，底图完全正常**（南京路网/POI/水系全部渲染，
 * 控制台 0 错误）。
 *
 * 真正把底图打白的是**另一件事**：`security-headers.ts` 的 CSP 没给
 * `unsafe-eval`，而高德插件加载器 `window._jsload_` 内部对字符串求值，
 * 直接抛 EvalError → `WebGLRender is not a constructor` → 一片灰。
 * 那个故障的所有网络请求都是 HTTP 200，极易误判成"Key / jscode 有问题"。
 *
 * jscode 真正约束的是**Web 服务**（地理编码、路径规划、行政区检索）。
 * 本项目一条都不用 —— `/routes` 的站点顺序来自自有数据库，不调高德算路。
 * 因此这里把 jscode 设为**可选**：没有就不注入 `_AMapSecurityConfig`，
 * 将来真要接高德 Web 服务时再补上。
 */

/** 配置缺失或不合法的原因。 */
export type AmapConfigFailure =
  /** 没有配 `NEXT_PUBLIC_AMAP_KEY`：无法加载高德脚本。 */
  'missing_key';

export type AmapConfigResult =
  | {
      readonly ok: true;
      readonly key: string;
      /** 未配置时为 null —— 表示"不做安全密钥校验"，而不是"用空串去校验"。 */
      readonly securityJsCode: string | null;
    }
  | { readonly ok: false; readonly reason: AmapConfigFailure };

export interface ResolvedAmapConfig {
  readonly key: string;
  readonly securityJsCode: string | null;
}

/** 底图署名。高德服务条款要求在页面上标明来源，不可省略。 */
export const AMAP_ATTRIBUTION = '© 高德地图';

/** 高德脚本地址。域名固定写死：它不是可配置项，改了必然失效。 */
export const AMAP_SCRIPT_ORIGIN = 'https://webapi.amap.com';

function readPublicEnv(name: string): string | null {
  const raw = process.env[name];
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

/**
 * Key / jscode 的形状校验。
 *
 * 高德当前签发的是 32 位十六进制串。这里**只做保守的宽松校验**：
 * 剔掉明显不是凭据的内容（过短、含空白、含 URL 分隔符），但**不锁定**具体
 * 位数 —— 万一高德将来变更签发格式，也不至于让线上地图整体失效。
 */
function looksLikeCredential(value: string): boolean {
  if (value.length < 16 || value.length > 64) return false;
  return !/[\s"'<>`\\]/.test(value);
}

/**
 * 解析高德接入配置。
 *
 * 本文件**不 import `lib/env.ts`**：后者依赖 fail-fast 的模块级校验，
 * 进不了客户端 bundle。`NEXT_PUBLIC_*` 在 Next 客户端构建时静态内联，
 * 运行时缺失即回落为"未配置"→ 纯列表降级。
 */
export function resolveAmapConfig(): AmapConfigResult {
  const key = readPublicEnv('NEXT_PUBLIC_AMAP_KEY');
  if (key === null || !looksLikeCredential(key)) return { ok: false, reason: 'missing_key' };

  // jscode 可选：未配置 → null（不注入 _AMapSecurityConfig），底图照常可用。
  const rawJsCode = readPublicEnv('NEXT_PUBLIC_AMAP_SECURITY_CODE');
  const securityJsCode = rawJsCode !== null && looksLikeCredential(rawJsCode) ? rawJsCode : null;

  return { ok: true, key, securityJsCode };
}

/**
 * 未配置原因 → 面向维护者的说明（不是访客文案，访客看到的是"地图不可用"）。
 */
export const AMAP_CONFIG_HINTS: Readonly<Record<AmapConfigFailure, string>> = {
  missing_key: '未配置 NEXT_PUBLIC_AMAP_KEY',
};
