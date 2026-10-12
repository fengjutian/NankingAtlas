import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildToolbar } from './tiptapExtensions';

/**
 * 工具栏的静态定义测试（FD-003）。
 *
 * 这里**不**渲染 React 组件：Tiptap 的 `useEditor` 在 SSR 下需要真实 DOM，
 * 渲染断言交给浏览器 E2E。本文件锁住的是"按钮定义本身"——
 * 名称、唯一性、以及不出现白名单外的格式。
 *
 * 组件层的可访问性（role=toolbar / aria-label / aria-pressed）由
 * E2E 覆盖；单测覆盖不到的层级不假装覆盖。
 */

describe('工具栏按钮定义', () => {
  const actions = buildToolbar();

  it('id 唯一', () => {
    const ids = actions.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个按钮都有可见标签与可访问名称', () => {
    for (const action of actions) {
      expect(action.label.length, `${action.id} 缺可见标签`).toBeGreaterThan(0);
      expect(action.ariaLabel.length, `${action.id} 缺 ariaLabel`).toBeGreaterThan(0);
    }
  });

  it('符号型按钮的 ariaLabel 必须说明动作，不能只是重复符号', () => {
    // 「B」「I」「H2」这类纯符号/缩写对读屏用户没有意义，ariaLabel 必须说人话。
    // 而「代码块」这类本身就是中文词，label 与 ariaLabel 相同是正确的 ——
    // 不能为了满足"必须不同"而把标签改成废话。
    const symbolOnly = /^[A-Za-z0-9<>‹›•.\s]+$/;
    for (const action of actions) {
      if (symbolOnly.test(action.label)) {
        expect(action.ariaLabel, `${action.id} 的可见标签是符号，ariaLabel 必须描述动作`).not.toBe(
          action.label,
        );
        expect(action.ariaLabel.length).toBeGreaterThan(1);
      }
    }
  });

  it('覆盖 FD-003 要求的格式：H2/H3、引用、两种列表、链接', () => {
    const ids = actions.map((action) => action.id);
    for (const id of ['h2', 'h3', 'blockquote', 'bulletList', 'orderedList', 'link']) {
      expect(ids, `工具栏缺少 ${id}`).toContain(id);
    }
  });

  it('覆盖行内 mark：粗体 / 斜体 / 删除线 / 行内代码', () => {
    const ids = actions.map((action) => action.id);
    for (const id of ['bold', 'italic', 'strike', 'code']) {
      expect(ids, `工具栏缺少 ${id}`).toContain(id);
    }
  });

  it('不提供白名单外的格式按钮', () => {
    const ids = actions.map((action) => action.id);
    // underline 不在 mark 白名单；表格 / 图注不在 node 白名单（FD-013 之后另议）
    expect(ids).not.toContain('underline');
    expect(ids).not.toContain('table');
    expect(ids).not.toContain('image');
  });

  it('每个动作都能判断激活态（决定 aria-pressed）', () => {
    for (const action of actions) {
      expect(typeof action.isActive, `${action.id} 缺 isActive`).toBe('function');
    }
  });
});

describe('工具栏在无编辑器实例时的行为', () => {
  it('buildToolbar 不需要编辑器实例即可定义', () => {
    // 定义与实例解耦 → 定义表可脱机单测；
    // 若这里需要真实 Editor 构造，单测就会依赖 DOM。
    expect(() => buildToolbar()).not.toThrow();
  });
});

describe('SSR 下的降级不崩溃', () => {
  it('工具栏定义与 React 无关，可安全在任意环境求值', () => {
    const html = renderToStaticMarkup(
      <div role="toolbar" aria-label="正文格式工具栏">
        {buildToolbar().map((action) => (
          <button key={action.id} type="button" aria-label={action.ariaLabel} aria-pressed={false}>
            {action.label}
          </button>
        ))}
      </div>,
    );
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="加粗"');
  });
});
