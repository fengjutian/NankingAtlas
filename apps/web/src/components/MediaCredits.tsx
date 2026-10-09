import { RIGHTS_LABELS, countHiddenMedia, selectPublicMedia, type PublicMedia } from '@/lib/types';

export interface MediaCreditsProps {
  readonly media: readonly PublicMedia[];
}

/**
 * 媒体与版权（P2-04）。
 *
 * 展示规则（技术方案 §5.3 / AGENTS.md §3.6）：
 * - `rightsStatus` 为 `UNKNOWN` / `RESTRICTED` 的媒体一律不渲染；
 * - 公开图片必须带 `alt` 与 `creditLine`，缺一即过滤并在下方说明被隐藏的数量。
 * 这样即使接口返回了未完成版权核验的素材，公开页也不会泄漏。
 */
export function MediaCredits({ media }: MediaCreditsProps) {
  const visible = selectPublicMedia(media);
  const hidden = countHiddenMedia(media);

  if (media.length === 0) {
    return <p className="muted">本页暂无可公开展示的媒体资源。</p>;
  }

  return (
    <>
      {visible.length === 0 ? (
        <p className="banner" role="note">
          本页有 {media.length} 项媒体资源因版权状态未确认或缺少署名/替代文本而未予展示。
        </p>
      ) : (
        <ul className="media-list" role="list">
          {visible.map((item) => (
            <li key={item.url} className="media-list__item">
              <figure className="media-list__figure">
                <img
                  src={item.url}
                  alt={item.altText ?? ''}
                  loading="lazy"
                  decoding="async"
                  className="media-list__image"
                />
                <figcaption className="media-list__caption">
                  {item.caption !== null && item.caption !== undefined && item.caption !== ''
                    ? item.caption
                    : null}
                  <span className="media-list__credit">图片：{item.creditLine}</span>
                  <span className="media-list__rights">{RIGHTS_LABELS[item.rightsStatus]}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 ? (
        <p className="muted">另有 {hidden} 项媒体因版权或署名信息不完整未展示。</p>
      ) : null}
    </>
  );
}
