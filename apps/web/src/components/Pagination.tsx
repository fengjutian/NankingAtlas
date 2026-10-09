import Link from 'next/link';

import { setPage, withListQuery, type ListQuery } from '@/lib/api';

export interface PaginationProps {
  readonly basePath: string;
  readonly query: ListQuery;
  readonly totalPages: number;
  /**
   * **夹取后**的当前页码（来自 `paginate()` 的返回值）。
   *
   * 必须显式传入，不能在组件里用 `query.page`：URL 里的 `?page=999`
   * 会被 `paginate` 夹到末页，而 `query.page` 仍是 999 ——
   * 于是内容显示末页、分页条却写「第 999 页」，「上一页」也点不到有效页。
   * 缺省回落到 `query.page` 只为兼容旧调用点，但会退化成原来的错误行为。
   */
  readonly currentPage?: number;
}

/** 分页（P2-03）：页码进入 URL，刷新与分享可还原；纯链接实现，键盘可达。 */
export function Pagination({ basePath, query, totalPages, currentPage }: PaginationProps) {
  if (totalPages <= 1) return null;
  // 夹一次，防御调用方忘记传 currentPage 的情况
  const page = Math.min(Math.max(currentPage ?? query.page, 1), totalPages);
  const previousPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  return (
    <nav className="pagination" aria-label="分页导航">
      {page > 1 ? (
        <Link
          href={withListQuery(basePath, setPage(query, previousPage))}
          className="btn"
          rel="prev"
        >
          上一页
        </Link>
      ) : (
        <span className="btn btn--disabled" aria-disabled="true">
          上一页
        </span>
      )}
      <p className="pagination__status" aria-live="polite">
        第 {page} / {totalPages} 页
      </p>
      {page < totalPages ? (
        <Link href={withListQuery(basePath, setPage(query, nextPage))} className="btn" rel="next">
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
