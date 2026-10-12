import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import type { AuditLogPage as AuditLogPageType } from './AuditLogPage';
import type { SessionUser } from '@/features/shared/session';

/**
 * 审计日志页的渲染状态测试（FD-006）。
 *
 * SSR 只跑首次渲染（useEffect 不执行），覆盖：权限分支、筛选表单可访问性、
 * 只读语义、以及"数据到达前不伪造记录"。
 *
 * `@/lib/env` 在模块加载期校验 `VITE_APP_ENV`（与 `api/client.test.ts` 同款问题），
 * 所以先写 env 再**动态** import。
 */

interface MetaLike {
  env: Record<string, string | undefined>;
}

let AuditLogPage: typeof AuditLogPageType;

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
  const module = await import('./AuditLogPage');
  AuditLogPage = module.AuditLogPage;
});

function render(user: SessionUser = adminUser): string {
  return renderToStaticMarkup(<AuditLogPage user={user} onUnauthorized={() => undefined} />);
}

describe('权限分支', () => {
  it('非管理员看到权限说明且不渲染筛选表单', () => {
    const html = render(editorUser);
    expect(html).toContain('无权访问审计日志');
    expect(html).toContain('仅限管理员');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-labelledby="audit-filter-title"');
  });

  it('管理员看到筛选表单', () => {
    const html = render();
    expect(html).toContain('审计日志');
    expect(html).toContain('aria-labelledby="audit-filter-title"');
  });
});

describe('只读语义', () => {
  it('页面明确声明不可修改或删除', () => {
    const html = render();
    expect(html).toContain('只读追溯记录，不可修改或删除');
  });

  it('没有任何编辑或删除控件', () => {
    const html = render();
    expect(html).not.toContain('删除这条');
    expect(html).not.toContain('编辑这条');
  });
});

describe('脱敏说明（不是 UI 隐藏）', () => {
  it('明确告诉阅读者脱敏发生在写入时', () => {
    const html = render();
    expect(html).toContain('写入时');
    expect(html).toContain('[REDACTED]');
  });
});

describe('筛选表单可访问性', () => {
  it('六个筛选控件都有可见 label', () => {
    const html = render();
    for (const label of [
      '动作 action',
      '实体类型',
      '实体 ID',
      '操作人 ID',
      '起始时间',
      '结束时间',
    ]) {
      expect(html, `缺少筛选项：${label}`).toContain(label);
    }
  });

  it('提供检索与清空入口', () => {
    const html = render();
    expect(html).toContain('>检索<');
    expect(html).toContain('清空条件');
  });
});

describe('数据到达前的状态', () => {
  it('停在 loading 且不渲染任何记录', () => {
    const html = render();
    expect(html).toContain('正在加载审计日志');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('没有匹配的审计记录');
    expect(html).not.toContain('<th scope="col">动作</th>');
  });
});
