import type { Metadata } from 'next';

import { ContentCard } from '@/components/ContentCard';
import { EmptyState } from '@/components/EmptyState';
import { ListToolbar } from '@/components/ListToolbar';
import { Pagination } from '@/components/Pagination';
import {
  MAX_PAGE_SIZE,
  describeFailure,
  listPublishedContents,
  paginate,
  parseListQuery,
} from '@/lib/api';
import { buildPageMetadata, truncateDescription } from '@/lib/seo';
import { LIVING_TYPES, matchesKeyword } from '@/lib/types';

const BASE_PATH = '/living';
const DESCRIPTION =
  '金陵生活录：当代人对街巷、饮食、民俗与日常的记录。内容区分史料记载、学界观点、民间传说与编辑推断。';

export const metadata: Metadata = buildPageMetadata({
  title: '金陵生活录',
  description: DESCRIPTION,
  path: BASE_PATH,
});

export default async function LivingListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = parseListQuery(params, LIVING_TYPES);

  const result = await listPublishedContents(
    { limit: MAX_PAGE_SIZE },
    { revalidate: 300, tags: ['contents'] },
  );

  const scoped = result.ok
    ? result.data.filter(
        (item) =>
          LIVING_TYPES.includes(item.type) &&
          (query.type === null || item.type === query.type) &&
          matchesKeyword([item.title, item.subtitle, item.summary], query.q),
      )
    : [];
  const { pageItems, totalItems, totalPages, capped, page } = paginate(scoped, query);

  return (
    <div className="shell">
      <header className="page-header">
        <h1 className="page-header__title">金陵生活录</h1>
        <p className="page-header__lede">{truncateDescription(DESCRIPTION, 90)}</p>
      </header>

      <ListToolbar basePath={BASE_PATH} query={query} allowedTypes={LIVING_TYPES} />

      {result.ok ? (
        <p className="muted list-summary" aria-live="polite">
          共 {totalItems} 条已发布内容
          {capped ? '（公开接口单次最多返回最近 100 条）' : ''}。
        </p>
      ) : (
        <p className="banner" role="alert">
          内容接口暂不可用：{describeFailure(result)}
        </p>
      )}

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
          title="当前没有已发布内容"
          description={
            result.ok
              ? '生活录正在建稿与核验中。上线后的条目会出现在这里，可用关键词与类型筛选浏览。'
              : '内容接口当前不可用，无法读取已发布条目。请稍后重试。'
          }
          actions={
            result.ok
              ? [
                  { href: BASE_PATH, label: '清除筛选条件' },
                  { href: '/search', label: '前往全站检索' },
                ]
              : [{ href: '/', label: '返回首页' }]
          }
          tone={result.ok ? 'neutral' : 'warning'}
        />
      )}

      <Pagination basePath={BASE_PATH} query={query} totalPages={totalPages} currentPage={page} />
    </div>
  );
}
