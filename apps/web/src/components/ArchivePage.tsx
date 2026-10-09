import { notFound } from 'next/navigation';
import { z } from 'zod';

import { ArchiveTemplate } from '@/components/ArchiveTemplate';
import {
  getContentRelations,
  getContentSources,
  getPlaceBySlug,
  getPublishedContentBySlug,
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

import type { Metadata } from 'next';
import type { TocEntry } from '@/lib/seo';

/** 详情页缓存策略：ISR 300 秒（技术方案 §9.1）。 */
export const DETAIL_REVALIDATE_SECONDS = 300;

const relationArraySchema = z.array(contentRelationSchema);
const sourceArraySchema = z.array(publicSourceSchema);

function extractArray(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    const data = (payload as { data: unknown }).data;
    if (Array.isArray(data)) return data;
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

export interface ArchivePageProps {
  readonly slug: string;
  /** 栏目允许的内容类型；命中其他类型时按"类型专属 404"处理（P2-05）。 */
  readonly allowedTypes: readonly ContentType[];
  readonly backHref: string;
  readonly backLabel: string;
}

/** 详情页数据装配（P2-03 / P2-04 / P2-05）：能取到就展示，取不到就降级说明。 */
export async function ArchivePage({ slug, allowedTypes, backHref, backLabel }: ArchivePageProps) {
  const result = await getPublishedContentBySlug(slug, {
    revalidate: DETAIL_REVALIDATE_SECONDS,
    tags: [`content:${slug}`],
  });

  // 未发布 / 不存在 / 接口未配置统一 404：不向访客暴露"资源存在但未发布"。
  if (!result.ok) notFound();

  const content: PublicContent = result.data;
  if (!allowedTypes.includes(content.type)) notFound();

  const article = renderArticle(content.body);
  const toc: TocEntry[] = article.headings
    .filter((heading) => heading.level >= 2 && heading.level <= 3)
    .map((heading) => ({ id: heading.id, text: heading.text, level: heading.level }));

  const [sources, relations, place] = await Promise.all([
    loadSources(content.id),
    loadRelations(content.id),
    loadPlaceExtension(content),
  ]);

  // 路线站点：公开 DTO 尚未开放 route 扩展字段，取不到就不渲染该区块。
  const route: RouteExtension | null = null;
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
