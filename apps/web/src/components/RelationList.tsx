import Link from 'next/link';

import type { Route } from 'next';

import { DETAIL_PATHS, contentTypeLabel, type ContentRelation } from '@/lib/types';

export interface RelationListProps {
  readonly available: boolean;
  readonly relations: readonly ContentRelation[];
}

function relationHref(relation: ContentRelation): Route | null {
  if (
    relation.targetSlug === null ||
    relation.targetSlug === undefined ||
    relation.targetSlug === ''
  ) {
    return null;
  }
  const base =
    relation.targetType === null || relation.targetType === undefined
      ? DETAIL_PATHS.TOPIC
      : DETAIL_PATHS[relation.targetType];
  return `${base}/${relation.targetSlug}` as Route;
}

/** 关联内容（P2-04）：接口未开放时说明降级原因。 */
export function RelationList({ available, relations }: RelationListProps) {
  if (!available) {
    return <p className="muted">关联内容尚未通过公开接口开放。</p>;
  }
  if (relations.length === 0) {
    return <p className="muted">本页暂未公开关联条目。</p>;
  }

  return (
    <ul className="relation-list" role="list">
      {relations.map((relation, index) => {
        const href = relationHref(relation);
        const label = relation.targetTitle ?? relation.targetSlug ?? '未命名条目';
        return (
          <li key={`${relation.relationType}-${index}`} className="relation-list__item">
            <span className="relation-list__type">{relation.relationType}</span>
            {relation.targetType !== null && relation.targetType !== undefined ? (
              <span className="relation-list__badge">{contentTypeLabel(relation.targetType)}</span>
            ) : null}
            {href === null ? (
              <span className="relation-list__label">{label}</span>
            ) : (
              <Link href={href} className="relation-list__label">
                {label}
              </Link>
            )}
            {relation.directionNote !== null && relation.directionNote !== undefined ? (
              <span className="relation-list__note">（{relation.directionNote}）</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
