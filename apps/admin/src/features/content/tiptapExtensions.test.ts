import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';

import { FORCED_LINK_REL, parseTiptapDocument } from '@nanking-atlas/validation';

import { buildExtensions, buildToolbar, EDITOR_HEADING_LEVELS } from './tiptapExtensions';

/**
 * FD-003 编辑器扩展与白名单的一致性测试。
 *
 * 这是本任务最关键的一组断言：**编辑器能产出的每个文档，都必须能被
 * `packages/validation` 的 `parseTiptapDocument` 接受**。
 * 两边不一致时服务端会拒收编辑的保存 —— 那是最难排查的一类故障。
 */

let editor: Editor | null = null;

function createEditor(initialContent?: object): Editor {
  editor = new Editor({
    extensions: buildExtensions(),
    content: initialContent ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

/** 编辑器产出 → 服务端解析。任何抛错都是真实故障。 */
function expectServerAccepts(instance: Editor): unknown {
  const json: unknown = instance.getJSON();
  return parseTiptapDocument(json);
}

describe('扩展集合与 validation 白名单对齐', () => {
  it('不注册白名单外的 mark（尤其 underline）', () => {
    const instance = createEditor();
    // ProseMirror 的 schema.marks / schema.nodes 是 OrderedMap，不是数组 ——
    // 用 Object.keys 取名，别用 .map / .keys()。
    const marks = Object.keys(instance.schema.marks);
    // mark 白名单：bold / italic / strike / code / link
    expect(marks.sort()).toEqual(['bold', 'code', 'italic', 'link', 'strike']);
    expect(marks).not.toContain('underline');
  });

  it('注册的 node 全部在 validation 白名单内', () => {
    const instance = createEditor();
    const nodes = Object.keys(instance.schema.nodes);
    const expected = [
      'blockquote',
      'bulletList',
      'codeBlock',
      'doc',
      'hardBreak',
      'heading',
      'horizontalRule',
      'image',
      'listItem',
      'orderedList',
      'paragraph',
      'text',
    ].sort();
    expect(nodes.sort()).toEqual(expected);
  });

  it('不注册表格 / 图注节点（validation 白名单尚不支持）', () => {
    const instance = createEditor();
    const names = Object.keys(instance.schema.nodes);
    expect(names).not.toContain('table');
    expect(names).not.toContain('tableRow');
    expect(names).not.toContain('figure');
    expect(names).not.toContain('caption');
  });

  it('标题层级限制为 H2/H3', () => {
    expect([...EDITOR_HEADING_LEVELS]).toEqual([2, 3]);
    for (const level of [2, 3]) {
      const instance = createEditor({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level },
            content: [{ type: 'text', text: `标题 ${String(level)}` }],
          },
        ],
      });
      expectServerAccepts(instance);
    }
  });
});

describe('每种允许节点的保存与回显', () => {
  it('段落 + H2 + H3 + 引用 + 两种列表 + 代码块 + 分隔线', () => {
    const instance = createEditor();
    // 直接构造完整文档，而不是连着链式调用命令：
    // 链式调用要求编辑器有真实 selection，jsdom 下没有视口焦点时
    // 会抛 "Applying a mismatched transaction"，那是测试环境问题不是功能问题。
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '正文段落（示例）。' }] },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '二级标题' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '三级标题' }],
        },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '引用内容（示例）' }] }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '列表项一' }] }],
            },
          ],
        },
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一项' }] }],
            },
          ],
        },
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'const a = 1;' }],
        },
        { type: 'horizontalRule' },
      ],
    };

    instance.commands.setContent(doc);
    const parsed = expectServerAccepts(instance);
    const types = JSON.stringify(parsed);
    for (const nodeType of [
      'paragraph',
      'heading',
      'blockquote',
      'bulletList',
      'orderedList',
      'codeBlock',
      'horizontalRule',
    ]) {
      expect(types, `产出应包含 ${nodeType}`).toContain(`"${nodeType}"`);
    }
  });

  it('行内 mark：粗体 / 斜体 / 删除线 / 行内代码', () => {
    const instance = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '粗', marks: [{ type: 'bold' }] },
            { type: 'text', text: '斜', marks: [{ type: 'italic' }] },
            { type: 'text', text: '删', marks: [{ type: 'strike' }] },
            { type: 'text', text: '码', marks: [{ type: 'code' }] },
          ],
        },
      ],
    });

    expectServerAccepts(instance);
  });

  it('安全链接的 mark 属性被服务端接受', () => {
    const instance = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '外部链接',
              marks: [
                {
                  type: 'link',
                  attrs: { href: 'https://example.com/a', rel: FORCED_LINK_REL, target: '_blank' },
                },
              ],
            },
          ],
        },
      ],
    });

    expectServerAccepts(instance);
  });

  it('图片：只接受 http/https 外链', () => {
    const instance = createEditor({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'https://example.com/a.jpg', alt: '示例图片（待核验）' },
        },
      ],
    });
    expectServerAccepts(instance);
  });

  it('图片尺寸缺省时不输出 null 属性（否则服务端拒收）', () => {
    // Tiptap 默认 width/height 为 null，validation 要求 1..10000 正整数。
    // 覆盖默认值后 JSON 里必须完全没有这两个键。
    const instance = createEditor({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://example.com/a.jpg' } }],
    });
    const json = JSON.stringify(instance.getJSON());
    expect(json).not.toContain('"width"');
    expect(json).not.toContain('"height"');
    expect(json).not.toContain('null');
    expectServerAccepts(instance);
  });

  it('图片尺寸为合法正整数时保留', () => {
    const instance = createEditor({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://example.com/a.jpg', width: 800 } }],
    });
    expectServerAccepts(instance);
  });

  it('硬回车写入 hardBreak', () => {
    const instance = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '第一行' },
            { type: 'hardBreak' },
            { type: 'text', text: '第二行' },
          ],
        },
      ],
    });
    expect(expectServerAccepts(instance)).toBeTruthy();
  });
});

describe('危险输入被拒绝', () => {
  /**
   * `Link.validate` 只作用于**交互路径**（点工具栏 / 输入自动链接）；
   * `setContent` 直接灌文档不经过它。所以真正的不变式是
   * **服务端独立拒绝**——编辑器不是最后一道防线，服务端才是。
   */
  it('javascript: 链接即使被灌入编辑器，服务端也会拒绝', () => {
    const instance = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '点我',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    });

    // 灌入本身不报错（Tiptap 允许存任意 href），
    // 但服务端校验必须拒绝 —— 否则公开站会渲染出可点击的脚本链接。
    expect(() => parseTiptapDocument(instance.getJSON())).toThrow();
  });

  it('data: 图片即使被灌入编辑器，服务端也会拒绝', () => {
    const instance = createEditor({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'x' } }],
    });

    expect(() => parseTiptapDocument(instance.getJSON())).toThrow();
  });

  it('编辑器 schema 里不存在 script / iframe，插入被丢弃', () => {
    const instance = createEditor();
    const names = Object.keys(instance.schema.nodes);
    expect(names).not.toContain('script');
    expect(names).not.toContain('iframe');

    // setContent 遇到未知节点只 warn 并跳过，不抛错；产出里不会留下它。
    instance.commands.setContent({
      type: 'doc',
      content: [{ type: 'text', text: '安全内容' }, { type: 'script' }, { type: 'iframe' }],
    });
    const json = JSON.stringify(instance.getJSON());
    expect(json).not.toContain('script');
    expect(json).not.toContain('iframe');
  });

  it('即使强行塞入非法结构，服务端解析仍会拒绝（双保险）', () => {
    // 绕过编辑器，直接把非法文档交给 validation：
    // 证明服务端不是"相信前端"，而是独立校验。
    expect(() =>
      parseTiptapDocument({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x', marks: [{ type: 'script' }] }],
          },
        ],
      }),
    ).toThrow();
  });
});

describe('工具栏定义', () => {
  it('每个按钮都有唯一 id、可读名称与动作', () => {
    const actions = buildToolbar();
    const ids = actions.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const action of actions) {
      expect(action.ariaLabel.length, `${action.id} 缺 ariaLabel`).toBeGreaterThan(0);
      expect(action.label.length, `${action.id} 缺可见标签`).toBeGreaterThan(0);
      expect(typeof action.run).toBe('function');
      expect(typeof action.isActive).toBe('function');
    }
  });

  it('不提供白名单外的格式按钮（无下划线 / 无表格）', () => {
    const ids = buildToolbar().map((action) => action.id);
    expect(ids).not.toContain('underline');
    expect(ids).not.toContain('table');
    expect(ids).not.toContain('codeBlockLanguage');
  });

  it('包含 H2/H3、引用、两种列表、链接', () => {
    const ids = buildToolbar().map((action) => action.id);
    for (const id of ['h2', 'h3', 'blockquote', 'bulletList', 'orderedList', 'link']) {
      expect(ids, `工具栏缺少 ${id}`).toContain(id);
    }
  });
});
