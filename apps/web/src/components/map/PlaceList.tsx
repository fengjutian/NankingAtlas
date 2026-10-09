import Link from 'next/link';

import styles from './map.module.css';

import type { MapPlaceItem } from '@/lib/map-data';
import type { Route } from 'next';

import { accuracyLabel, areaOnlyNote, canRenderMarker, verificationLabel } from '@/lib/map-data';

export interface PlaceListProps {
  readonly items: readonly MapPlaceItem[];
  readonly selected: string | null;
  readonly onSelect: (slug: string, viaKeyboard: boolean) => void;
}

/** 定位按钮上的标记，供地图层识别"这次选中来自键盘操作"。 */
export const MAP_SELECT_ATTR = 'data-map-select';

/**
 * 地点列表：地图的**等价纯列表**，也是读屏与键盘用户的主要访问途径（§9.2 / §9.3）。
 *
 * 无障碍要点（AGENTS.md §6.4）：
 * - `<ul role="list">` + `<li>` + `<article>`，语义层级完整；
 * - 标题是真正的 `<Link>`，不塞进按钮里（避免嵌套交互元素）；
 * - 选中态用 `aria-pressed` 表达，不只靠颜色；
 * - 定位按钮 `min-height: 44px`（触控目标）。
 */
export function PlaceList({ items, selected, onSelect }: PlaceListProps) {
  return (
    <ul className={styles.mapList} role="list" aria-label="当前地图范围内的地点">
      {items.map((item) => {
        const isSelected = item.slug === selected;
        const drawable = canRenderMarker(item);
        return (
          <li key={item.slug}>
            <article
              className={styles.mapCard}
              aria-labelledby={`map-card-title-${item.slug}`}
              data-selected={isSelected ? 'true' : 'false'}
            >
              <h3 className={styles.mapCardTitle} id={`map-card-title-${item.slug}`}>
                <Link href={`/places/${encodeURIComponent(item.slug)}` as Route}>{item.title}</Link>
              </h3>
              {item.summary === null || item.summary === '' ? null : (
                <p className={styles.mapCardSummary}>{item.summary}</p>
              )}
              <p className={styles.mapCardMeta}>
                <span>{accuracyLabel(item.accuracy)}</span>
                <span>{verificationLabel(item.verificationStatus)}</span>
                {drawable ? null : <span>地图上不显示精确点</span>}
              </p>
              {drawable ? null : <p className={styles.mapCardNote}>{areaOnlyNote(item)}</p>}
              <button
                type="button"
                className="btn"
                aria-pressed={isSelected ? 'true' : 'false'}
                {...{ [MAP_SELECT_ATTR]: 'true' }}
                onClick={(event) => onSelect(item.slug, event.detail === 0)}
              >
                {isSelected ? '已在地图上定位' : '在地图上定位'}
              </button>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
