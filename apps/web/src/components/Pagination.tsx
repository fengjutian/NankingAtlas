import Link from 'next/link';

import { setPage, withListQuery, type ListQuery } from '@/lib/api';

import type { Route } from 'next';

export interface PaginationProps {
  readonly basePath: string;
  readonly query: ListQuery;
  readonly totalPages: number;
}

/** 分页（P2-03）：页码进入 URL，刷新与分享可还原；纯链接实现，键盘可达。 */
export function Pagination({ basePath, query, totalPages }: PaginationProps) {
  if (totalPages <= 1) return null;
  const previousPage = Math.max(1, query.page - 1);
  const nextPage = Math.min(totalPages, query.page + 1);

  return (
    <nav className="pagination" aria-label="分页导航">
      {query.page > 1 ? (
        <Link href={withListQuery(basePath, setPage(query, previousPage)) as Route} className="btn" rel="prev">
          上一页
        </Link>
      ) : (
        <span className="btn btn--disabled" aria-disabled="true">
          上一页
        </span>
      )}
      <p className="pagination__status" aria-live="polite">
        第 {query.page} / {totalPages} 页
      </p>
      {query.page < totalPages ? (
        <Link
          href={withListQuery(basePath, setPage(query, nextPage)) as Route}
          className="btn"
          rel="next"
        >
          下一页
        </Link>
      ) : (
        <span className="btn btn--disabled" aria-disabled="true">
          下一页
        </span>
      )}
    </nav>
  );
}
