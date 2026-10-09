import Link from 'next/link';

import { PAGE_SIZE_OPTIONS, toggleType, withListQuery, type ListQuery } from '@/lib/api';
import { contentTypeLabel, type ContentType } from '@/lib/types';

import type { Route } from 'next';

export interface ListToolbarProps {
  readonly basePath: string;
  readonly query: ListQuery;
  readonly allowedTypes: readonly ContentType[];
}

/**
 * 列表筛选栏（P2-03）。
 *
 * 全部筛选状态都写进 URL：关键词与每页条数用 GET 表单（无 JS 也能用），
 * 类型用链接（可直接分享）。刷新或复制地址栏都能还原当前视图。
 */
export function ListToolbar({ basePath, query, allowedTypes }: ListToolbarProps) {
  return (
    <section className="toolbar" aria-labelledby="toolbar-title">
      <h2 id="toolbar-title" className="toolbar__title">
        筛选
      </h2>

      <form className="toolbar__form" role="search" method="get" action={basePath as Route}>
        <div className="toolbar__field">
          <label className="toolbar__label" htmlFor="toolbar-keyword">
            关键词
          </label>
          <input
            id="toolbar-keyword"
            className="toolbar__input"
            type="search"
            name="q"
            maxLength={100}
            defaultValue={query.q}
            placeholder="标题、别名或正文关键词"
          />
        </div>

        <div className="toolbar__field">
          <label className="toolbar__label" htmlFor="toolbar-page-size">
            每页条数
          </label>
          <select
            id="toolbar-page-size"
            className="toolbar__select"
            name="pageSize"
            defaultValue={String(query.pageSize)}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        {query.type === null ? null : <input type="hidden" name="type" value={query.type} />}

        <button type="submit" className="btn btn--primary">
          应用筛选
        </button>
      </form>

      <nav className="toolbar__facets" aria-label="按内容类型筛选">
      <ul role="list">
          <li>
            <Link
              href={withListQuery(basePath, toggleType(query, null)) as Route}
              aria-current={query.type === null ? 'page' : undefined}
              className="chip"
            >
              全部
            </Link>
          </li>
          {allowedTypes.map((type) => (
            <li key={type}>
              <Link
                href={withListQuery(basePath, toggleType(query, type)) as Route}
                aria-current={query.type === type ? 'page' : undefined}
                className="chip"
              >
                {contentTypeLabel(type)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
