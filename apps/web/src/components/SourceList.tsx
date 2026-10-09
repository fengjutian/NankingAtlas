import { SOURCE_KIND_LABELS, isSourceKind, type PublicSource } from '@/lib/types';

export interface SourceListProps {
  /** 公开接口是否返回了来源清单；false 时显示降级说明而不是空白。 */
  readonly available: boolean;
  readonly sources: readonly PublicSource[];
}

function sourceKindLabel(kind: string): string {
  return isSourceKind(kind) ? SOURCE_KIND_LABELS[kind] : '其他';
}

/** 参考来源（P2-04）：kind / title / author / citation。 */
export function SourceList({ available, sources }: SourceListProps) {
  if (!available) {
    return (
      <p className="muted">
        来源清单尚未通过公开接口开放。本站坚持"没有来源不发布"，因此此处的缺失是接口能力限制，
        而不是"该条目没有来源"。
      </p>
    );
  }
  if (sources.length === 0) {
    return <p className="muted">本页暂未关联已公开的来源条目。</p>;
  }

  return (
    <ol className="source-list" role="list">
      {sources.map((source) => (
        <li key={source.id} className="source-list__item">
          <p className="source-list__kind">{sourceKindLabel(source.kind)}</p>
          <p className="source-list__title">
            {source.url !== undefined && source.url !== null && source.url !== '' ? (
              <a href={source.url} rel="noopener noreferrer nofollow" target="_blank">
                {source.title}
              </a>
            ) : (
              source.title
            )}
          </p>
          {source.author !== undefined && source.author !== null && source.author !== '' ? (
            <p className="source-list__author">著者：{source.author}</p>
          ) : null}
          {source.citationText !== undefined && source.citationText !== null ? (
            <p className="source-list__citation">{source.citationText}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
