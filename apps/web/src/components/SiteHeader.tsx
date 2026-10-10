'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { Route } from 'next';

interface NavItem {
  label: string;
  href: Route;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: '首页', href: '/' },
  { label: '文化志', href: '/chronicle' },
  { label: '生活录', href: '/living' },
  { label: '地图', href: '/map' },
  { label: '关于', href: '/about' },
];

/**
 * 公开站顶部导航。
 *
 * 设计要点（AGENTS.md §6.4）：
 * - 语义 HTML：<header> + <nav>
 * - 移动端汉堡按钮：aria-expanded / aria-controls 标记
 * - 键盘：tab 顺序自然；ESC 关闭菜单
 * - 焦点：所有交互元素有 :focus-visible 描边
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header" role="banner">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand" aria-label="金陵风物志 · 返回首页">
          <span className="site-header__brand-text">金陵风物志</span>
        </Link>

        <button
          type="button"
          className="site-header__toggle"
          aria-controls="site-header-nav"
          aria-expanded={open}
          aria-label={open ? '关闭导航菜单' : '打开导航菜单'}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span aria-hidden="true">{open ? '✕' : '☰'}</span>
        </button>

        <nav
          id="site-header-nav"
          className={`site-header__nav ${open ? 'is-open' : ''}`.trim()}
          aria-label="主导航"
        >
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
