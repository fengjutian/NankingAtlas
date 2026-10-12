'use client';

import { useState } from 'react';

import type { ReactNode } from 'react';

import { navigate } from '@/features/shared/router';
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
      { label: '全部内容', href: '/contents' },
      { label: '新建草稿', href: '/contents/new', disabled: true },
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
      // FD-006：审计日志查询（只读）
      { label: '审计日志', href: '/audit' },
    ],
  },
  {
    title: '设置',
    items: [
      { label: '首页槽位', href: '#slots', disabled: true },
      // FD-005：真实路由，服务端仍会独立校验 ADMIN。
      { label: '用户与角色', href: '/users' },
    ],
  },
];

/**
 * 拦截站内导航的默认行为。
 *
 * 用普通 `<a href>` 而不是 `<button onClick={navigate}>`：前者保留
 * 中键/右键"在新标签打开"和读屏的"链接"语义，后者会全部丢掉。
 * 但必须阻止默认跳转走 pushState —— 否则整页刷新会丢掉编辑页未保存的草稿。
 */
function clientNav(href: string): (event: React.MouseEvent<HTMLAnchorElement>) => void {
  return (event) => {
    // 让浏览器处理新标签页 / 新窗口等修饰键组合
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    navigate(href);
  };
}

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
                    ) : item.href.startsWith('#') ? (
                      <span className="admin-shell__link is-disabled" aria-disabled="true">
                        {item.label}
                        <span className="admin-shell__badge">待 P1</span>
                      </span>
                    ) : (
                      // 真实路由走 pushState，避免整页刷新把未保存的草稿丢掉
                      <a
                        className="admin-shell__link"
                        href={item.href}
                        onClick={clientNav(item.href)}
                      >
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
