import Link from 'next/link';

import type { MapQuery } from '@/lib/map-url';
import type { ContentType } from '@/lib/types';
import type { Route } from 'next';

import { MAP_QUERY_MAX_LENGTH, withMapQuery } from '@/lib/map-url';
import { contentTypeLabel } from '@/lib/types';

export interface MapToolbarProps {
  readonly basePath: string;
  readonly query: MapQuery;
  readonly allowedTypes: readonly ContentType[];
}

/**
 * `/map` 筛选栏（P3-03）。
 *
 * 与 `ListToolbar` 同一套约定：关键词走 GET 表单（无 JS 也能用），
 * 类型走链接（可直接分享）。筛选状态全部在 URL 里，刷新即还原。
 */
export function MapToolbar({ basePath, query, allowedTypes }: MapToolbarProps) {
  return (
    <section className="toolbar" aria-labelledby="map-toolbar-title">
      <h2 id="map-toolbar-title" className="toolbar__title">
        筛选
      </h2>

      <form className="toolbar__form" role="search" method="get" action={basePath}>
        <div className="toolbar__field">
          <label className="toolbar__label" htmlFor="map-keyword">
            关键词
          </label>
          <input
            id="map-keyword"
            className="toolbar__input"
            type="search"
            name="q"
            maxLength={MAP_QUERY_MAX_LENGTH}
            defaultValue={query.q}
            placeholder="地点名称或简介关键词"
          />
        </div>

        {query.type === null ? null : <input type="hidden" name="type" value={query.type} />}
        {query.bbox === null ? null : <input type="hidden" name="bbox" value={query.bbox} />}

        <button type="submit" className="btn btn--primary">
          应用筛选
        </button>
      </form>

      <nav className="toolbar__facets" aria-label="按内容类型筛选">
        <ul role="list">
          <li>
            <Link
              href={withMapQuery(basePath, { ...query, type: null })}
              aria-current={query.type === null ? 'page' : undefined}
              className="chip"
            >
              全部
            </Link>
          </li>
          {allowedTypes.map((type) => (
            <li key={type}>
              <Link
                href={
                  withMapQuery(basePath, {
                    ...query,
                    type: query.type === type ? null : type,
                  }) as Route
                }
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
