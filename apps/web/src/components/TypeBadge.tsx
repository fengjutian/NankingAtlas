import { contentTypeLabel, type ContentType } from '@/lib/types';

/** 类型徽标：列表项与详情页共用，颜色不承载语义（对比度与色盲友好）。 */
export function TypeBadge({ type }: { readonly type: ContentType }) {
  return <span className="badge">{contentTypeLabel(type)}</span>;
}
