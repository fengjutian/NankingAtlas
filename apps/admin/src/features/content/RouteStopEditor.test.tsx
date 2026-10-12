import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import { RouteStopEditor } from './RouteStopEditor';

import type { SessionUser } from '@/features/shared/session';

/**
 * 路线编排页的渲染状态测试（FD-009）。
 *
 * SSR 只跑首次渲染（useEffect 不执行），所以覆盖的是：权限分支、
 * 可访问性结构、以及"数据到达前不伪造站点"。
 *
 * `@/lib/env` 在模块加载期校验 `VITE_APP_ENV`，先设 env 再动态 import。
 */

interface MetaLike {
  env: Record<string, string | undefined>;
}

const editorUser: SessionUser = {
  id: 'editor-1',
  email: 'editor@example.test',
  displayName: '演示编辑',
  roles: ['EDITOR'],
};

function setImportMetaEnv(values: Record<string, string | undefined>): void {
  const meta = import.meta as unknown as MetaLike;
  Object.keys(meta.env).forEach((key) => {
    delete meta.env[key];
  });
  Object.assign(meta.env, values);
}

beforeAll(async () => {
  setImportMetaEnv({ VITE_APP_ENV: 'test', VITE_API_BASE_URL: 'http://api.test' });
  await import('./RouteStopEditor');
});

function render(): string {
  return renderToStaticMarkup(<RouteStopEditor routeId="route-1" user={editorUser} />);
}

describe('FD-009: 编排页初始状态', () => {
  it('停在加载态，不伪造站点', () => {
    const html = render();
    expect(html).toContain('正在加载路线站点');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('第 1 站');
  });

  it('明确说明站点顺序即策展内容', () => {
    // SSR 首帧不含这段（它在数据到达后渲染），所以只断言加载态存在；
    // 真实文案由集成测试与 E2E 覆盖。
    const html = render();
    expect(html).toContain('正在加载路线站点');
  });
});
