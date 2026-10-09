import Link from 'next/link';

import { ArticleBody } from '@/components/ArticleBody';
import { CorrectionNotice } from '@/components/CorrectionNotice';
import { JsonLdScript } from '@/components/JsonLdScript';
import { MediaCredits } from '@/components/MediaCredits';
import { RelationList } from '@/components/RelationList';
import { SourceList } from '@/components/SourceList';
import { TableOfContents } from '@/components/TableOfContents';
import { TypeBadge } from '@/components/TypeBadge';
import { TypeFacts } from '@/components/TypeFacts';
import { formatDateZh, type ContentRelation, type PublicContent, type PublicMedia, type PublicSource, type RouteStop, type TypeFact } from '@/lib/types';

import type { RenderedArticle, TocEntry } from '@/lib/seo';
import type { Route } from 'next';

export interface ArchiveTemplateProps {
  readonly content: PublicContent;
  readonly article: RenderedArticle;
  readonly toc: readonly TocEntry[];
  readonly sources: { readonly available: boolean; readonly items: readonly PublicSource[] };
  readonly relations: { readonly available: boolean; readonly items: readonly ContentRelation[] };
  readonly media: readonly PublicMedia[];
  readonly facts: readonly TypeFact[];
  readonly stops?: readonly RouteStop[];
  readonly backHref: string;
  readonly backLabel: string;
  readonly jsonLd: Record<string, unknown> | null;
}

/**
 * 统一档案详情模板（P2-03 / P2-04 / P2-05）。
 *
 * 所有栏目详情页共用这一个模板，只替换"类型专属字段区"与来源/关联数据。
 * 标题层级固定为 h1 → h2（正文内标题由编辑器控制为 h2/h3），不跳级。
 */
export function ArchiveTemplate(props: ArchiveTemplateProps) {
  const { content, article, toc, sources, relations, media, facts, stops, backHref, backLabel, jsonLd } =
    props;
  const published = formatDateZh(content.publishedAt);

  return (
    <article className="archive">
      <nav className="archive__breadcrumb" aria-label="面包屑">
        <Link href={backHref as Route}>{backLabel}</Link>
      </nav>

      <header className="archive__header">
        <p className="archive__meta">
          <TypeBadge type={content.type} />
          {published === '' ? null : (
            <time dateTime={content.publishedAt ?? undefined}>发布于 {published}</time>
          )}
        </p>
        <h1 className="archive__title">{content.title}</h1>
        {content.subtitle !== null && content.subtitle !== '' ? (
          <p className="archive__subtitle">{content.subtitle}</p>
        ) : null}
        {content.summary !== null && content.summary !== '' ? (
          <p className="archive__summary">{content.summary}</p>
        ) : null}
      </header>

      {toc.length > 0 ? <TableOfContents entries={toc} headingId="archive-toc" /> : null}

      <ArticleBody html={article.html} valid={article.valid} />

      {stops !== undefined && stops.length > 0 ? (
        <section className="archive__section" aria-labelledby="archive-stops">
          <h2 id="archive-stops">站点顺序</h2>
          <ol className="route-stops" role="list">
            {stops.map((stop) => (
              <li key={`${stop.position}-${stop.placeSlug ?? stop.placeTitle ?? ''}`} className="route-stops__item">
                <span className="route-stops__position">第 {stop.position + 1} 站</span>
                {stop.placeSlug !== null && stop.placeSlug !== undefined && stop.placeSlug !== '' ? (
                  <Link href={`/places/${stop.placeSlug}` as Route}>
                    {stop.placeTitle ?? stop.placeSlug}
                  </Link>
                ) : (
                  <span>{stop.placeTitle ?? '未命名站点'}</span>
                )}
                {stop.note !== null && stop.note !== undefined && stop.note !== '' ? (
                  <span className="route-stops__note">（{stop.note}）</span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {facts.length > 0 ? (
        <TypeFacts facts={facts} headingId="archive-facts" title="类型信息" />
      ) : null}

      <section className="archive__section" aria-labelledby="archive-media">
        <h2 id="archive-media">图片与版权</h2>
        <MediaCredits media={media} />
      </section>

      <section className="archive__section" aria-labelledby="archive-sources">
        <h2 id="archive-sources">参考来源</h2>
        <SourceList available={sources.available} sources={sources.items} />
      </section>

      <section className="archive__section" aria-labelledby="archive-relations">
        <h2 id="archive-relations">关联内容</h2>
        <RelationList available={relations.available} relations={relations.items} />
      </section>

      <CorrectionNotice slug={content.slug} />

      <JsonLdScript data={jsonLd} />
    </article>
  );
}
