import { z } from 'zod';

/**
 * Tiptap 文档的 schema 白名单校验 + 安全渲染（纯逻辑，零依赖除 zod）。
 *
 * 目的（AGENTS.md §4.1 / §4.3）：编辑器提交的 JSON 只能包含白名单内的 node/mark，
 * URL 协议受限，防止存储型 XSS。本模块是 API 侧唯一的文档结构校验边界；
 * Web/Admin 只负责编辑，渲染结果由服务端 `renderTiptapToSafeHtml` 产出。
 *
 * 安全约定：
 * - 未知 node/mark 一律拒绝，不静默丢弃（静默丢弃会掩盖校验漏洞）。
 * - attrs 采用 key 白名单，`onerror` / `style` 之类的额外属性无法进入。
 * - href/src 先解码 HTML entity 再判定协议，挡 `javascript&#58;` 这类绕过。
 * - 渲染只做字符串拼接 + 手写 escape，不存在 innerHTML 语义。
 */

/* -------------------------------------------------------------------------- */
/* 类型                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Tiptap JSON 节点 / 文档类型。
 *
 * 可选属性显式带 `| undefined`：仓库开启了 `exactOptionalPropertyTypes`，
 * 而 zod 的 `.optional()` 产出的就是 `attrs?: T | undefined`，
 * 不写出来无法满足 `tiptapDocumentSchema: z.ZodType<TiptapDocument>` 的标注。
 * 对消费方语义不变（仍是"可能缺省"，读取用 `node.attrs?.x`）。
 */
export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown> | undefined;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown> | undefined;
  content?: TiptapNode[] | undefined;
  marks?: TiptapMark[] | undefined;
  text?: string | undefined;
}

export interface TiptapDocument extends TiptapNode {
  type: 'doc';
}

/** 校验失败的结构化条目，`path` 形如 `content[0].content[1].attrs.src`。 */
export interface TiptapIssue {
  code: string;
  path: string;
  message: string;
}

/** `parseTiptapDocument` 抛出的错误，携带结构化 issues 而不是字符串。 */
export class TiptapDocumentError extends Error {
  readonly issues: readonly TiptapIssue[];

  constructor(issues: readonly TiptapIssue[]) {
    const head = issues
      .slice(0, 5)
      .map((issue) => `${issue.path === '' ? 'doc' : issue.path}: ${issue.message}`)
      .join('; ');
    const more = issues.length > 5 ? ` (+${issues.length - 5} 项)` : '';
    super(`Tiptap 文档校验失败（${issues.length} 项）：${head}${more}`);
    this.name = 'TiptapDocumentError';
    this.issues = issues;
  }
}

/** 渲染阶段遇到未知 type / 不安全 URL 时抛出；同样不静默丢弃。 */
export class TiptapRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TiptapRenderError';
  }
}

/* -------------------------------------------------------------------------- */
/* 白名单常量                                                                  */
/* -------------------------------------------------------------------------- */

/** 允许的 node type（任何不在此列表的 type 一律拒绝）。 */
export const ALLOWED_TIPTAP_NODES: readonly string[] = [
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
  'image',
];

/** 允许的 mark type。`script` / `style` / `iframe` 等不存在于白名单。 */
export const ALLOWED_TIPTAP_MARKS: readonly string[] = [
  'bold',
  'italic',
  'strike',
  'code',
  'link',
];

/** 允许的 URL 协议；`javascript:` / `data:` / `vbscript:` / `file:` 均不在其中。 */
export const ALLOWED_URL_PROTOCOLS: readonly string[] = ['http', 'https', 'mailto', 'tel'];

/** image.src 额外限定为 http/https（mailto/tel 对图片无意义）。 */
const IMAGE_URL_PROTOCOLS: readonly string[] = ['http', 'https'];

/** 链接一律强制附加，避免 tabnabbing 与 SEO 权重外泄；不信任前端传入的 rel。 */
export const FORCED_LINK_REL = 'noopener noreferrer nofollow';

/** 深度上限（root doc 记为 1），防嵌套爆栈。 */
export const MAX_TIPTAP_DEPTH = 32;

/** 节点总数上限，防超大文档 DoS。 */
export const MAX_TIPTAP_NODE_COUNT = 5000;

const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'image',
] as const;

const INLINE_TYPES = ['text', 'hardBreak'] as const;

const LIST_TYPES = ['bulletList', 'orderedList'] as const;

/** 允许的子节点集合；`null` 表示叶子/void 节点，不得带 children。 */
const ALLOWED_CHILDREN: Readonly<Record<string, readonly string[] | null>> = {
  doc: BLOCK_TYPES,
  paragraph: INLINE_TYPES,
  heading: INLINE_TYPES,
  blockquote: BLOCK_TYPES,
  bulletList: ['listItem'],
  orderedList: ['listItem'],
  listItem: BLOCK_TYPES,
  codeBlock: ['text'],
  text: null,
  hardBreak: null,
  horizontalRule: null,
  image: null,
};

/** 各 node 允许的 attrs key 白名单；未列出的 key 一律拒绝。 */
const NODE_ATTR_KEYS: Readonly<Record<string, readonly string[]>> = {
  doc: [],
  paragraph: [],
  text: [],
  heading: ['level'],
  bulletList: [],
  orderedList: [],
  listItem: [],
  blockquote: [],
  codeBlock: [],
  hardBreak: [],
  horizontalRule: [],
  image: ['src', 'alt', 'title', 'width', 'height'],
};

/** 各 mark 允许的 attrs key 白名单。 */
const MARK_ATTR_KEYS: Readonly<Record<string, readonly string[]>> = {
  bold: [],
  italic: [],
  strike: [],
  code: [],
  link: ['href', 'target', 'rel', 'class'],
};

const ALLOWED_LINK_TARGETS: readonly string[] = ['_blank', '_self'];

const ALLOWED_NODE_SET = new Set<string>(ALLOWED_TIPTAP_NODES);
const ALLOWED_MARK_SET = new Set<string>(ALLOWED_TIPTAP_MARKS);

/* -------------------------------------------------------------------------- */
/* zod 结构 schema                                                             */
/* -------------------------------------------------------------------------- */

const markSchema: z.ZodType<TiptapMark> = z
  .object({
    type: z.string().min(1),
    attrs: z.record(z.unknown()).optional(),
  })
  .strict();

const nodeSchema: z.ZodType<TiptapNode> = z.lazy(() =>
  z
    .object({
      type: z.string().min(1),
      attrs: z.record(z.unknown()).optional(),
      content: z.array(nodeSchema).optional(),
      marks: z.array(markSchema).optional(),
      text: z.string().optional(),
    })
    .strict(),
);

const docBaseSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(nodeSchema).optional(),
    marks: z.array(markSchema).optional(),
  })
  .strict();

export const tiptapDocumentSchema: z.ZodType<TiptapDocument> = docBaseSchema.superRefine(
  (doc, ctx) => {
    for (const issue of collectDocumentIssues(doc)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.path,
        message: issue.message,
      });
    }
  },
);

function pathString(path: readonly (string | number)[]): string {
  let out = '';
  for (const segment of path) {
    out += typeof segment === 'number' ? `[${segment}]` : out === '' ? segment : `.${segment}`;
  }
  return out;
}

/** zod 抛出的 issue 转成对外结构。 */
function fromZodIssues(error: z.ZodError): TiptapIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: pathString(issue.path),
    message: issue.message,
  }));
}

interface RuleIssue {
  path: (string | number)[];
  message: string;
}

/**
 * 遍历整棵树收集业务规则错误（层级、attrs、marks、深度、节点数）。
 * 只在结构解析成功后调用。
 */
function collectDocumentIssues(doc: TiptapDocument): RuleIssue[] {
  const issues: RuleIssue[] = [];

  const metrics = measureTree(doc);
  if (metrics.depth > MAX_TIPTAP_DEPTH) {
    issues.push({
      path: [],
      message: `文档嵌套深度 ${metrics.depth} 超过上限 ${MAX_TIPTAP_DEPTH}`,
    });
  }
  if (metrics.nodeCount > MAX_TIPTAP_NODE_COUNT) {
    issues.push({
      path: [],
      message: `节点总数 ${metrics.nodeCount} 超过上限 ${MAX_TIPTAP_NODE_COUNT}`,
    });
  }

  visitNode(doc, [], null, issues);
  return issues;
}

function visitNode(
  node: TiptapNode,
  path: (string | number)[],
  parentType: string | null,
  issues: RuleIssue[],
): void {
  if (!ALLOWED_NODE_SET.has(node.type)) {
    issues.push({
      path: [...path, 'type'],
      message: `不在白名单内的 node type: ${node.type}（禁止 script/style/iframe/object/embed/form/input 等）`,
    });
    return;
  }

  // 父节点层级约束（根节点无父级，跳过）
  if (parentType !== null) {
    const parentAllowed = ALLOWED_CHILDREN[parentType];
    if (parentAllowed !== undefined && parentAllowed !== null && !parentAllowed.includes(node.type)) {
      issues.push({
        path: [...path, 'type'],
        message: `node type "${node.type}" 不能出现在 "${parentType}" 内`,
      });
      return;
    }
  }

  // text 必须有非空内容
  if (node.type === 'text') {
    if (typeof node.text !== 'string' || node.text.length === 0) {
      issues.push({ path: [...path, 'text'], message: 'text 节点必须带非空 text 字段' });
    }
  }

  validateNodeAttrs(node, path, issues);
  validateMarks(node, path, issues);

  const allowedChildren = ALLOWED_CHILDREN[node.type];
  const children = node.content ?? [];

  if (allowedChildren === null) {
    if (children.length > 0) {
      issues.push({
        path: [...path, 'content'],
        message: `void 节点 "${node.type}" 不能包含 children`,
      });
    }
    return;
  }

  if (
    (node.type === 'listItem' || LIST_TYPES.some((t) => t === node.type)) &&
    children.length === 0
  ) {
    issues.push({
      path: [...path, 'content'],
      message: `"${node.type}" 至少需要 1 个子节点`,
    });
  }

  children.forEach((child, index) => {
    visitNode(child, [...path, 'content', index], node.type, issues);
  });
}

function validateNodeAttrs(
  node: TiptapNode,
  path: (string | number)[],
  issues: RuleIssue[],
): void {
  const attrs = node.attrs;
  const allowedKeys = NODE_ATTR_KEYS[node.type] ?? [];

  if (attrs === undefined) {
    if (node.type === 'image') {
      issues.push({ path: [...path, 'attrs'], message: 'image 必须提供 attrs.src' });
    }
    return;
  }

  for (const key of Object.keys(attrs)) {
    if (!allowedKeys.includes(key)) {
      issues.push({
        path: [...path, 'attrs', key],
        message: `node "${node.type}" 不允许 attr "${key}"`,
      });
    }
  }

  if (node.type === 'heading') {
    const level = attrs['level'];
    if (level !== undefined) {
      if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 6) {
        issues.push({
          path: [...path, 'attrs', 'level'],
          message: 'heading.attrs.level 必须是 1..6 的整数（缺省视为 2）',
        });
      }
    }
  }

  if (node.type === 'image') {
    const urlProblem = urlError(attrs['src'], IMAGE_URL_PROTOCOLS, 'image.attrs.src');
    if (urlProblem !== null) {
      issues.push({ path: [...path, 'attrs', 'src'], message: urlProblem });
    }
    for (const key of ['alt', 'title']) {
      const value = attrs[key];
      if (value !== undefined && typeof value !== 'string') {
        issues.push({
          path: [...path, 'attrs', key],
          message: `image.attrs.${key} 必须是字符串`,
        });
      }
    }
    for (const key of ['width', 'height']) {
      const value = attrs[key];
      if (value !== undefined) {
        const valid =
          typeof value === 'number' &&
          Number.isInteger(value) &&
          value > 0 &&
          value <= 10000;
        if (!valid) {
          issues.push({
            path: [...path, 'attrs', key],
            message: `image.attrs.${key} 必须是 1..10000 的正整数`,
          });
        }
      }
    }
  }
}

function validateMarks(
  node: TiptapNode,
  path: (string | number)[],
  issues: RuleIssue[],
): void {
  const marks = node.marks;
  if (marks === undefined) {
    return;
  }

  if (node.type !== 'text') {
    issues.push({
      path: [...path, 'marks'],
      message: `只有 text 节点可以带 marks，"${node.type}" 不允许`,
    });
    return;
  }

  if (marks.length === 0) {
    issues.push({ path: [...path, 'marks'], message: 'marks 数组不能为空' });
    return;
  }

  marks.forEach((mark, index) => {
    const markPath = [...path, 'marks', index];
    if (!ALLOWED_MARK_SET.has(mark.type)) {
      issues.push({
        path: [...markPath, 'type'],
        message: `不在白名单内的 mark type: ${mark.type}`,
      });
      return;
    }

    const attrs = mark.attrs;
    const allowedKeys = MARK_ATTR_KEYS[mark.type] ?? [];
    if (attrs !== undefined) {
      for (const key of Object.keys(attrs)) {
        if (!allowedKeys.includes(key)) {
          issues.push({
            path: [...markPath, 'attrs', key],
            message: `mark "${mark.type}" 不允许 attr "${key}"`,
          });
        }
      }
    }

    if (mark.type === 'link') {
      const urlProblem = urlError(attrs?.['href'], ALLOWED_URL_PROTOCOLS, 'link.attrs.href');
      if (urlProblem !== null) {
        issues.push({ path: [...markPath, 'attrs', 'href'], message: urlProblem });
      }
      const target = attrs?.['target'];
      if (target !== undefined) {
        if (typeof target !== 'string' || !ALLOWED_LINK_TARGETS.includes(target)) {
          issues.push({
            path: [...markPath, 'attrs', 'target'],
            message: 'link.attrs.target 只允许 _blank 或 _self',
          });
        }
      }
      for (const key of ['rel', 'class']) {
        const value = attrs?.[key];
        if (value !== undefined && typeof value !== 'string') {
          issues.push({
            path: [...markPath, 'attrs', key],
            message: `link.attrs.${key} 必须是字符串`,
          });
        }
      }
    }
  });
}

/* -------------------------------------------------------------------------- */
/* 结构度量（解析前/解析后通用，做 DoS 预检）                                    */
/* -------------------------------------------------------------------------- */

interface TreeMetrics {
  depth: number;
  nodeCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 迭代式遍历，统计深度与节点数。故意不用递归：预检必须能在
 * 超深输入上安全返回（zod 递归解析前就拦住）。
 */
function measureTree(value: unknown): TreeMetrics {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 1 }];
  let depth = 0;
  let nodeCount = 0;

  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) {
      break;
    }
    if (!isRecord(item.value) || typeof item.value['type'] !== 'string') {
      continue;
    }
    nodeCount += 1;
    if (item.depth > depth) {
      depth = item.depth;
    }
    if (nodeCount > MAX_TIPTAP_NODE_COUNT) {
      return { depth, nodeCount };
    }
    const content = item.value['content'];
    if (Array.isArray(content)) {
      for (const child of content) {
        stack.push({ value: child, depth: item.depth + 1 });
      }
    }
  }

  return { depth, nodeCount };
}

/* -------------------------------------------------------------------------- */
/* URL 安全校验                                                                */
/* -------------------------------------------------------------------------- */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  tab: '\t',
  newline: '\n',
  sol: '/',
  nbsp: '\u00a0',
  lpar: '(',
  rpar: ')',
};

/** 解码一轮 HTML entity（数字与常见命名实体）。未识别的原样返回。 */
function decodeEntitiesOnce(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/giu, (match, body: string) => {
    const lower = body.toLowerCase();

    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }

    return NAMED_ENTITIES[lower] ?? match;
  });
}

/**
 * 反复解码直到稳定（上限 5 轮），挡 `&amp;#58;` 这类多重编码绕过。
 * 只用于"判定协议"，渲染时再用同一函数解码一次，保证输出的是真实 URL。
 */
function decodeEntities(input: string): string {
  let current = input;
  for (let round = 0; round < 5; round += 1) {
    const next = decodeEntitiesOnce(current);
    if (next === current) {
      break;
    }
    current = next;
  }
  return current;
}

/** 控制字符、空白、零宽字符一律拒绝（`java\tscript:` 会被这条挡下）。 */
const UNSAFE_URL_CHARS = /[\u0000-\u0020\u007f-\u00a0\u200b-\u200f\u2028-\u202f\u2060\ufeff]/u;

/** 引号与尖括号在属性上下文里没有合法用途，直接拒绝。 */
const URL_PUNCTUATION = /["'<>`\\]/u;

const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/iu;

/**
 * 校验 URL：必须以白名单协议开头、无控制字符/空白、非协议相对。
 * 通过时返回解码后的 URL（供渲染），不通过返回错误信息。
 */
export function decodeAndCheckUrl(
  value: unknown,
  allowedProtocols: readonly string[],
  field: string,
): { url: string } | { error: string } {
  if (typeof value !== 'string') {
    return { error: `${field} 必须是字符串 URL` };
  }
  if (value.length === 0) {
    return { error: `${field} 不能为空` };
  }
  if (value.length > 2048) {
    return { error: `${field} 长度不能超过 2048` };
  }

  const decoded = decodeEntities(value);

  if (UNSAFE_URL_CHARS.test(decoded)) {
    return { error: `${field} 不能包含空白字符或控制字符` };
  }
  if (URL_PUNCTUATION.test(decoded)) {
    return { error: `${field} 不能包含引号、尖括号或反斜杠` };
  }
  if (decoded.startsWith('//')) {
    return { error: `${field} 不能是协议相对地址（//host）` };
  }

  const match = SCHEME_PATTERN.exec(decoded);
  if (match === null) {
    return { error: `${field} 必须以 ${allowedProtocols.join('/')} 之一开头` };
  }

  const protocol = (match[1] ?? '').toLowerCase();
  if (!allowedProtocols.includes(protocol)) {
    return { error: `${field} 使用了不允许的协议 "${protocol}"` };
  }

  return { url: decoded };
}

function urlError(
  value: unknown,
  allowedProtocols: readonly string[],
  field: string,
): string | null {
  const result = decodeAndCheckUrl(value, allowedProtocols, field);
  return 'error' in result ? result.error : null;
}

/* -------------------------------------------------------------------------- */
/* 解析入口                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 校验并返回归一化文档。失败抛 `TiptapDocumentError`（携带结构化 issues）。
 * 解析前先做深度/节点数预检，避免畸形输入把递归解析或渲染撑爆。
 */
export function parseTiptapDocument(input: unknown): TiptapDocument {
  const metrics = measureTree(input);
  const preIssues: RuleIssue[] = [];
  if (metrics.depth > MAX_TIPTAP_DEPTH) {
    preIssues.push({
      path: [],
      message: `文档嵌套深度 ${metrics.depth} 超过上限 ${MAX_TIPTAP_DEPTH}`,
    });
  }
  if (metrics.nodeCount > MAX_TIPTAP_NODE_COUNT) {
    preIssues.push({
      path: [],
      message: `节点总数 ${metrics.nodeCount} 超过上限 ${MAX_TIPTAP_NODE_COUNT}`,
    });
  }
  if (preIssues.length > 0) {
    throw new TiptapDocumentError(
      preIssues.map((issue) => ({ code: 'too_large', path: pathString(issue.path), message: issue.message })),
    );
  }

  const result = tiptapDocumentSchema.safeParse(input);
  if (!result.success) {
    throw new TiptapDocumentError(fromZodIssues(result.error));
  }
  return result.data;
}

/* -------------------------------------------------------------------------- */
/* 纯文本提取                                                                  */
/* -------------------------------------------------------------------------- */

function nodeText(node: TiptapNode): string {
  switch (node.type) {
    case 'text':
      return node.text ?? '';
    case 'hardBreak':
      return '\n';
    case 'image':
      return '';
    case 'codeBlock':
      // codeBlock 保留原始换行语义，不做空白折叠。
      return (node.content ?? []).map(nodeText).join('');
    case 'paragraph':
    case 'heading':
    case 'listItem':
    case 'blockquote':
      return (node.content ?? []).map(nodeText).join('');
    case 'bulletList':
    case 'orderedList':
      return (node.content ?? [])
        .map((child) => nodeText(child))
        .filter((line) => line.length > 0)
        .join('\n');
    default:
      throw new TiptapRenderError(`无法提取未知 node type 的纯文本: ${node.type}`);
  }
}

/**
 * 供搜索索引 / 摘要使用的纯文本。
 * 非 codeBlock 段落折叠连续空白并去掉空行，块之间用单换行分隔。
 */
export function extractPlainText(doc: TiptapDocument): string {
  const blocks = (doc.content ?? [])
    .map((node) => nodeText(node))
    .map((block) => (block.includes('\n') ? block : collapseSpaces(block)))
    .filter((block) => block.trim().length > 0);

  return blocks.join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}

function collapseSpaces(value: string): string {
  return value.replace(/[^\S\n]+/gu, ' ').trim();
}

/* -------------------------------------------------------------------------- */
/* 安全渲染                                                                    */
/* -------------------------------------------------------------------------- */

const ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 手写 escape：& < > " ' 全部转义。渲染链路里没有任何 innerHTML 语义。 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => ESCAPE_MAP[char] ?? char);
}

function renderMarks(node: TiptapNode): { open: string; close: string } {
  const marks = node.marks ?? [];
  let open = '';
  let close = '';

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        open += '<strong>';
        close = `</strong>${close}`;
        break;
      case 'italic':
        open += '<em>';
        close = `</em>${close}`;
        break;
      case 'strike':
        open += '<s>';
        close = `</s>${close}`;
        break;
      case 'code':
        open += '<code>';
        close = `</code>${close}`;
        break;
      case 'link': {
        const result = decodeAndCheckUrl(
          mark.attrs?.['href'],
          ALLOWED_URL_PROTOCOLS,
          'link.attrs.href',
        );
        if ('error' in result) {
          throw new TiptapRenderError(result.error);
        }
        const href = escapeHtml(result.url);
        // rel 强制覆盖，不信任前端传入的值。
        const target = mark.attrs?.['target'];
        const targetAttr = target === '_blank' ? ' target="_blank"' : '';
        open += `<a href="${href}" rel="${FORCED_LINK_REL}"${targetAttr}>`;
        close = `</a>${close}`;
        break;
      }
      default:
        throw new TiptapRenderError(`未知 mark type，拒绝渲染: ${mark.type}`);
    }
  }

  return { open, close };
}

function renderChildren(node: TiptapNode): string {
  return (node.content ?? []).map(renderNode).join('');
}

function renderNode(node: TiptapNode): string {
  switch (node.type) {
    case 'text': {
      const { open, close } = renderMarks(node);
      return `${open}${escapeHtml(node.text ?? '')}${close}`;
    }
    case 'paragraph':
      return `<p>${renderChildren(node)}</p>`;
    case 'heading': {
      const level = headingLevel(node);
      return `<h${level}>${renderChildren(node)}</h${level}>`;
    }
    case 'bulletList':
      return `<ul>${renderChildren(node)}</ul>`;
    case 'orderedList':
      return `<ol>${renderChildren(node)}</ol>`;
    case 'listItem':
      return `<li>${renderChildren(node)}</li>`;
    case 'blockquote':
      return `<blockquote>${renderChildren(node)}</blockquote>`;
    case 'codeBlock':
      return `<pre><code>${renderChildren(node)}</code></pre>`;
    case 'horizontalRule':
      return '<hr>';
    case 'hardBreak':
      return '<br>';
    case 'image':
      return renderImage(node);
    case 'doc':
      return renderChildren(node);
    default:
      throw new TiptapRenderError(`未知 node type，拒绝渲染: ${node.type}`);
  }
}

function headingLevel(node: TiptapNode): number {
  const level = node.attrs?.['level'];
  if (typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 6) {
    return level;
  }
  return 2;
}

function renderImage(node: TiptapNode): string {
  const result = decodeAndCheckUrl(
    node.attrs?.['src'],
    IMAGE_URL_PROTOCOLS,
    'image.attrs.src',
  );
  if ('error' in result) {
    throw new TiptapRenderError(result.error);
  }

  const alt = typeof node.attrs?.['alt'] === 'string' ? (node.attrs['alt'] as string) : '';
  const title = typeof node.attrs?.['title'] === 'string' ? node.attrs['title'] : undefined;
  const width = positiveDimension(node.attrs?.['width']);
  const height = positiveDimension(node.attrs?.['height']);

  let html = `<img src="${escapeHtml(result.url)}" alt="${escapeHtml(alt)}"`;
  if (width !== undefined) {
    html += ` width="${width}"`;
  }
  if (height !== undefined) {
    html += ` height="${height}"`;
  }
  if (title !== undefined) {
    html += ` title="${escapeHtml(title)}"`;
  }
  return `${html} loading="lazy">`;
}

function positiveDimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 10000
    ? value
    : undefined;
}

/**
 * 把文档渲染为安全 HTML 字符串。
 * 纯字符串拼接 + escape；遇到未知 type 或不安全 URL 抛 `TiptapRenderError`，
 * 绝不静默丢弃内容（静默丢弃会掩盖 schema 校验漏洞）。
 * 返回值可以安全地作为 HTML 源码使用，调用方负责选择注入方式。
 */
export function renderTiptapToSafeHtml(doc: TiptapDocument): string {
  if (doc.type !== 'doc') {
    throw new TiptapRenderError(`renderTiptapToSafeHtml 只接受 type="doc" 的文档，收到 "${doc.type}"`);
  }
  return renderNode(doc);
}