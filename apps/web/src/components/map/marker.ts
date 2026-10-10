import styles from './map.module.css';

import { escapeHtml } from '@/lib/map-state';

/**
 * marker 的内容拼装与焦点定位（`/map` 组件层）。
 *
 * 抽出来的理由不是"文件太长"，而是这两段逻辑**都在安全边界上**：
 * - `markerContentHtml` 把 API 回来的 `title` / `slug` 拼进 HTML 字符串，
 *   由高德用 innerHTML 渲染 —— AGENTS.md §4.5 要求"富文本和 URL 必须净化"，
 *   而这里此前藏在 `MapCanvas.tsx` 里**一行断言都没有**；
 * - `focusMarkerButton` 用 slug 反查 DOM 节点，slug 来自 API，
 *   拼接选择器就是注入点。
 *
 * 留在 `components/map/` 下是因为它依赖本目录的 CSS Module；
 * 纯逻辑不该住在组件里，安全相关的纯逻辑更不该。
 */

/** marker 属性名：同时用于事件委托与焦点定位。 */
export const SLUG_ATTR = 'data-map-slug';

/**
 * marker 尺寸（px），必须与 `map.module.css` 里 `.mapMarkerPin` 的
 * 1.5rem × 2.25rem 一致。
 *
 * 之所以写死常量而不是读 DOM：高德在 `add()` 时就据此算 offset，
 * 那时元素还没被测量，读 `getBoundingClientRect()` 只会拿到 0。
 */
export const MARKER_WIDTH = 24;
export const MARKER_HEIGHT = 36;

/**
 * CSS Module 取值。
 *
 * Next 生成的 `*.module.css` 类型是索引签名，在 `noUncheckedIndexedAccess` 下
 * 取值是 `string | undefined`；这里收口成 `string`，缺失时退回类名本身，
 * 宁可样式退化也不让 marker 渲染中断。
 */
export function css(name: string): string {
  return styles[name] ?? name;
}

/**
 * marker 的自定义 HTML。
 *
 * 用原生 `<button>`：自带 Enter / Space 键盘激活、焦点可见样式、读屏可读名称，
 * 不需要手工补 `role` / `tabIndex` / `keypress`。
 *
 * ⚠️ 图钉**必须用纯 CSS 画，不能用内联 SVG**：实测高德 2.0 在渲染 marker
 * `content` 时会剥掉 `<svg>`（同一个 content 里的 `<span>` 能存活）。
 * 结果是 `<svg>` 整块消失、只剩可访问文本，视觉退化成高德默认图钉 ——
 * 品牌色与选中态样式全部失效。用 CSS 画则 100% 存活且完全可控。
 *
 * `title` 与 `slug` 来自 API，**必须转义**；类名来自本项目的 CSS Module，
 * 是可信字面量，不转义（转义反而会让类名永远匹配不上）。
 */
export function markerContentHtml(title: string, slug: string, selected: boolean): string {
  return (
    `<button type="button" class="${css('mapMarker')}" ${SLUG_ATTR}="${escapeHtml(slug)}" ` +
    `aria-pressed="${selected ? 'true' : 'false'}">` +
    `<span class="${css('mapMarkerPin')}" aria-hidden="true"></span>` +
    `<span class="${css('visuallyHidden')}">${escapeHtml(title)}</span>` +
    '</button>'
  );
}

/**
 * 把焦点移到某个 marker 的按钮上。
 *
 * 遍历比对 `getAttribute` 而不是拼选择器：slug 来自 API，可能含引号 /
 * 方括号 / 反斜杠，任何字符串拼接的选择器都会变成注入点或直接抛错。
 */
export function focusMarkerButton(container: HTMLElement | null, slug: string): void {
  if (container === null) return;
  for (const node of container.querySelectorAll<HTMLElement>(`button[${SLUG_ATTR}]`)) {
    if (node.getAttribute(SLUG_ATTR) === slug) {
      node.focus({ preventScroll: true });
      return;
    }
  }
}