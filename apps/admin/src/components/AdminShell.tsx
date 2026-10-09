'use client';

import { useState } from 'react';

import type { ReactNode } from 'react';

import { env } from '@/lib/env';

interface NavItem {
  label: string;
  href: string;
  disabled?: boolean;
}

const NAV_SECTIONS: readonly { title: string; items: readonly NavItem[] }[] = [
  {
    title: '内容',
    items: [
      { label: '全部内容', href: '#contents' },
      { label: '新建草稿', href: '#contents/new', disabled: true },
    ],
  },
  {
    title: '资产',
    items: [
      { label: '媒体库', href: '#media', disabled: true },
      { label: '来源与版权', href: '#sources', disabled: true },
    ],
  },
  {
    title: '审核',
    items: [
      { label: '审核队列', href: '#review', disabled: true },
      { label: '审计日志', href: '#audit', disabled: true },
    ],
  },
  {
    title: '设置',
    items: [
      { label: '首页槽位', href: '#slots', disabled: true },
      { label: '用户与角色', href: '#users', disabled: true },
    ],
  },
];

/**
 * 管理后台外壳：左侧导航 + 顶部条 + 主区。
 * 移动端汉堡折叠侧边栏。
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="admin-shell">
      <header className="admin-shell__topbar" role="banner">
        <button
          type="button"
          className="admin-shell__toggle"
          aria-controls="admin-shell-sidebar"
          aria-expanded={open}
          aria-label={open ? '关闭侧边栏' : '打开侧边栏'}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span aria-hidden="true">{open ? '✕' : '☰'}</span>
        </button>
        <span className="admin-shell__brand">金陵风物志 · 管理后台</span>
        <span className="admin-shell__env" aria-label={`当前环境 ${env.APP_ENV}`}>
          env: <code>{env.APP_ENV}</code>
        </span>
      </header>

      <div className="admin-shell__body">
        <nav
          id="admin-shell-sidebar"
          className={`admin-shell__sidebar ${open ? 'is-open' : ''}`.trim()}
          aria-label="管理后台导航"
        >
          {NAV_SECTIONS.map((section) => (
            <section key={section.title} aria-labelledby={`admin-nav-${section.title}`}>
              <h2 id={`admin-nav-${section.title}`}>{section.title}</h2>
              <ul>
                {section.items.map((item) => (
                  <li key={item.href}>
                    {item.disabled ? (
                      <span className="admin-shell__link is-disabled" aria-disabled="true">
                        {item.label}
                        <span className="admin-shell__badge">待 P1</span>
                      </span>
                    ) : (
                      <a className="admin-shell__link" href={item.href}>
                        {item.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <main id="main" className="admin-shell__main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
