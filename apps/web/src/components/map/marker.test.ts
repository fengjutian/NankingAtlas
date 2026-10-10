// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { SLUG_ATTR, focusMarkerButton, markerContentHtml } from './marker';

/**
 * marker 内容拼装与焦点定位。
 *
 * 这里最要紧的是**转义**：`title` / `slug` 来自 API，最终经高德 innerHTML
 * 落进 DOM。不转义就是一条完整的存储型 XSS 路径，而它此前完全没有测试。
 */
describe('markerContentHtml', () => {
  it('产出可访问的原生按钮：type、名称、按下态齐备', () => {
    const html = markerContentHtml('示例地点', 'demo-slug', false);
    const host = document.createElement('div');
    host.innerHTML = html;

    const button = host.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute(SLUG_ATTR)).toBe('demo-slug');
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    // 读屏名称来自视觉隐藏的 span，不是 title 属性
    expect(button?.textContent).toContain('示例地点');
  });

  it('选中态写成 aria-pressed=true（不是靠颜色单独表达状态）', () => {
    const host = document.createElement('div');
    host.innerHTML = markerContentHtml('示例地点', 'demo-slug', true);
    expect(host.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('图钉本体对读屏隐藏，只留文本（否则读屏会念出一个空元素）', () => {
    const host = document.createElement('div');
    host.innerHTML = markerContentHtml('示例地点', 'demo-slug', false);
    const pin = host.querySelector('button > span');
    expect(pin?.getAttribute('aria-hidden')).toBe('true');
  });

  it('不含 <svg>：高德 2.0 会剥掉它，SVG 写了等于白写', () => {
    const html = markerContentHtml('示例地点', 'demo-slug', false);
    expect(html).not.toContain('<svg');
    expect(host_button(html)).not.toBeNull();
  });

  describe('XSS：title / slug 来自 API', () => {
    const PAYLOADS = [
      '<script>alert(1)</script>',
      '"><script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      "'><svg/onload=alert(1)>",
      'javascript:alert(1)',
      '</span><iframe src="evil"></iframe>',
    ];

    it.each(PAYLOADS)('title 里的注入载荷不会变成真实元素：%s', (payload) => {
      const host = document.createElement('div');
      host.innerHTML = markerContentHtml(payload, 'safe-slug', false);

      // 关键断言：解析后 DOM 里不得多出任何脚本/图片/iframe 节点。
      expect(host.querySelector('script')).toBeNull();
      expect(host.querySelector('img')).toBeNull();
      expect(host.querySelector('iframe')).toBeNull();
      expect(host.querySelector('svg')).toBeNull();
      // 只有一个 button —— 载荷没能逃出属性值或文本节点
      expect(host.querySelectorAll('button')).toHaveLength(1);
    });

    it.each(PAYLOADS)('slug 里的注入载荷无法逃出属性：%s', (payload) => {
      const host = document.createElement('div');
      host.innerHTML = markerContentHtml('示例地点', payload, false);

      expect(host.querySelector('script')).toBeNull();
      expect(host.querySelector('img')).toBeNull();
      expect(host.querySelector('iframe')).toBeNull();
      expect(host.querySelectorAll('button')).toHaveLength(1);
      // slug 仍以字面量形式保存在属性里（转义后），可被 getAttribute 原样取回
      expect(host.querySelector('button')?.getAttribute(SLUG_ATTR)).toBe(payload);
    });

    it('注入尝试不会破坏 slug 的反查能力（属性值仍与原值逐字符相等）', () => {
      // 这条是焦点转移的前提：getAttribute === slug 必须恒成立。
      const nasty = 'a" onmouseover="alert(1)" x="';
      const host = document.createElement('div');
      host.innerHTML = markerContentHtml('t', nasty, false);
      const button = host.querySelector('button');
      expect(button?.getAttribute(SLUG_ATTR)).toBe(nasty);
      expect(button?.getAttribute('onmouseover')).toBeNull();
    });
  });
});

describe('focusMarkerButton', () => {
  function mount(slugs: readonly string[]): HTMLElement {
    const container = document.createElement('div');
    container.innerHTML = slugs.map((s) => markerContentHtml('标题', s, false)).join('');
    document.body.appendChild(container);
    return container;
  }

  it('把焦点落到目标 marker 的按钮上', () => {
    const container = mount(['a', 'b', 'c']);
    focusMarkerButton(container, 'b');
    const buttons = container.querySelectorAll('button');
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('slug 含引号/方括号时也能正确命中（拼接选择器会在这里直接抛错）', () => {
    const nasty = 'x"] ,div , y["';
    const container = mount(['plain', nasty]);
    focusMarkerButton(container, nasty);
    expect(document.activeElement?.getAttribute(SLUG_ATTR)).toBe(nasty);
  });

  it('目标不存在时只是什么都不做，不抛异常', () => {
    const container = mount(['a']);
    expect(() => focusMarkerButton(container, 'missing')).not.toThrow();
  });

  it('容器为 null 时安全退出（组件卸载竞态）', () => {
    expect(() => focusMarkerButton(null, 'a')).not.toThrow();
  });

  it('不会误命中前缀相同的其他 slug', () => {
    const container = mount(['demo-1', 'demo-11']);
    focusMarkerButton(container, 'demo-11');
    expect(document.activeElement?.getAttribute(SLUG_ATTR)).toBe('demo-11');
  });
});

/** 小工具：把 HTML 挂到脱离文档的节点上并返回第一个 button。 */
function host_button(html: string): HTMLButtonElement | null {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.querySelector('button');
}
