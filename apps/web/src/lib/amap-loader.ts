/**
 * 高德 JS API 2.0 脚本加载器。
 *
 * 必须先注入 `_AMapSecurityConfig` 再插 `<script>` —— 顺序反了会得到
 * "地图白屏 + INVALID_USER_SCODE"，且控制台没有指向根因的提示。
 *
 * 同一页面多次挂载（`MapErrorBoundary` 的 retry、路由来回切换）必须复用
 * **同一个**高德实例：重复加载会覆盖 `window.AMap`，正在显示的地图会突然失效。
 * 因此这里是"模块级单例 Promise"，不是每次调用都插一个新 script。
 */

import { AMAP_SCRIPT_ORIGIN } from './amap-config';
import { readAmapGlobal } from './amap-sdk';

import type { ResolvedAmapConfig } from './amap-config';
import type { AMapNamespace } from './amap-sdk';

/** script 标签的 DOM id：用于识别"别人（或上一次）已经插入的高德脚本"。 */
const SCRIPT_ID = 'nanking-atlas-amap-sdk';

/**
 * 脚本加载超时。
 *
 * 高德脚本被 CSP / 防火墙 / 广告拦截插件挡掉时，`error` 事件**不一定触发**
 * （有些拦截器只是不让请求发出）。没有超时的话 Promise 会永远挂起，
 * 地图区域永远停在"正在加载"，用户看不到任何原因。
 */
export const AMAP_SCRIPT_TIMEOUT_MS = 10_000;

/** 加载失败的原因。区分开才能给出可操作的提示。 */
export type AmapLoadFailure =
  /** 没有 DOM（SSR / 单测）。 */
  | 'no_dom'
  /** script 的 error 事件：CSP 拦截、域名白名单不匹配、网络不可达。 */
  | 'script_error'
  /** 超时未完成。 */
  | 'timeout';

export class AmapLoadError extends Error {
  readonly reason: AmapLoadFailure;

  constructor(reason: AmapLoadFailure) {
    super(`failed to load AMap JS API: ${reason}`);
    this.name = 'AmapLoadError';
    this.reason = reason;
  }
}

let pending: Promise<AMapNamespace> | null = null;

function buildScriptUrl(config: ResolvedAmapConfig): string {
  const params = new URLSearchParams({ v: '2.0', key: config.key });
  return `${AMAP_SCRIPT_ORIGIN}/maps?${params.toString()}`;
}

/**
 * 加载高德命名空间。
 *
 * - 已加载 → 立即返回；
 * - 加载中 → 复用同一个 Promise；
 * - 失败 → **清空缓存**，允许 retry 重新尝试（否则一次网络抖动会让地图
 *   在整个页面生命周期里永久不可用）。
 */
export function loadAmap(config: ResolvedAmapConfig): Promise<AMapNamespace> {
  const existing = readAmapGlobal();
  if (existing !== null) return Promise.resolve(existing);
  if (pending !== null) return pending;

  const promise = injectScript(config).catch((error: unknown) => {
    pending = null; // 允许 retry
    throw error;
  });
  pending = promise;
  return promise;
}

function injectScript(config: ResolvedAmapConfig): Promise<AMapNamespace> {
  if (typeof document === 'undefined') return Promise.reject(new AmapLoadError('no_dom'));

  // ① 安全配置必须先于脚本存在。
  // 只在拿到 jscode 时才注入 —— 用空串注入会被高德判为"提供了错误的 jscode"，
  // 比不注入更糟。未配置时底图仍可正常渲染（实测），只是 Web 服务不可用。
  if (config.securityJsCode !== null) {
    window._AMapSecurityConfig = { securityJsCode: config.securityJsCode };
  }

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = buildScriptUrl(config);
  // 高德脚本不设 crossOrigin：它需要读取自身的内联状态，匿名 CORS 反而会失败。

  return new Promise<AMapNamespace>((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    };

    const timer = window.setTimeout(() => {
      cleanup();
      script.remove();
      reject(new AmapLoadError('timeout'));
    }, AMAP_SCRIPT_TIMEOUT_MS);

    script.onload = () => {
      cleanup();
      const amap = readAmapGlobal();
      if (amap === null) {
        script.remove();
        // 脚本"加载成功"但没挂上 AMap —— 典型的 key 被拒表现。
        reject(new AmapLoadError('script_error'));
        return;
      }
      resolve(amap);
    };

    script.onerror = () => {
      cleanup();
      script.remove();
      reject(new AmapLoadError('script_error'));
    };

    // 脚本可能已被本模块之外的代码插入（换 key、热更新）：复用而不是重复加载。
    const existingScript = document.getElementById(SCRIPT_ID);
    if (existingScript !== null) {
      const booted = readAmapGlobal();
      if (booted !== null) {
        cleanup();
        resolve(booted);
        return;
      }
      // 还没就绪：等它的 load，而不是再插一个。
      existingScript.addEventListener('load', () => {
        const amap = readAmapGlobal();
        cleanup();
        if (amap === null) reject(new AmapLoadError('script_error'));
        else resolve(amap);
      });
      return;
    }

    document.head.appendChild(script);
  });
}

/**
 * 清空加载缓存（仅测试用）。
 *
 * 暴露成具名函数而不是让测试去改模块内部状态：ESM 的 live binding 允许
 * 测试重写，但显式重置接口能保证语义（"下次 load 会重新插脚本"）被钉住。
 */
export function resetAmapLoaderForTests(): void {
  pending = null;
}
