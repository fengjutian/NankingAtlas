import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import type { SessionUser } from '@/features/shared/session';
import type { RouteStopEditor as RouteStopEditorType } from './RouteStopEditor';

/**
 * 路线编排页的渲染状态测试（FD-009）。
 *
 * SSR 只跑首次渲染（useEffect 不执行），所以覆盖的是：数据到达前
 * 不伪造站点、以及加载态的无障碍属性。
 *
 * **只能**用 `import type` + 动态 import：`@/lib/env` 在**模块加载期**
 * 就校验 `VITE_APP_ENV`，静态值导入会在 beforeAll 设 env 之前就抛错
 * （与 api/client.test.ts 同款问题）。
 */

interface MetaLike {
  env: Record<string, string | undefined>;
}

let RouteStopEditor: typeof RouteStopEditorType;

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
  const module = await import('./RouteStopEditor');
  RouteStopEditor = module.RouteStopEditor;
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
});
