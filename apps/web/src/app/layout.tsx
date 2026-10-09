import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { env } from '@/lib/env';
import { DEFAULT_DESCRIPTION, resolveIndexingPolicy, siteOrigin } from '@/lib/seo';

import './globals.css';

/**
 * 站点根 metadata（P2-06）。
 *
 * - `metadataBase` 只在配置了 `NEXT_PUBLIC_SITE_URL` 时设置：未配置时 Next 会退回
 *   localhost 作为基准，导致 canonical 指向错误主机。正式域名仍属 PRD §19 未决事项，
 *   因此未配置时改为不输出 metadataBase 并关闭索引。
 * - 导航项由 `SiteHeader` / `SiteFooter` 提供（均为客户端组件，本文件不做改动）。
 */
const configuredOrigin = siteOrigin();

export const metadata: Metadata = {
  ...(configuredOrigin === null ? {} : { metadataBase: new URL(configuredOrigin) }),
  title: {
    default: '金陵风物志',
    template: '%s · 金陵风物志',
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: 'Nanking Atlas',
  authors: [{ name: 'Nanking Atlas Contributors' }],
  robots: resolveIndexingPolicy(configuredOrigin !== null),
};

export const viewport: Viewport = {
  lang: 'zh-CN',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // env 在模块导入时已经完成校验；这里只消费一次避免重复读取。
  void env.APP_ENV;

  return (
    <html lang="zh-CN">
      <body>
        <a href="#main" className="skip-link">
          跳到主要内容
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
