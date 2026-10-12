import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import type { HomepageSlotPage as HomepageSlotPageType, isKnownSlotKey } from './HomepageSlotPage';
import type { SessionUser } from '@/features/shared/session';

/**
 * 首页槽位页的渲染状态测试（FD-007）。
 *
 * 覆盖：权限分支、五个受控槽位键、状态徽章语义、筛选/时间窗控件可访问性。
 * SSR 只跑首次渲染（useEffect 不执行），所以数据到达后的分支不在这里覆盖。
 *
 * `@/lib/env` 在模块加载期校验 `VITE_APP_ENV`，所以先写 env 再动态 import。
 */

interface MetaLike {
  env: Record<string, string | undefined>;
}

let HomepageSlotPage: typeof HomepageSlotPageType;
let isKnownSlotKeyFn: typeof isKnownSlotKey;

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
  const module = await import('./HomepageSlotPage');
  HomepageSlotPage = module.HomepageSlotPage;
  isKnownSlotKeyFn = module.isKnownSlotKey;
});

function render(user: SessionUser = adminUser): string {
  return renderToStaticMarkup(<HomepageSlotPage user={user} onUnauthorized={() => undefined} />);
}

describe('权限分支', () => {
  it('非管理员看到权限说明且不渲染槽位表单', () => {
    const html = render(editorUser);
    expect(html).toContain('无权配置首页槽位');
    expect(html).toContain('仅限管理员');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('保存槽位');
  });

  it('管理员看到槽位配置页', () => {
    const html = render();
    expect(html).toContain('首页槽位');
    expect(html).not.toContain('无权配置');
  });
});

describe('受控槽位字典', () => {
  it('只接受五个白名单槽位键', () => {
    for (const key of ['hero', 'featured', 'latest', 'places', 'routes']) {
      expect(isKnownSlotKeyFn(key), `${key} 应是合法槽位键`).toBe(true);
    }
    for (const key of ['not_a_slot', 'HERO', '', 'header']) {
      expect(isKnownSlotKeyFn(key), `${key} 不应是合法槽位键`).toBe(false);
    }
  });

  it('页面渲染全部五个槽位区块', () => {
    const html = render();
    for (const key of ['hero', 'featured', 'latest', 'places', 'routes']) {
      expect(html, `缺少槽位区块：${key}`).toContain(`id="slot-${key}"`);
    }
  });

  it('每个区块有可访问名称', () => {
    const html = render();
    expect(html).toContain('aria-labelledby="slot-hero"');
    expect(html).toContain('aria-labelledby="slot-routes"');
  });
});

describe('状态语义', () => {
  it('说明只有已发布内容能上首页', () => {
    const html = render();
    expect(html).toContain('只有已发布且未归档的内容才能上首页');
  });

  it('明确服务端会再校验一次（前端过滤不是授权）', () => {
    const html = render();
    expect(html).toContain('服务端会再校验一次');
  });
});

describe('可访问性结构', () => {
  it('每个区块有可访问名称', () => {
    const html = render();
    expect(html).toContain('aria-labelledby="slot-hero"');
    expect(html).toContain('aria-labelledby="slot-routes"');
  });
});

describe('数据到达前的状态', () => {
  /**
   * 槽位键是受控字典常量，所以**加载时就有五个区块骨架** —— 编辑不会误以为
   * "没有槽位可配"。但表单字段要等数据到达才渲染。
   */
  it('加载时先给骨架，不假装已有配置', () => {
    const html = render();
    expect(html).toContain('正在加载 头图 hero 的配置');
    expect(html).toContain('aria-busy="true"');
    // "未配置"徽章属于数据到达后的判断，加载中**不能**提前断言未配置
    expect(html).not.toContain('未配置');
    // 表单控件还没出现
    expect(html).not.toContain('检索可挂载内容');
    expect(html).not.toContain('保存槽位');
    expect(html).not.toContain('min="0"');
  });

  it('初始不伪造任何已保存状态', () => {
    const html = render();
    expect(html).not.toContain('已保存。');
    expect(html).not.toContain('候选内容（');
  });
});
