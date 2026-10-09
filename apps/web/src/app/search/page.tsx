import Link from 'next/link';

import { ContentCard } from '@/components/ContentCard';
import { EmptyState } from '@/components/EmptyState';
import { ListToolbar } from '@/components/ListToolbar';
import { Pagination } from '@/components/Pagination';
import { MAX_PAGE_SIZE, describeFailure, listPublishedContents, paginate, parseListQuery } from '@/lib/api';
import { buildPageMetadata, truncateDescription } from '@/lib/seo';
import { CONTENT_TYPES, matchesKeyword } from '@/lib/types';

import type { Metadata } from 'next';
import type { Route } from 'next';

const BASE_PATH = '/search';
const DESCRIPTION = '在已发布的南京城市文化档案中检索条目：支持关键词与内容类型筛选。';

export const metadata: Metadata = buildPageMetadata({
  title: '全站检索',
  description: DESCRIPTION,
  path: BASE_PATH,
});

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // 检索页允许全部内容类型（不受栏目白名单限制）。
  const query = parseListQuery(params, CONTENT_TYPES);

  const result = await listPublishedContents(
    { limit: MAX_PAGE_SIZE },
    { revalidate: 300, tags: ['contents'] },
  );

  const hasKeyword = query.q !== '';
  const matched = result.ok
    ? result.data.filter(
        (item) =>
          (query.type === null || item.type === query.type) &&
          matchesKeyword([item.title, item.subtitle, item.summary], query.q),
      )
    : [];
  const { pageItems, totalItems, totalPages, capped } = paginate(matched, query);

  return (
    <div className="shell">
      <header className="page-header">
        <h1 className="page-header__title">全站检索</h1>
        <p className="page-header__lede">{truncateDescription(DESCRIPTION, 80)}</p>
      </header>

      <ListToolbar basePath={BASE_PATH} query={query} allowedTypes={CONTENT_TYPES} />

      {!result.ok ? (
        <p className="banner" role="alert">
          内容接口暂不可用：{describeFailure(result)}
        </p>
      ) : null}

      {hasKeyword && result.ok ? (
        <p className="muted list-summary" aria-live="polite">
          关键词「{query.q}」匹配 {totalItems} 条
          {capped ? '（检索范围为最近 100 条已发布内容）' : ''}。
        </p>
      ) : null}

      {pageItems.length > 0 ? (
        <ul className="content-list" role="list">
          {pageItems.map((item) => (
            <li key={item.id}>
              <ContentCard content={item} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={hasKeyword ? '没有匹配的条目' : '输入关键词开始检索'}
          description={
            hasKeyword
              ? '本站不会为凑数返回不相关的内容。可以尝试更短的关键词，或改用内容类型筛选；若确认存在但未被检索到，可能是尚未发布或尚未完成核验。'
              : '检索范围目前是最近 100 条已发布内容的标题、副标题与摘要；正文全文检索将在检索服务接入后开放。'
          }
          actions={
            hasKeyword
              ? [
                  { href: BASE_PATH, label: '清除关键词' },
                  { href: '/chronicle', label: '浏览文化志' },
                ]
              : [
                  { href: '/chronicle', label: '浏览文化志' },
                  { href: '/living', label: '浏览生活录' },
                ]
          }
          tone={result.ok ? 'neutral' : 'warning'}
          headingId="search-empty-title"
        />
      )}

      <Pagination basePath={BASE_PATH} query={query} totalPages={totalPages} />

      <p className="muted home-section__note">
        需要查询其他内容？可前往
        <Link href={'/sources' as Route}>来源说明</Link>
        了解本站的收录与引用规范。
      </p>
    </div>
  );
}
