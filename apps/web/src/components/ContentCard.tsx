import Link from 'next/link';

import { TypeBadge } from '@/components/TypeBadge';
import { buildExcerpt, detailHref, formatDateZh, type PublicContent } from '@/lib/types';

import type { Route } from 'next';

export interface ContentCardProps {
  readonly content: PublicContent;
  /** 列表页固定 h3（栏目标题为 h2），避免标题层级跳级。 */
  readonly headingLevel?: 2 | 3;
}

/** 列表项：标题、副标题、摘要、类型徽标、发布日期。 */
export function ContentCard({ content, headingLevel = 3 }: ContentCardProps) {
  const href = detailHref(content);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const published = formatDateZh(content.publishedAt);
  const excerpt = buildExcerpt(content.summary, '');

  return (
    <article className="content-card">
      <p className="content-card__meta">
        <TypeBadge type={content.type} />
        {published === '' ? null : (
          <time className="content-card__date" dateTime={content.publishedAt ?? undefined}>
            {published}
          </time>
        )}
      </p>
      <Heading className="content-card__title">
        <Link href={href as Route}>{content.title}</Link>
      </Heading>
      {content.subtitle !== null && content.subtitle !== '' ? (
        <p className="content-card__subtitle">{content.subtitle}</p>
      ) : null}
      {excerpt === '' ? null : <p className="content-card__excerpt">{excerpt}</p>}
    </article>
  );
}
