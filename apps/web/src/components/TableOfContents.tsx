import type { TocEntry } from '@/lib/seo';

/**
 * 正文目录（P2-04）。
 *
 * 锚点由 `injectHeadingIds` 写入正文 `<h2>/<h3>`，两侧 id 同源，
 * 因此不会出现"目录能点但正文没锚点"的死链。
 */
export function TableOfContents({ entries, headingId }: { readonly entries: readonly TocEntry[]; readonly headingId: string }) {
  if (entries.length === 0) return null;

  return (
    <nav className="toc" aria-labelledby={headingId}>
      <h2 id={headingId} className="toc__title">
        目录
      </h2>
      <ol className="toc__list">
        {entries.map((entry) => (
          <li key={entry.id} className={`toc__item toc__item--level-${entry.level}`}>
            <a href={`#${entry.id}`}>{entry.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
