import Link from 'next/link';

import type { Route } from 'next';

export interface EmptyStateAction {
  readonly href: string;
  readonly label: string;
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly actions?: readonly EmptyStateAction[];
  readonly tone?: 'neutral' | 'warning';
  readonly headingId?: string;
}

/**
 * 空状态（AGENTS.md §6.4）。
 *
 * 列表为空时必须说明"为什么空 + 下一步做什么"，不能留白；
 * `role="status"` 让筛选后的结果变化能被读屏播报。
 */
export function EmptyState({
  title,
  description,
  actions = [],
  tone = 'neutral',
  headingId = 'empty-state-title',
}: EmptyStateProps) {
  return (
    <section
      className={`empty-state ${tone === 'warning' ? 'empty-state--warning' : ''}`.trim()}
      aria-labelledby={headingId}
      role="status"
    >
      <h2 id={headingId} className="empty-state__title">
        {title}
      </h2>
      <p className="empty-state__desc">{description}</p>
      {actions.length > 0 ? (
        <ul className="empty-state__actions" role="list">
          {actions.map((action) => (
            <li key={action.href}>
              <Link href={action.href as Route} className="btn">
                {action.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
