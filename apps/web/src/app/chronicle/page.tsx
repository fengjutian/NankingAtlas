import { ContentCard } from '@/components/ContentCard';
import { EmptyState } from '@/components/EmptyState';
import { ListToolbar } from '@/components/ListToolbar';
import { Pagination } from '@/components/Pagination';
import { MAX_PAGE_SIZE, describeFailure, listPublishedContents, paginate, parseListQuery } from '@/lib/api';
import { buildPageMetadata, truncateDescription } from '@/lib/seo';
import { CHRONICLE_TYPES, matchesKeyword } from '@/lib/types';

import type { Metadata } from 'next';

const BASE_PATH = '/chronicle';
const DESCRIPTION =
  '以人物、事件、建筑、民俗与专题为线索的南京城市文化志长文档案；每篇均标注来源与核验状态。';

export const metadata: Metadata = buildPageMetadata({
  title: '南京城市文化志',
  description: DESCRIPTION,
  path: BASE_PATH,
});

export default async function ChronicleListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = parseListQuery(params, CHRONICLE_TYPES);

  // 公开列表接口目前没有游标分页：一次取回最近 100 条，再在真实数据上做筛选与切片。
  const result = await listPublishedContents(
    { limit: MAX_PAGE_SIZE },
    { revalidate: 300, tags: ['contents'] },
  );

  const scoped = result.ok
    ? result.data.filter(
        (item) =>
          CHRONICLE_TYPES.includes(item.type) &&
          (query.type === null || item.type === query.type) &&
          matchesKeyword([item.title, item.subtitle, item.summary], query.q),
      )
    : [];
  const { pageItems, totalItems, totalPages, capped } = paginate(scoped, query);

  return (
    <div className="shell">
      <header className="page-header">
        <h1 className="page-header__title">南京城市文化志</h1>
        <p className="page-header__lede">{truncateDescription(DESCRIPTION, 90)}</p>
      </header>

      <ListToolbar basePath={BASE_PATH} query={query} allowedTypes={CHRONICLE_TYPES} />

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
              ? '本站坚持"来源与版权核验通过才发布"。符合条件的条目上线后会出现在这里，你可以通过关键词与类型筛选缩小范围。'
              : '内容接口当前不可用，页面无法读取已发布条目。请稍后重试。'
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

      <Pagination basePath={BASE_PATH} query={query} totalPages={totalPages} />
    </div>
  );
}
