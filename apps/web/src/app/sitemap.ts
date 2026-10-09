import type { MetadataRoute } from 'next';

import { listPublishedContents } from '@/lib/api';
import { canonicalUrl, siteOrigin } from '@/lib/seo';
import { detailHref, type PublicContent } from '@/lib/types';

export const revalidate = 300;

/** 只收录静态入口页；内容页 URL 由已发布内容生成。 */
const STATIC_PATHS: readonly string[] = ['/', '/chronicle', '/living', '/search', '/sources'];

function toEntry(url: string, lastModified?: string): MetadataRoute.Sitemap[number] {
  return lastModified === undefined ? { url } : { url, lastModified };
}

/**
 * Sitemap（P2-06 / 技术方案 §9.3）。
 *
 * 只包含已发布内容：数据来源是公开列表接口（只返回 PUBLISHED 且未归档的条目）。
 * 接口不可用时退化为仅静态页，绝不因为取不到数据就输出过期或猜测的 URL。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const result = await listPublishedContents(
    { limit: 100 },
    { revalidate: 300, tags: ['contents'] },
  );
  const contents: PublicContent[] = result.ok ? result.data : [];

  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => toEntry(canonicalUrl(path)));
  for (const content of contents) {
    entries.push(toEntry(canonicalUrl(detailHref(content)), content.publishedAt ?? undefined));
  }

  const origin = siteOrigin();
  if (origin !== null) entries.unshift(toEntry(`${origin}/sitemap.xml`));
  return entries;
}
