/**
 * SEO / 可访问性辅助（P2-04、P2-06）。
 *
 * 事实依据：技术方案 §9.3「每页唯一 title、description、canonical、Open Graph、
 * 中文 lang；文章用 Article、地点用合适的 Place；仅输出经过核实的数据」。
 *
 * 三条硬约束：
 * 1. JSON-LD 只输出可核验字段：坐标必须同时满足精度可展示 + 核验通过，
 *    发布时间必须能被解析；缺失就省略该字段而不是填占位。
 * 2. 正文 HTML 只能来自 `renderTiptapToSafeHtml`（已转义 + XSS 净化）。
 *    `injectHeadingIds` 只在已转义串上追加 `id` 属性，且 id 必须匹配
 *    `/^[a-z0-9一-鿿-]+$/`，因此不可能引入引号或标签。
 * 3. 域名未配置时不编造 canonical 主机名（PRD §19「P2 前：正式域名」仍是未决项）。
 */

import { extractPlainText, parseTiptapDocument, renderTiptapToSafeHtml } from '@nanking-atlas/validation';

import {
  buildExcerpt,
  canShowExactCoordinates,
  contentTypeLabel,
  type ContentRelation,
  type PlaceExtension,
  type PublicContent,
  type RouteExtension,
  type RouteStop,
} from './types';

import type { Metadata } from 'next';
import type { TiptapDocument, TiptapNode } from '@nanking-atlas/validation';

export const SITE_NAME = '金陵风物志';
export const SITE_LANG = 'zh-CN';
export const SITE_PUBLISHER = 'Nanking Atlas 编辑部';

export const DEFAULT_DESCRIPTION =
  'Nanking Atlas · 南京城市文化数字档案、互动街巷地图与城市生活记录平台。内容均以来源、版权与坐标核验为前提发布。';

const DESCRIPTION_MAX = 150;

/** 站点主机名：仅在显式配置后使用，未配置返回 null（不编造域名）。 */
export function siteOrigin(): string | null {
  const raw = process.env['NEXT_PUBLIC_SITE_URL'];
  if (typeof raw !== 'string' || raw === '') return null;
  return raw.replace(/\/+$/, '');
}

export function isSiteUrlConfigured(): boolean {
  return siteOrigin() !== null;
}

/** 规范 URL：配置了域名时给绝对地址，否则退回可分享的相对路径。 */
export function canonicalUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const origin = siteOrigin();
  return origin === null ? normalized : `${origin}${normalized}`;
}

/**
 * 索引策略：站点域名未确认前不允许索引 localhost，
 * 避免把错误的 canonical 推给搜索引擎（PRD §19 未决事项）。
 */
export function resolveIndexingPolicy(configured: boolean): { index: boolean; follow: boolean } {
  return { index: configured, follow: true };
}

export function truncateDescription(text: string, max = DESCRIPTION_MAX): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export interface PageMetadataInput {
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly type?: 'website' | 'article';
  readonly publishedAt?: string | null;
  readonly modifiedAt?: string | null;
  readonly imageUrl?: string | null;
  readonly noIndex?: boolean;
}

/** 每页唯一的 title / description / canonical / Open Graph。 */
export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const canonical = canonicalUrl(input.path);
  const description = truncateDescription(input.description);
  const title = input.title;

  return {
    title,
    description,
    alternates: { canonical },
    ...(input.noIndex === true
      ? { robots: { index: false, follow: false } }
      : { robots: resolveIndexingPolicy(isSiteUrlConfigured()) }),
    openGraph: {
      type: input.type === 'article' ? 'article' : 'website',
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: 'zh_CN',
      ...(input.imageUrl !== undefined && input.imageUrl !== null
        ? { images: [{ url: input.imageUrl }] }
        : {}),
      ...(input.type === 'article' && isValidIsoDate(input.publishedAt)
        ? { publishedTime: input.publishedAt }
        : {}),
    },
  };
}

function isValidIsoDate(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || value === '') return false;
  return !Number.isNaN(new Date(value).getTime());
}

// ---------------------------------------------------------------------------
// 正文渲染（安全 HTML + 锚点）
// ---------------------------------------------------------------------------

export interface HeadingEntry {
  readonly id: string;
  readonly text: string;
  readonly level: number;
}

export interface RenderedArticle {
  readonly html: string;
  readonly plainText: string;
  readonly headings: readonly HeadingEntry[];
  readonly valid: boolean;
}

const EMPTY_ARTICLE: RenderedArticle = { html: '', plainText: '', headings: [], valid: false };

/**
 * 解析并渲染正文。
 *
 * `parseTiptapDocument` 抛错（脏数据 / 超出白名单）时返回空正文而不是让页面 500，
 * 由页面显示"正文暂不可用"的降级提示。
 */
export function renderArticle(body: unknown): RenderedArticle {
  let doc: TiptapDocument;
  try {
    doc = parseTiptapDocument(body);
  } catch {
    return EMPTY_ARTICLE;
  }
  let escaped: string;
  let plainText: string;
  try {
    escaped = renderTiptapToSafeHtml(doc);
    plainText = extractPlainText(doc);
  } catch {
    return EMPTY_ARTICLE;
  }
  const headings = extractHeadingEntries(doc);
  return { html: injectHeadingIds(escaped, headings), plainText, headings, valid: true };
}

/** 中文友好的锚点 slug：小写化、保留 CJK/字母数字、其余折叠为连字符。 */
export function slugifyHeading(text: string): string {
  const normalized = text
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized === '' ? 'section' : normalized;
}

const SAFE_ID = /^[a-z0-9一-鿿-]+$/;

function headingLevel(node: TiptapNode): number {
  const level = node.attrs?.['level'];
  if (typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 6) return level;
  return 2;
}

function nodeText(node: TiptapNode): string {
  if (node.text !== undefined) return node.text;
  if (node.type === 'image') {
    const alt = node.attrs?.['alt'];
    return typeof alt === 'string' ? alt : '';
  }
  return (node.content ?? []).map(nodeText).join('');
}

/**
 * 提取全部 heading 节点并分配稳定 id（同名标题按出现顺序加 `-2`、`-3`…）。
 * 去重在"全部标题"范围内完成，TOC 再按层级过滤，保证锚点与正文一一对应。
 */
export function extractHeadingEntries(doc: TiptapDocument): HeadingEntry[] {
  const entries: HeadingEntry[] = [];
  const used = new Map<string, number>();

  const walk = (node: TiptapNode): void => {
    if (node.type === 'heading') {
      const text = nodeText(node).trim();
      if (text !== '') {
        const base = slugifyHeading(text);
        const seen = used.get(base) ?? 0;
        used.set(base, seen + 1);
        entries.push({
          id: seen === 0 ? base : `${base}-${seen + 1}`,
          text,
          level: headingLevel(node),
        });
      }
    }
    for (const child of node.content ?? []) walk(child);
  };

  for (const child of doc.content ?? []) walk(child);
  return entries;
}

export interface TocEntry {
  readonly id: string;
  readonly text: string;
  readonly level: number;
}

/** 目录条目：默认只收 h2/h3，避免 h1 与正文标题层级重复（可访问性要求不跳级）。 */
export function extractToc(doc: TiptapDocument, minLevel = 2, maxLevel = 3): TocEntry[] {
  return extractHeadingEntries(doc)
    .filter((entry) => entry.level >= minLevel && entry.level <= maxLevel)
    .map((entry) => ({ id: entry.id, text: entry.text, level: entry.level }));
}

/**
 * 在**已转义**的 HTML 上为标题补 `id` 锚点。
 *
 * 安全性：只做 `<hN>` 开标签 → `<hN id="...">` 的定点替换，
 * 且 id 必须匹配安全字符集，否则该标题保持原样。不会引入引号、尖括号或事件属性。
 */
export function injectHeadingIds(html: string, entries: readonly HeadingEntry[]): string {
  if (entries.length === 0) return html;
  let index = 0;
  return html.replace(/<h([1-6])>/g, (match, rawLevel: string) => {
    const entry = entries[index];
    index += 1;
    if (entry === undefined) return match;
    const level = Number.parseInt(rawLevel, 10);
    if (entry.level !== level || !SAFE_ID.test(entry.id)) return match;
    return `<h${level} id="${entry.id}">`;
  });
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

export interface JsonLdInput {
  readonly content: PublicContent;
  readonly plainText: string;
  readonly place?: PlaceExtension | null;
  readonly route?: RouteExtension | null;
  readonly relations?: readonly ContentRelation[];
}

/**
 * 按类型生成 JSON-LD。
 *
 * - 文章类（人物/事件/建筑/民俗/专题）→ `Article`
 * - 地点 → `Place`，`geo` 只在"精度可展示 + 核验通过"时输出
 * - 路线 → `TouristRoute`，仅在有站点时输出 itinerary
 * - 标题为空时返回 null（宁可不输出结构化数据，也不编造）。
 */
export function buildJsonLd(input: JsonLdInput): Record<string, unknown> | null {
  const { content } = input;
  if (content.title.trim() === '') return null;

  const url = canonicalUrl(detailPath(content));
  const description = truncateDescription(buildExcerpt(content.summary, input.plainText, 200));

  if (content.type === 'PLACE') {
    return buildPlaceJsonLd(content, input.place ?? null, url, description);
  }
  if (content.type === 'ROUTE') {
    return buildRouteJsonLd(content, input.route ?? null, url, description);
  }
  return buildArticleJsonLd(content, url, description);
}

function detailPath(content: PublicContent): string {
  switch (content.type) {
    case 'PLACE':
      return `/places/${content.slug}`;
    case 'TOPIC':
      return `/topics/${content.slug}`;
    case 'ROUTE':
      return `/routes/${content.slug}`;
    case 'PERSON':
      return `/people/${content.slug}`;
    case 'EVENT':
      return `/events/${content.slug}`;
    case 'ARCHITECTURE':
      return `/architectures/${content.slug}`;
    case 'TRADITION':
      return `/chronicle/${content.slug}`;
    default: {
      const exhaustive: never = content.type;
      return exhaustive;
    }
  }
}

function buildArticleJsonLd(
  content: PublicContent,
  url: string,
  description: string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: content.title,
    ...(content.subtitle !== null && content.subtitle !== ''
      ? { alternativeHeadline: content.subtitle }
      : {}),
    description,
    url,
    inLanguage: content.language === 'EN' ? 'en' : SITE_LANG,
    articleSection: contentTypeLabel(content.type),
    // 公开 DTO 不暴露个人作者，因此署名站点编辑部，不编造人名。
    author: { '@type': 'Organization', name: SITE_PUBLISHER },
    publisher: { '@type': 'Organization', name: SITE_PUBLISHER },
    ...(isValidIsoDate(content.publishedAt) ? { datePublished: content.publishedAt } : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
}

function buildPlaceJsonLd(
  content: PublicContent,
  place: PlaceExtension | null,
  url: string,
  description: string,
): Record<string, unknown> {
  const accuracy = place?.accuracy ?? null;
  const verification = place?.verificationStatus ?? null;
  const lon = place?.lon ?? null;
  const lat = place?.lat ?? null;

  const showGeo =
    canShowExactCoordinates(accuracy) &&
    verification === 'VERIFIED' &&
    typeof lon === 'number' &&
    typeof lat === 'number' &&
    Math.abs(lon) <= 180 &&
    Math.abs(lat) <= 90;

  const address =
    typeof place?.address === 'string' && place.address.trim() !== '' ? place.address : null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: content.title,
    ...(content.subtitle !== null && content.subtitle !== ''
      ? { alternateName: content.subtitle }
      : {}),
    description,
    url,
    inLanguage: content.language === 'EN' ? 'en' : SITE_LANG,
    ...(address !== null ? { address } : {}),
    // 未核验 / 仅区域级 / 未通过核验的坐标一律不进入结构化数据。
    ...(showGeo
      ? { geo: { '@type': 'GeoCoordinates', longitude: lon, latitude: lat } }
      : {}),
    ...(isValidIsoDate(content.publishedAt) ? { datePublished: content.publishedAt } : {}),
  };
}

function buildRouteJsonLd(
  content: PublicContent,
  route: RouteExtension | null,
  url: string,
  description: string,
): Record<string, unknown> {
  const stops = (route?.stops ?? []).filter(
    (stop): stop is RouteStop & { placeSlug: string } =>
      typeof stop.placeSlug === 'string' && stop.placeSlug !== '',
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristRoute',
    name: content.title,
    description,
    url,
    inLanguage: content.language === 'EN' ? 'en' : SITE_LANG,
    ...(typeof route?.durationMinutes === 'number'
      ? { totalTime: `PT${route.durationMinutes}M` }
      : {}),
    ...(typeof route?.distanceMeters === 'number'
      ? {
          distance: {
            '@type': 'QuantitativeValue',
            value: route.distanceMeters,
            unitCode: 'MTR',
          },
        }
      : {}),
    ...(stops.length > 0
      ? {
          itinerary: {
            '@type': 'ItemList',
            numberOfItems: stops.length,
            itemListElement: stops.map((stop, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: stop.placeTitle ?? stop.placeSlug,
              url: canonicalUrl(`/places/${stop.placeSlug}`),
            })),
          },
        }
      : {}),
  };
}

/** JSON-LD 脚本内容；`null` 时不渲染脚本节点。 */
export function serializeJsonLd(data: Record<string, unknown> | null): string | null {
  if (data === null) return null;
  // 转义 `<`/`>`/`&` 与行分隔符，避免标题里的 `</script>` 提前闭合脚本标签。
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/[\u2028\u2029]/g, (ch) => (ch === '\u2028' ? '\\u2028' : '\\u2029'));
}
