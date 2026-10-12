import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import type { UserManagementPage as UserManagementPageType } from './UserManagementPage';
import type { SessionUser } from '@/features/shared/session';

/**
 * 用户管理页的渲染状态测试（FD-005）。
 *
 * SSR 只跑首次渲染（useEffect 不执行），所以覆盖的是：
 * 权限分支、可访问性结构、以及"数据到达前不假装有内容"。
 * 真实交互路径（创建 / 启禁 / 改角色）由集成测试在 API 层覆盖。
 *
 * `@/lib/env` 在模块加载期就校验 `VITE_APP_ENV`（与 `api/client.test.ts`
 * 同一个问题），所以先写好 env 再**动态** import 组件。
 */

interface MetaLike {
  env: Record<string, string | undefined>;
}

let UserManagementPage: typeof UserManagementPageType;

const adminUser: SessionUser = {
  id: 'admin-1',
  email: 'admin@example.test',
  displayName: '管理员',
  roles: ['ADMIN'],
};

const editorUser: SessionUser = {
  id: 'editor-1',
  email: 'editor@example.test',
  displayName: '编辑',
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
  const module = await import('./UserManagementPage');
  UserManagementPage = module.UserManagementPage;
});

function render(user: SessionUser = adminUser): string {
  return renderToStaticMarkup(<UserManagementPage user={user} onUnauthorized={() => undefined} />);
}

describe('权限分支（服务端才是权威）', () => {
  it('非管理员看到明确的权限说明，且不请求数据', () => {
    const html = render(editorUser);
    expect(html).toContain('无权访问用户管理');
    expect(html).toContain('仅限管理员');
    expect(html).toContain('role="alert"');
    // 不该渲染检索表单与新建表单
    expect(html).not.toContain('新建用户');
    expect(html).not.toContain('检索用户');
  });

  it('管理员看到检索与新建入口', () => {
    const html = render();
    expect(html).toContain('用户与角色');
    expect(html).toContain('检索用户');
    expect(html).toContain('新建用户');
    expect(html).not.toContain('无权访问');
  });
});

describe('密码安全（UI 层）', () => {
  it('所有密码输入都是 password 类型且禁止浏览器自动回填', () => {
    const html = render();
    // React 服务端渲染保留 autoComplete 的驼峰原样输出（实测确认）
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete=');
    expect(html).toContain('new-password');
    expect(html).not.toContain('type="text"');
  });

  it('页面明确说明密码不会回显或写入审计', () => {
    const html = render();
    expect(html).toContain('不会回显');
    expect(html).toContain('不会写入审计日志');
  });
});

describe('可访问性结构', () => {
  it('页面有一级标题', () => {
    expect(render()).toContain('<h1');
  });

  it('筛选控件有关联的 label', () => {
    const html = render();
    expect(html).toContain('for="user-role-filter"');
    expect(html).toContain('id="user-role-filter"');
    expect(html).toContain('for="user-status-filter"');
    expect(html).toContain('id="user-status-filter"');
  });

  it('检索输入有关联 label 与描述', () => {
    const html = render();
    expect(html).toContain('同时匹配邮箱与显示名');
    expect(html).toContain('aria-describedby');
  });

  it('新建用户区块有可访问名称', () => {
    const html = render();
    expect(html).toContain('aria-labelledby="create-user-title"');
    expect(html).toContain('id="create-user-title"');
  });
});

describe('数据到达前的状态', () => {
  it('停在 loading 且不渲染空表', () => {
    const html = render();
    expect(html).toContain('正在加载用户列表');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('没有匹配的用户');
  });
});

describe('初始状态不伪造数据', () => {
  it('未加载完成时不显示任何用户行', () => {
    const html = render();
    expect(html).not.toContain('<th scope="row">');
    expect(html).not.toContain('admin@example.test');
  });

  it('不展示任何密码或哈希字样', () => {
    const html = render();
    expect(html).not.toContain('passwordHash');
    expect(html.toLowerCase()).not.toContain('hash');
  });
});
