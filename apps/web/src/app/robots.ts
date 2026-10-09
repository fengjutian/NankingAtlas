import { siteOrigin } from '@/lib/seo';

import type { MetadataRoute } from 'next';

/**
 * robots.txt（P2-06）。
 *
 * - 公开内容允许抓取；签名 revalidation 端点与后台路径一律禁止。
 * - 站点域名未配置时不写 sitemap 绝对地址，避免指向错误主机。
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/admin/'],
      },
    ],
    ...(origin === null ? {} : { sitemap: `${origin}/sitemap.xml` }),
  };
}
