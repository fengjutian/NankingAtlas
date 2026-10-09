import type { TypeFact } from '@/lib/types';

/** 类型专属字段区（P2-05）：坐标未核验时只说明精度，不展示精确经纬度。 */
export function TypeFacts({
  facts,
  headingId,
  title,
}: {
  readonly facts: readonly TypeFact[];
  readonly headingId: string;
  readonly title: string;
}) {
  return (
    <section className="type-facts" aria-labelledby={headingId}>
      <h2 id={headingId} className="type-facts__title">
        {title}
      </h2>
      <dl className="type-facts__list">
        {facts.map((fact) => (
          <div key={fact.label} className="type-facts__row">
            <dt className="type-facts__label">{fact.label}</dt>
            <dd className="type-facts__value">
              {fact.value}
              {fact.note !== undefined ? (
                <span className="type-facts__note">（{fact.note}）</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
