import { Extension } from '@tiptap/core';
import CodeBlock from '@tiptap/extension-code-block';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { OrderedList } from '@tiptap/extension-list';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';

import { ALLOWED_URL_PROTOCOLS, FORCED_LINK_REL } from '@nanking-atlas/validation';

import type { AnyExtension, Editor } from '@tiptap/core';

/**
 * 编辑器扩展配置（FD-003）。
 *
 * ## 核心不变式：编辑器能产出的文档，**必须**能通过
 * `packages/validation` 的 `parseTiptapDocument`。
 *
 * 那里的白名单是权威定义（AGENTS.md §3.1「AI 不得编造内容结构」），
 * 本文件只负责让 Tiptap 的能力**收敛**到它，而不是反过来放宽它。
 * 两边不一致时改这里没有用 —— 服务端会拒收。
 *
 * 具体的收敛点：
 * - `underline: false` —— StarterKit v3 默认带 underline，但 mark 白名单里没有
 * - `heading.levels: [2, 3]` —— schema 允许 1..6，但 H1 会和详情页标题重复
 * - Link / Image 显式限定协议与属性
 *
 * ## 表格与图注为什么不在这里
 *
 * FD-003 的原始要求里列了表格与图注，但当前 `ALLOWED_TIPTAP_NODES`
 * （validation 包）里**没有** `table*` / `figure` / `caption`。
 * 启用它们会产出服务端拒收的文档，所以本轮不做 ——
 * 那需要先改 validation 白名单 + 公开站的渲染器，是一次独立的 schema 变更。
 */

/** 编辑器允许的标题层级，与站点层级（H1 由页面标题承担）保持一致。 */
export const EDITOR_HEADING_LEVELS = [2, 3] as const;

function isAllowedUrl(url: string, protocols: readonly string[]): boolean {
  const trimmed = url.trim().toLowerCase();
  return protocols.some((protocol) => trimmed.startsWith(`${protocol}:`));
}

/**
 * Tiptap 属性回调的显式签名。
 *
 * Tiptap 把 `parseHTML` / `renderHTML` 的参数类型声明成 `any`，直接内联写
 * 会触发 `@typescript-eslint/no-unsafe-assignment`。这里显式收窄：
 * - parseHTML 只用到 `getAttribute`，用最小结构 `AttributeElement`
 * - renderHTML 的 attributes 是我们**自己声明的属性表**（全是 string | undefined）
 */
interface AttributeElement {
  getAttribute(name: string): string | null;
}

type ParseHTML = (element: AttributeElement) => string | undefined;
type RenderHTML = (
  attributes: Record<string, string | undefined>,
) => Record<string, string | number | undefined>;

/**
 * 属性默认值统一为 `undefined` 而不是 `null`。
 *
 * 这不是风格问题，是**契约硬要求**：`packages/validation` 规定
 * `link.attrs.class` 必须是 string、`image.attrs.width/height` 必须是 1..10000
 * 的正整数，而 ProseMirror 的 `default: null` 会被原样写进 `getJSON()` 的
 * `attrs` 里 → 服务端每次保存都拒收（400）。
 *
 * `default: undefined` 时 ProseMirror 不填这个键，`JSON.stringify` 也会省略
 * `undefined` 值，于是产出与服务端白名单一致。
 */
const SafeLink = Link.extend({
  addAttributes() {
    return {
      href: {
        default: undefined,
        parseHTML: ((element: AttributeElement) =>
          element.getAttribute('href') ?? undefined) as ParseHTML,
        renderHTML: ((attributes: Record<string, string | undefined>) => ({
          href: attributes.href,
        })) as RenderHTML,
      },
      target: {
        default: undefined,
        parseHTML: ((element: AttributeElement) =>
          element.getAttribute('target') ?? undefined) as ParseHTML,
        renderHTML: ((attributes: Record<string, string | undefined>) => ({
          target: attributes.target,
        })) as RenderHTML,
      },
      rel: {
        default: undefined,
        parseHTML: ((element: AttributeElement) =>
          element.getAttribute('rel') ?? undefined) as ParseHTML,
        renderHTML: ((attributes: Record<string, string | undefined>) => ({
          rel: attributes.rel,
        })) as RenderHTML,
      },
      // Tiptap v3 的 Link 内建 class 属性；我们不用它，但**必须声明**，
      // 否则粘贴 HTML 时 ProseMirror 仍会保留它并写进 JSON。
      class: {
        default: undefined,
        parseHTML: ((element: AttributeElement) =>
          element.getAttribute('class') ?? undefined) as ParseHTML,
        renderHTML: (() => ({})) as RenderHTML,
      },
    };
  },
}).configure({
  openOnClick: false,
  autolink: true,
  // 缺协议时补 https://，避免生成相对链接被浏览器解析成站内路径
  defaultProtocol: 'https',
  protocols: [...ALLOWED_URL_PROTOCOLS],
  HTMLAttributes: {
    rel: FORCED_LINK_REL,
    target: '_blank',
  },
  // 粘贴 / 手工输入里的 javascript: 在这里就被挡掉
  validate: (href: string): boolean => isAllowedUrl(href, ALLOWED_URL_PROTOCOLS),
});

const SafeImage = Image.extend({
  addAttributes() {
    return {
      src: {
        default: undefined,
        parseHTML: ((element: AttributeElement) =>
          element.getAttribute('src') ?? undefined) as ParseHTML,
        renderHTML: ((attributes: Record<string, string | undefined>) => ({
          src: attributes.src,
        })) as RenderHTML,
      },
      alt: {
        default: undefined,
        parseHTML: ((element: AttributeElement) =>
          element.getAttribute('alt') ?? undefined) as ParseHTML,
        renderHTML: ((attributes: Record<string, string | undefined>) => ({
          alt: attributes.alt,
        })) as RenderHTML,
      },
      title: {
        default: undefined,
        parseHTML: ((element: AttributeElement) =>
          element.getAttribute('title') ?? undefined) as ParseHTML,
        renderHTML: ((attributes: Record<string, string | undefined>) => ({
          title: attributes.title,
        })) as RenderHTML,
      },
      // 图片尺寸是可选的：没设置时**不能**输出 null（服务端要求正整数）
      width: {
        default: undefined,
        parseHTML: ((element: AttributeElement) => {
          const raw = element.getAttribute('width');
          return raw === null ? undefined : Number.parseInt(raw, 10);
        }) as ParseHTML,
        renderHTML: ((attributes: Record<string, string | undefined>) =>
          attributes.width === undefined ? {} : { width: attributes.width }) as RenderHTML,
      },
      height: {
        default: undefined,
        parseHTML: ((element: AttributeElement) => {
          const raw = element.getAttribute('height');
          return raw === null ? undefined : Number.parseInt(raw, 10);
        }) as ParseHTML,
        renderHTML: ((attributes: Record<string, string | undefined>) =>
          attributes.height === undefined ? {} : { height: attributes.height }) as RenderHTML,
      },
    };
  },
}).configure({
  inline: false,
  // data: URL 会把整张图塞进 JSON 正文，白名单也不允许
  allowBase64: false,
  HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
});

/**
 * 有序列表：去掉 `start` / `type` 属性。
 *
 * Tiptap 默认输出 `attrs: {start: 1, type: null}`，而 validation 的
 * `NODE_ATTR_KEYS.orderedList` 是**空数组** —— 只要编辑写一个有序列表，
 * 服务端就会以 400 拒收整个正文。这是接入编辑器时最容易漏掉的契约不一致。
 */
const SafeOrderedList = OrderedList.extend({
  addAttributes() {
    return {};
  },
});

/**
 * 代码块：去掉 `language` 属性。
 *
 * 与有序列表同因：`NODE_ATTR_KEYS.codeBlock` 同样是空数组。代码高亮语言
 * 需要服务端 schema 配合才能支持，不在这里单方面输出。
 */
const SafeCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {};
  },
});

/**
 * 返回类型用 `AnyExtension`：StarterKit 是 `Extension`，而 `Image` 是
 * `Node` —— 两者在 Tiptap 的类型体系里不是同一个可赋值类型，但
 * `useEditor({ extensions })` 接受两者。写窄了会逼出无意义的类型断言。
 */
export function buildExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      // 下划线不在 mark 白名单里，必须关掉。
      underline: false,
      heading: { levels: [...EDITOR_HEADING_LEVELS] },
      // 这三个单独配置（需要覆盖属性默认值），从 StarterKit 里摘出来。
      link: false,
      orderedList: false,
      codeBlock: false,
    }),
    SafeLink,
    SafeImage,
    SafeOrderedList,
    SafeCodeBlock,
    /** 粘贴净化：把 HTML 中不属于白名单的标签彻底摘掉。 */
    PasteSanitizer(),
  ];
}

/**
 * 粘贴净化插件。
 *
 * ProseMirror 的 HTML 解析器本身只会保留 schema 声明过的节点与属性，
 * 但仍有两条漏网路径：
 *   1. 粘贴的 HTML 里若含 `<a href="javascript:...">`，其 href 是**字符串属性**，
 *      解析器不会按 URL 协议过滤 —— 只能我们自己挡。
 *   2. `<img src="data:...">` 同理。
 *
 * 所以这里在粘贴事件上再过一遍：命中即**整条丢弃**（而不是悄悄改写 URL），
 * 因为"用户粘贴的内容被悄悄改掉"比"被拒绝并给出提示"更危险。
 */
const PasteSanitizerKey = new PluginKey('nla-paste-sanitizer');

const FORBIDDEN_PASTE_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /javascript:/i, reason: 'javascript: 协议' },
  { pattern: /\bvbscript:/i, reason: 'vbscript: 协议' },
  { pattern: /data:text\/html/i, reason: 'data:text/html' },
];

function PasteSanitizer(): Extension {
  return Extension.create({
    name: 'nlaPasteSanitizer',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: PasteSanitizerKey,
          props: {
            transformPastedHTML(html: string): string {
              // 服务端最终还会用 renderTiptapToSafeHtml 兜底，这里是第二道防线。
              // 目的不是"清洗"而是**识别并拒绝**危险片段。
              if (FORBIDDEN_PASTE_PATTERNS.some((rule) => rule.pattern.test(html))) {
                return '';
              }
              return html;
            },
          },
        }),
      ];
    },
  });
}

/**
 * 工具栏按钮定义。
 *
 * 这里刻意**不**接收 editor 实例：每个动作自己闭包捕获需要的命令，
 * 调用点（`action.run(editor)`）统一传入，定义与实例解耦，
 * 这样定义表本身可以脱离编辑器单测。
 */
export interface ToolbarAction {
  id: string;
  label: string;
  /** 可读的键盘/读屏名称，与可见文字一致或更具体。 */
  ariaLabel: string;
  run: (editor: Editor) => void;
  isActive: (editor: Editor) => boolean;
}

export function buildToolbar(): ToolbarAction[] {
  return [
    {
      id: 'bold',
      label: 'B',
      ariaLabel: '加粗',
      run: (e) => {
        e.chain().focus().toggleBold().run();
      },
      isActive: (e) => e.isActive('bold'),
    },
    {
      id: 'italic',
      label: 'I',
      ariaLabel: '斜体',
      run: (e) => {
        e.chain().focus().toggleItalic().run();
      },
      isActive: (e) => e.isActive('italic'),
    },
    {
      id: 'strike',
      label: 'S',
      ariaLabel: '删除线',
      run: (e) => {
        e.chain().focus().toggleStrike().run();
      },
      isActive: (e) => e.isActive('strike'),
    },
    {
      id: 'code',
      label: '‹›',
      ariaLabel: '行内代码',
      run: (e) => {
        e.chain().focus().toggleCode().run();
      },
      isActive: (e) => e.isActive('code'),
    },
    {
      id: 'h2',
      label: 'H2',
      ariaLabel: '二级标题',
      run: (e) => {
        e.chain().focus().toggleHeading({ level: 2 }).run();
      },
      isActive: (e) => e.isActive('heading', { level: 2 }),
    },
    {
      id: 'h3',
      label: 'H3',
      ariaLabel: '三级标题',
      run: (e) => {
        e.chain().focus().toggleHeading({ level: 3 }).run();
      },
      isActive: (e) => e.isActive('heading', { level: 3 }),
    },
    {
      id: 'bulletList',
      label: '• 列表',
      ariaLabel: '无序列表',
      run: (e) => {
        e.chain().focus().toggleBulletList().run();
      },
      isActive: (e) => e.isActive('bulletList'),
    },
    {
      id: 'orderedList',
      label: '1. 列表',
      ariaLabel: '有序列表',
      run: (e) => {
        e.chain().focus().toggleOrderedList().run();
      },
      isActive: (e) => e.isActive('orderedList'),
    },
    {
      id: 'blockquote',
      label: '引用',
      ariaLabel: '引用块',
      run: (e) => {
        e.chain().focus().toggleBlockquote().run();
      },
      isActive: (e) => e.isActive('blockquote'),
    },
    {
      id: 'codeBlock',
      label: '代码块',
      ariaLabel: '代码块',
      run: (e) => {
        e.chain().focus().toggleCodeBlock().run();
      },
      isActive: (e) => e.isActive('codeBlock'),
    },
    {
      id: 'horizontalRule',
      label: '分隔线',
      ariaLabel: '插入分隔线',
      run: (e) => {
        e.chain().focus().setHorizontalRule().run();
      },
      isActive: (e) => e.isActive('horizontalRule'),
    },
    {
      id: 'link',
      label: '链接',
      ariaLabel: '添加或移除链接',
      run: (e) => {
        if (e.isActive('link')) {
          e.chain().focus().unsetLink().run();
          return;
        }
        // `getAttributes` 的返回类型是 `Record<string, any>`；这里显式收窄成
        // `string | undefined`，不用 `as` 断言把 any 传播进后面的调用。
        const rawPrevious: unknown = e.getAttributes('link').href;
        const previous = typeof rawPrevious === 'string' ? rawPrevious : undefined;
        const href = window.prompt(
          '链接地址（仅允许 http / https / mailto / tel）',
          previous ?? 'https://',
        );
        if (href === null || href.trim() === '') {
          return;
        }
        const trimmed = href.trim();
        if (!isAllowedUrl(trimmed, ALLOWED_URL_PROTOCOLS)) {
          // 不静默改写：协议不合法就明确拒绝，让编辑知道为什么没加上
          window.alert('链接协议不被允许，只支持 http / https / mailto / tel。');
          return;
        }
        e.chain().focus().setLink({ href: trimmed }).run();
      },
      isActive: (e) => e.isActive('link'),
    },
  ];
}
