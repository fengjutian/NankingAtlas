import { notFound } from 'next/navigation';
import { z } from 'zod';

import type { TocEntry } from '@/lib/seo';
import type { Metadata, Route } from 'next';

import { ArchiveTemplate } from '@/components/ArchiveTemplate';
import {
  failureMessage,
  getContentRelations,
  getContentSources,
  getPlaceBySlug,
  getPublishedContentBySlug,
  isServiceUnavailable,
  type ApiFailureReason,
} from '@/lib/api';
import { buildJsonLd, buildPageMetadata, renderArticle, truncateDescription } from '@/lib/seo';
import {
  buildExcerpt,
  buildTypeFacts,
  contentRelationSchema,
  detailHref,
  publicSourceSchema,
  type ContentRelation,
  type ContentType,
  type PlaceExtension,
  type PublicContent,
  type PublicMedia,
  type PublicSource,
  type RouteExtension,
  type RouteStop,
} from '@/lib/types';

/** 详情页缓存策略：ISR 300 秒（技术方案 §9.1）。 */
export const DETAIL_REVALIDATE_SECONDS = 300;

const relationArraySchema = z.array(contentRelationSchema);
const sourceArraySchema = z.array(publicSourceSchema);

/** `Array.isArray` 的安全守卫：避免把 `any[]` 当成 `unknown[]` 返回。 */
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function extractArray(payload: unknown): unknown[] | null {
  if (isUnknownArray(payload)) return payload;
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    const data = payload.data;
    if (isUnknownArray(data)) return data;
  }
  return null;
}

/** 关联内容：接口未开放（403）或形状不符时降级，不 500。 */
async function loadRelations(contentId: string): Promise<{
  available: boolean;
  items: ContentRelation[];
}> {
  const result = await getContentRelations(contentId, { revalidate: DETAIL_REVALIDATE_SECONDS });
  if (!result.ok) return { available: false, items: [] };
  const raw = extractArray(result.data);
  if (raw === null) return { available: false, items: [] };
  const parsed = relationArraySchema.safeParse(raw);
  return parsed.success ? { available: true, items: parsed.data } : { available: false, items: [] };
}

/** 来源清单：同上，公开端点就绪前页面显示"未开放"说明。 */
async function loadSources(contentId: string): Promise<{
  available: boolean;
  items: PublicSource[];
}> {
  const result = await getContentSources(contentId, { revalidate: DETAIL_REVALIDATE_SECONDS });
  if (!result.ok) return { available: false, items: [] };
  const raw = extractArray(result.data);
  if (raw === null) return { available: false, items: [] };
  const parsed = sourceArraySchema.safeParse(raw);
  return parsed.success ? { available: true, items: parsed.data } : { available: false, items: [] };
}

/** 地点扩展字段（地址/坐标/精度/核验状态）；端点未就绪时全部为 null。 */
async function loadPlaceExtension(content: PublicContent): Promise<PlaceExtension | null> {
  if (content.type !== 'PLACE') return null;
  const result = await getPlaceBySlug(content.slug, {
    revalidate: DETAIL_REVALIDATE_SECONDS,
    tags: [`place:${content.slug}`],
  });
  if (!result.ok) return null;
  return {
    address: result.data.address ?? null,
    lon: result.data.lon ?? null,
    lat: result.data.lat ?? null,
    accuracy: result.data.accuracy ?? null,
    verificationStatus: result.data.verificationStatus ?? null,
  };
}

/**
 * 路线扩展字段：公开端点尚未开放（`GET /api/v1/routes/:slug` 未实现），
 * 因此返回 null，页面据此降级为"站点信息暂缺"，而不是伪造站点。
 */
function loadRouteExtension(_content: PublicContent): RouteExtension | null {
  return null;
}

export interface ArchivePageProps {
  readonly slug: string;
  /** 栏目允许的内容类型；命中其他类型时按"类型专属 404"处理（P2-05）。 */
  readonly allowedTypes: readonly ContentType[];
  /** 返回链接；需为 `Route` 以满足 `typedRoutes`（见 ArchiveTemplate 同名属性的说明）。 */
  readonly backHref: Route;
  readonly backLabel: string;
}

/** 详情页数据装配（P2-03 / P2-04 / P2-05）：能取到就展示，取不到就降级说明。 */
export async function ArchivePage({ slug, allowedTypes, backHref, backLabel }: ArchivePageProps) {
  const result = await getPublishedContentBySlug(slug, {
    revalidate: DETAIL_REVALIDATE_SECONDS,
    tags: [`content:${slug}`],
  });

  if (!result.ok) {
    // 区分"内容不存在"与"服务不可用"：
    //   - not_found / forbidden / invalid_payload → 404（内容确实不可见）
    //   - unconfigured / network / http_error     → 503（站点或接口故障）
    //
    // 混为一谈会让爬虫把"接口挂了"当成"内容已撤"而从索引移除，
    // 也会让运维看不出站点故障（技术方案 §9.3 要求撤回后正确返回 404）。
    if (isServiceUnavailable(result.reason)) {
      return <ServiceUnavailableState reason={result.reason} />;
    }
    notFound();
  }

  const content: PublicContent = result.data;
  if (!allowedTypes.includes(content.type)) notFound();

  const article = renderArticle(content.body);
  const toc: TocEntry[] = article.headings
    .filter((heading) => heading.level >= 2 && heading.level <= 3)
    .map((heading) => ({ id: heading.id, text: heading.text, level: heading.level }));

  const route = loadRouteExtension(content);
  const [sources, relations, place] = await Promise.all([
    loadSources(content.id),
    loadRelations(content.id),
    loadPlaceExtension(content),
  ]);

  // 路线站点：公开 DTO 尚未开放 route 扩展字段，取不到就不渲染该区块。
  const stops: readonly RouteStop[] | undefined = route?.stops ?? undefined;
  const facts = buildTypeFacts(content, { place, route });
  const media: readonly PublicMedia[] = [];

  return (
    <div className="shell">
      <ArchiveTemplate
        content={content}
        article={article}
        toc={toc}
        sources={sources}
        relations={relations}
        media={media}
        facts={facts}
        {...(stops !== undefined ? { stops } : {})}
        backHref={backHref}
        backLabel={backLabel}
        jsonLd={buildJsonLd({
          content,
          plainText: article.plainText,
          place,
          route,
          relations: relations.items,
        })}
      />
    </div>
  );
}

/**
 * 站点/接口不可用（503 语义）。
 *
 * 刻意**不调用** `notFound()`：那是 404，会让爬虫以为内容已撤而下架。
 * 这里渲染可重试的错误页，并标 noindex（内容状态未知，不该进索引）。
 */
function ServiceUnavailableState({ reason }: { readonly reason: ApiFailureReason }) {
  return (
    <div className="shell">
      <section aria-labelledby="unavailable-title" role="status" style={{ padding: '3rem 0' }}>
        <h1 id="unavailable-title">内容暂时无法访问</h1>
        <p>{failureMessage(reason)}</p>
        <p>
          这通常是站点维护或内容接口暂时故障导致的，<strong>不代表该内容已被移除</strong>。
        </p>
        <p>
          <a href="/">返回首页</a>
        </p>
      </section>
    </div>
  );
}

/** 详情页 metadata（P2-06）；取不到内容时不生成错误 canonical。 */
export async function buildArchiveMetadata(
  slug: string,
  allowedTypes: readonly ContentType[],
): Promise<Metadata> {
  const result = await getPublishedContentBySlug(slug, { revalidate: DETAIL_REVALIDATE_SECONDS });
  if (!result.ok) {
    return { title: '内容不可用', robots: { index: false, follow: false } };
  }
  const content = result.data;
  if (!allowedTypes.includes(content.type)) {
    return { title: '内容不可用', robots: { index: false, follow: false } };
  }
  const article = renderArticle(content.body);
  return buildPageMetadata({
    title: content.title,
    description: truncateDescription(buildExcerpt(content.summary, article.plainText)),
    path: detailHref(content),
    type: 'article',
    publishedAt: content.publishedAt,
  });
}
