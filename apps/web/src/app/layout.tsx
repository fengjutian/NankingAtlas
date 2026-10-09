import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { env } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '金陵风物志',
    template: '%s · 金陵风物志',
  },
  description:
    'Nanking Atlas · 南京城市文化数字档案、互动街巷地图与城市生活记录平台。当前仅完成 P0 工程骨架，业务内容尚未上线。',
  applicationName: 'Nanking Atlas',
  authors: [{ name: 'Nanking Atlas Contributors' }],
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // env 在模块导入时已经完成校验，这里只是展示如何避免在边缘运行器中再次读取
  void env.NEXT_PUBLIC_APP_ENV;
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}