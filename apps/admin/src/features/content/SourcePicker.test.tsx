import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { SourceSearchPage } from '@nanking-atlas/api-contract';

import { SourcePicker } from './SourcePicker';

/**
 * 来源选择器的渲染状态测试（FD-002）。
 *
 * 用 `react-dom/server` 而非 testing-library：仓库没有 RTL
 * （AGENTS.md §6.5「能用现有依赖解决时不新增依赖」）。
 *
 * 注意：SSR 渲染只跑首次渲染，**不执行 useEffect**，
 * 所以这里构造的 `onSearch` 不会被调用 —— 表格要出现在 ready 状态里
 * 才能断言。要覆盖"请求发出后的分支"，靠下面的 onSearch 调用断言。
 */

function page(items: SourceSearchPage['items'], hasMore = false): SourceSearchPage {
  return { items, nextCursor: hasMore ? 'next' : null, hasMore };
}

function render(overrides: Partial<React.ComponentProps<typeof SourcePicker>> = {}): string {
  // SSR 不执行 effect，这个实现实际不会被调用；但签名必须是 Promise
  // （组件按异步检索处理返回值）。
  const noopSearch = (): Promise<SourceSearchPage> => Promise.resolve(page([]));
  return renderToStaticMarkup(
    <SourcePicker
      onSearch={noopSearch}
      selectedSourceId=""
      onSelect={() => undefined}
      {...overrides}
    />,
  );
}

describe('初始渲染', () => {
  it('渲染检索输入框、排序选择与检索按钮', () => {
    const html = render();
    expect(html).toContain('检索来源');
    expect(html).toContain('type="search"');
    expect(html).toContain('最新优先');
    expect(html).toContain('标题升序');
    expect(html).toContain('>检索<');
  });

  it('标注中文排序不是拼音序（避免用户误解）', () => {
    expect(render()).toContain('中文按码点序排序，不是拼音序');
  });

  it('初始为 loading 状态（SSR 不跑 effect，此时仍是首次渲染）', () => {
    const html = render();
    expect(html).toContain('正在检索来源');
    expect(html).toContain('aria-busy="true"');
  });
});

describe('选择状态', () => {
  it('数据到达前不渲染选择表格，也不假装有来源可选', () => {
    // SSR 只跑首次渲染（effect 不执行），此时应停在 loading：
    // 不能先渲染一张空表再闪出数据，也不能在无数据时显示"尚未选择来源"。
    const html = render({ selectedSourceId: 'src-1' });
    expect(html).toContain('正在检索来源');
    expect(html).not.toContain('尚未选择来源');
    expect(html).not.toContain('来源检索结果');
  });

  it('未选中任何来源时不显示已选 ID', () => {
    const html = render();
    expect(html).not.toContain('已选择来源');
  });
});

describe('可访问性', () => {
  it('检索输入有可见 label 与 placeholder', () => {
    const html = render();
    expect(html).toContain('<label');
    expect(html).toContain('按标题、作者或出版方匹配');
    expect(html).toContain('aria-describedby');
  });

  it('排序下拉有关联的 label', () => {
    const html = render();
    expect(html).toContain('for="source-sort"');
    expect(html).toContain('id="source-sort"');
  });
});
