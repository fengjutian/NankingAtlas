import { describe, expect, it } from 'vitest';

import {
  ALLOWED_TIPTAP_MARKS,
  ALLOWED_TIPTAP_NODES,
  ALLOWED_URL_PROTOCOLS,
  FORCED_LINK_REL,
  TiptapDocumentError,
  TiptapRenderError,
  extractPlainText,
  parseTiptapDocument,
  renderTiptapToSafeHtml,
  type TiptapDocument,
  type TiptapNode,
} from './tiptap.js';

/** 构造一个合法的 doc，测试用例只写差异部分。 */
function doc(...content: TiptapNode[]): TiptapDocument {
  return { type: 'doc', content };
}

function p(text: string, marks?: TiptapNode['marks']): TiptapNode {
  const textNode: TiptapNode = { type: 'text', text };
  return marks === undefined ? { type: 'paragraph', content: [textNode] } : { type: 'paragraph', content: [{ ...textNode, marks }] };
}

function h(level: number, text: string): TiptapNode {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

function render(input: unknown): string {
  return renderTiptapToSafeHtml(parseTiptapDocument(input));
}

describe('tiptap document validation', () => {
  describe('whitelists', () => {
    it('exposes the node whitelist without dangerous types', () => {
      expect(ALLOWED_TIPTAP_NODES).toContain('paragraph');
      expect(ALLOWED_TIPTAP_NODES).toContain('heading');
      expect(ALLOWED_TIPTAP_NODES).toContain('image');
      for (const banned of ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input']) {
        expect(ALLOWED_TIPTAP_NODES).not.toContain(banned);
      }
    });

    it('exposes the mark whitelist and allowed url protocols', () => {
      expect(ALLOWED_TIPTAP_MARKS).toEqual(['bold', 'italic', 'strike', 'code', 'link']);
      expect(ALLOWED_URL_PROTOCOLS).toEqual(['http', 'https', 'mailto', 'tel']);
    });
  });

  describe('whitelisted node rendering', () => {
    it('renders paragraph and text', () => {
      expect(render(doc(p('城墙')))).toBe('<p>城墙</p>');
    });

    it('renders headings level 1..6 and defaults to 2', () => {
      for (let level = 1; level <= 6; level += 1) {
        expect(render(doc(h(level, '标题')))).toBe(`<h${level}>标题</h${level}>`);
      }
      expect(render(doc({ type: 'heading', content: [{ type: 'text', text: '默认' }] }))).toBe(
        '<h2>默认</h2>',
      );
    });

    it('renders bulletList / orderedList / listItem', () => {
      const list = doc({
        type: 'bulletList',
        content: [{ type: 'listItem', content: [p('甲')] }, { type: 'listItem', content: [p('乙')] }],
      });
      expect(render(list)).toBe('<ul><li><p>甲</p></li><li><p>乙</p></li></ul>');
      expect(render({ ...list, content: [{ ...(list.content as TiptapNode[])[0], }] })).toContain(
        '<ul>',
      );
      expect(
        render(doc({ type: 'orderedList', content: [{ type: 'listItem', content: [p('一')] }] })),
      ).toBe('<ol><li><p>一</p></li></ol>');
    });

    it('renders blockquote, codeBlock, horizontalRule and hardBreak', () => {
      expect(render(doc({ type: 'blockquote', content: [p('引文')] }))).toBe(
        '<blockquote><p>引文</p></blockquote>',
      );
      expect(
        render(doc({ type: 'codeBlock', content: [{ type: 'text', text: 'const a = 1;' }] })),
      ).toBe('<pre><code>const a = 1;</code></pre>');
      expect(render(doc({ type: 'horizontalRule' }))).toBe('<hr>');
      expect(render(doc({ type: 'paragraph', content: [{ type: 'hardBreak' }, { type: 'text', text: '第二行' }] }))).toBe(
        '<p><br>第二行</p>',
      );
    });

    it('renders image with escaped src, alt and lazy loading', () => {
      const html = render(
        doc({ type: 'image', attrs: { src: 'https://example.com/a.png?x=1&y=2', alt: '明城墙', width: 800, height: 600 } }),
      );
      expect(html).toBe(
        '<img src="https://example.com/a.png?x=1&amp;y=2" alt="明城墙" width="800" height="600" loading="lazy">',
      );
    });

    it('renders image without alt as empty string', () => {
      expect(render(doc({ type: 'image', attrs: { src: 'http://cdn.example.com/b.jpg' } }))).toBe(
        '<img src="http://cdn.example.com/b.jpg" alt="" loading="lazy">',
      );
    });
  });

  describe('whitelisted mark rendering', () => {
    it('renders bold / italic / strike / code marks', () => {
      expect(render(doc(p('南京', [{ type: 'bold' }])))).toBe('<p><strong>南京</strong></p>');
      expect(render(doc(p('南京', [{ type: 'italic' }])))).toBe('<p><em>南京</em></p>');
      expect(render(doc(p('南京', [{ type: 'strike' }])))).toBe('<p><s>南京</s></p>');
      expect(render(doc(p('NJU', [{ type: 'code' }])))).toBe('<p><code>NJU</code></p>');
    });

    it('nests marks in array order', () => {
      const html = render(doc(p('史料', [{ type: 'bold' }, { type: 'italic' }])));
      expect(html).toBe('<p><strong><em>史料</em></strong></p>');
    });

    it('renders link with forced rel', () => {
      const html = render(
        doc(p('链接', [{ type: 'link', attrs: { href: 'https://example.com/a', target: '_blank' } }])),
      );
      expect(html).toBe(
        `<p><a href="https://example.com/a" rel="${FORCED_LINK_REL}" target="_blank">链接</a></p>`,
      );
    });

    it('overrides a malicious rel value passed by the client', () => {
      const html = render(
        doc(p('链接', [{ type: 'link', attrs: { href: 'https://example.com', rel: 'opener' } }])),
      );
      expect(html).toContain(`rel="${FORCED_LINK_REL}"`);
      expect(html).not.toContain('opener"');
    });

    it('rejects unknown mark types', () => {
      expect(() => render(doc(p('x', [{ type: 'underline' }])))).toThrow(TiptapDocumentError);
    });
  });

  describe('unknown and dangerous nodes', () => {
    it('rejects script / iframe / object / embed nodes', () => {
      for (const type of ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style']) {
        expect(() => render(doc({ type: type as string }))).toThrow(TiptapDocumentError);
      }
    });

    it('rejects non-whitelisted attributes such as onerror', () => {
      expect(() =>
        render(doc({ type: 'image', attrs: { src: 'https://example.com/a.png', onerror: 'alert(1)' } })),
      ).toThrow(TiptapDocumentError);
      expect(() => render(doc(p('x', [{ type: 'link', attrs: { href: 'https://a.test', onclick: 'x' } }])))).toThrow(
        TiptapDocumentError,
      );
    });

    it('rejects marks on non-text nodes', () => {
      expect(() => render(doc({ type: 'paragraph', marks: [{ type: 'bold' }] }))).toThrow(
        TiptapDocumentError,
      );
    });

    it('rejects text directly inside doc', () => {
      expect(() => parseTiptapDocument({ type: 'doc', content: [{ type: 'text', text: 'x' }] })).toThrow(
        TiptapDocumentError,
      );
    });

    it('rejects empty text nodes', () => {
      expect(() => parseTiptapDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] })).toThrow(
        TiptapDocumentError,
      );
      expect(() => parseTiptapDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text' }] }] })).toThrow(
        TiptapDocumentError,
      );
    });

    it('rejects listItem without children', () => {
      expect(() => render(doc({ type: 'bulletList', content: [{ type: 'listItem' }] }))).toThrow(
        TiptapDocumentError,
      );
    });

    it('rejects block nodes inside bulletList', () => {
      expect(() => render(doc({ type: 'bulletList', content: [p('x')] }))).toThrow(TiptapDocumentError);
    });

    it('rejects paragraphs nested directly inside a paragraph', () => {
      expect(() => render(doc({ type: 'paragraph', content: [p('nested')] }))).toThrow(
        TiptapDocumentError,
      );
    });
  });

  describe('URL safety', () => {
    const badHrefs = [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      '//evil.example.com/path',
      '&#106;avascript:alert(1)',
      'java\tscript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '&#x6a;avascript:alert(1)',
      '&amp;#58;avascript:alert(1)',
      '/relative/path',
      'file:///etc/passwd',
    ];

    it.each(badHrefs)('rejects link href %j', (href) => {
      expect(() => render(doc(p('x', [{ type: 'link', attrs: { href } }])))).toThrow(TiptapDocumentError);
    });

    it('rejects javascript: and protocol-relative image src', () => {
      expect(() => render(doc({ type: 'image', attrs: { src: 'javascript:alert(1)' } }))).toThrow(
        TiptapDocumentError,
      );
      expect(() => render(doc({ type: 'image', attrs: { src: '//evil.example.com/x.png' } }))).toThrow(
        TiptapDocumentError,
      );
    });

    it('rejects non-http protocols for image src', () => {
      expect(() => render(doc({ type: 'image', attrs: { src: 'mailto:a@example.com' } }))).toThrow(
        TiptapDocumentError,
      );
    });

    it('accepts mailto and tel for links but decodes entities', () => {
      expect(render(doc(p('邮箱', [{ type: 'link', attrs: { href: 'mailto:a@example.com' } }])))).toContain(
        'href="mailto:a@example.com"',
      );
      expect(render(doc(p('电话', [{ type: 'link', attrs: { href: 'tel:+862512345' } }])))).toContain(
        'href="tel:+862512345"',
      );
      expect(
        render(doc(p('x', [{ type: 'link', attrs: { href: 'https://example.com/?a=1&amp;b=2' } }]))),
      ).toContain('href="https://example.com/?a=1&amp;b=2"');
    });

    it('rejects link without href', () => {
      expect(() => render(doc(p('x', [{ type: 'link' }])))).toThrow(TiptapDocumentError);
    });

    it('rejects invalid link target', () => {
      expect(() => render(doc(p('x', [{ type: 'link', attrs: { href: 'https://a.test', target: '_top' } }])))).toThrow(
        TiptapDocumentError,
      );
    });

    it('rejects image without src and image with children', () => {
      expect(() => parseTiptapDocument({ type: 'doc', content: [{ type: 'image', attrs: {} }] })).toThrow(
        TiptapDocumentError,
      );
      expect(() =>
        parseTiptapDocument({
          type: 'doc',
          content: [{ type: 'image', attrs: { src: 'https://a.test/x.png' }, content: [{ type: 'text', text: 'x' }] }],
        }),
      ).toThrow(TiptapDocumentError);
    });
  });

  describe('structural limits', () => {
    it('rejects heading level out of range or non-integer', () => {
      for (const level of [0, 7, 2.5, '2', null]) {
        expect(() =>
          parseTiptapDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level }, content: [{ type: 'text', text: 'x' }] }] }),
        ).toThrow(TiptapDocumentError);
      }
    });

    it('rejects documents nested deeper than 32', () => {
      let node: TiptapNode = { type: 'text', text: 'deep' };
      for (let i = 0; i < 40; i += 1) {
        node = { type: 'blockquote', content: [node] };
      }
      expect(() => parseTiptapDocument({ type: 'doc', content: [node] })).toThrow(TiptapDocumentError);
    });

    it('rejects documents with more than 5000 nodes', () => {
      const content: TiptapNode[] = [];
      for (let i = 0; i < 3000; i += 1) {
        content.push({ type: 'paragraph', content: [{ type: 'text', text: `第${i}段` }] });
      }
      expect(() => parseTiptapDocument({ type: 'doc', content })).toThrow(TiptapDocumentError);
    });

    it('reports structured issues with paths', () => {
      try {
        parseTiptapDocument({ type: 'doc', content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }] });
        expect.unreachable('应当抛出 TiptapDocumentError');
      } catch (error) {
        expect(error).toBeInstanceOf(TiptapDocumentError);
        const issues = (error as TiptapDocumentError).issues;
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]?.path).toContain('content[0].attrs.src');
      }
    });

    it('rejects non-document input shapes', () => {
      expect(() => parseTiptapDocument(null)).toThrow(TiptapDocumentError);
      expect(() => parseTiptapDocument({ type: 'paragraph' })).toThrow(TiptapDocumentError);
      expect(() => parseTiptapDocument({ type: 'doc', content: 'not-an-array' })).toThrow(TiptapDocumentError);
      expect(() => parseTiptapDocument({ type: 'doc', content: [], extra: true })).toThrow(TiptapDocumentError);
    });
  });

  describe('extractPlainText', () => {
    it('extracts nested text across blocks and lists', () => {
      const text = extractPlainText(
        parseTiptapDocument(
          doc(h(2, '明城墙'), p('始建于明洪武年'), {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [p('神策门')] }, { type: 'listItem', content: [p('中华门')] }],
          }),
        ),
      );
      expect(text).toBe('明城墙\n始建于明洪武年\n神策门\n中华门');
    });

    it('collapses redundant whitespace and drops empty blocks', () => {
      const text = extractPlainText(
        parseTiptapDocument(doc(p('  多余   空白  '), p('   '), p('第二段\t制表符'))),
      );
      expect(text).toBe('多余 空白\n第二段 制表符');
    });

    it('keeps newlines inside codeBlock', () => {
      const text = extractPlainText(
        parseTiptapDocument(doc({ type: 'codeBlock', content: [{ type: 'text', text: 'line1\nline2\n\nline3' }] })),
      );
      // codeBlock 不折叠空白：空行是代码语义的一部分，必须保留
      expect(text).toBe('line1\nline2\n\nline3');
    });

    it('ignores image and marks when extracting text', () => {
      const text = extractPlainText(
        parseTiptapDocument(
          doc(p('前', [{ type: 'bold' }]), { type: 'image', attrs: { src: 'https://a.test/x.png', alt: '图注' } }, p('后')),
        ),
      );
      expect(text).toBe('前\n后');
    });

    it('returns empty string for an empty document', () => {
      expect(extractPlainText(parseTiptapDocument({ type: 'doc' }))).toBe('');
    });
  });

  describe('XSS payloads', () => {
    const payloads = [
      'javascript:alert(1)',
      '<script>alert(1)</script>',
      '"><img src=x onerror=alert(1)>',
      'java\tscript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '&#106;avascript:alert(1)',
    ];

    it.each(payloads)('never emits unescaped <script for payload %j', (payload) => {
      const document = doc(
        p(payload),
        p('链接', [{ type: 'link', attrs: { href: `https://example.com/${encodeURIComponent(payload)}` } }]),
      );
      const parsed = parseTiptapDocument(document);
      const html = renderTiptapToSafeHtml(parsed);
      expect(html).not.toContain('<script');
      expect(html).not.toMatch(/\shref="javascript:/u);
      // 文本里的尖括号必须被 escape：渲染结果里除白名单标签外不允许出现任何标签
      expect(html).not.toMatch(/<(?!p|\/p|strong|\/strong|a|\/a)/u);
      if (payload.includes('<script>')) {
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      }
    });

    it('escapes quotes and angle brackets in text and attributes', () => {
      const html = render(
        doc({ type: 'image', attrs: { src: 'https://example.com/x.png', alt: '"><script>alert(1)</script>' } }),
      );
      expect(html).not.toContain('<script>');
      expect(html).toContain('&quot;&gt;&lt;script&gt;');
    });

    it('renders nested structural content without leaking attributes', () => {
      const html = render(
        doc({
          type: 'blockquote',
          content: [
            p('引用', [{ type: 'bold' }]),
            { type: 'bulletList', content: [{ type: 'listItem', content: [p('条目')] }] },
          ],
        }),
      );
      expect(html).toBe(
        '<blockquote><p><strong>引用</strong></p><ul><li><p>条目</p></li></ul></blockquote>',
      );
    });

    it('throws instead of silently dropping unknown node types at render time', () => {
      const forged = { type: 'doc', content: [{ type: 'mysteryNode' }] } as unknown as TiptapDocument;
      expect(() => renderTiptapToSafeHtml(forged)).toThrow(TiptapRenderError);
      const forgedMark = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }] }],
      } as unknown as TiptapDocument;
      expect(() => renderTiptapToSafeHtml(forgedMark)).toThrow(TiptapRenderError);
    });

    it('rejects an unsafe link href even when bypassing parseTiptapDocument', () => {
      const forged = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }],
      } as unknown as TiptapDocument;
      expect(() => renderTiptapToSafeHtml(forged)).toThrow(TiptapRenderError);
    });

    it('refuses to render a non-doc root', () => {
      expect(() => renderTiptapToSafeHtml({ type: 'paragraph' } as unknown as TiptapDocument)).toThrow(
        TiptapRenderError,
      );
    });
  });
});