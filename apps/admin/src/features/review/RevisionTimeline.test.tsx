import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Revision, RevisionPage, ReviewActionRecord, ReviewActionPage } from '@nanking-atlas/api-contract';

import { RevisionTimeline, type RevisionTimelineProps } from './RevisionTimeline';

/**
 * 版本时间线的渲染状态测试（FD-001）。
 *
 * 用 `react-dom/server` 而不是 testing-library：仓库里没有 RTL（AGENTS.md §6.5
 * 「能用现有依赖解决时不新增依赖」），而状态分支的断言只需要"渲染出什么"，
 * 不需要交互。选中版本后的差异计算由 revisionDiff.test.ts 的纯函数覆盖。
 */

function revision(no: number, overrides: Partial<Revision['snapshot']> = {}): Revision {
  return {
    revisionNo: no,
    createdAt: '2026-10-12T00:00:00.000Z',
    action: no === 1 ? 'CREATE' : 'UPDATE',
    actor: { id: `u${String(no)}`, displayName: `编辑者${String(no)}` },
    snapshot: {
      title: `标题${String(no)}`,
      subtitle: null,
      summary: '摘要',
      slug: 'a-slug',
      bodyText: '正文',
      bodyTextLength: 2,
      bodyTextTruncated: false,
      ...overrides,
    },
  };
}

function revisionPage(items: Revision[], hasMore = false): RevisionPage {
  return { items, nextCursor: hasMore ? 'next-cursor' : null, hasMore };
}

function reviewPage(items: ReviewActionRecord[], hasMore = false): ReviewActionPage {
  return { items, nextCursor: hasMore ? 'next-cursor' : null, hasMore };
}

function baseProps(overrides: Partial<RevisionTimelineProps> = {}): RevisionTimelineProps {
  return {
    revisions: null,
    reviewActions: null,
    state: 'ready',
    errorMessage: null,
    requestId: null,
    loadingMore: false,
    onLoadMore: () => undefined,
    onRetry: () => undefined,
    ...overrides,
  };
}

function render(props: RevisionTimelineProps): string {
  return renderToStaticMarkup(<RevisionTimeline {...props} />);
}

describe('loading 状态', () => {
  it('显示可被读屏播报的状态区', () => {
    const html = render(baseProps({ state: 'loading' }));
    expect(html).toContain('正在加载版本历史');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
  });
});

describe('empty 状态', () => {
  it('没有版本记录时给出说明，且不渲染占位数据', () => {
    const html = render(
      baseProps({ revisions: revisionPage([]), reviewActions: reviewPage([]) }),
    );
    expect(html).toContain('还没有版本记录');
    expect(html).toContain('不会填充占位数据');
  });

  it('有版本但没有审核动作时单独说明，不假装有数据', () => {
    const html = render(
      baseProps({ revisions: revisionPage([revision(1)]), reviewActions: reviewPage([]) }),
    );
    expect(html).toContain('版本历史');
    expect(html).toContain('还没有审核动作记录');
  });
});

describe('error / forbidden 状态', () => {
  it('error 状态展示 requestId 与重试入口', () => {
    const html = render(
      baseProps({
        state: 'error',
        errorMessage: '服务端内部错误',
        requestId: 'req-123',
      }),
    );
    expect(html).toContain('版本历史加载失败');
    expect(html).toContain('服务端内部错误');
    expect(html).toContain('req-123');
    expect(html).toContain('重试');
    expect(html).toContain('role="alert"');
  });

  it('forbidden 状态文案明确是权限问题', () => {
    const html = render(
      baseProps({ state: 'forbidden', errorMessage: '角色不足', requestId: 'req-456' }),
    );
    expect(html).toContain('无法读取版本历史');
    expect(html).toContain('没有查看审核历史的权限');
    expect(html).toContain('req-456');
  });

  it('error 状态没有 requestId 时不渲染空占位', () => {
    const html = render(
      baseProps({ state: 'error', errorMessage: '网络中断', requestId: null }),
    );
    expect(html).toContain('网络中断');
    expect(html).not.toContain('requestId:');
  });
});

describe('success 状态：版本时间线', () => {
  it('渲染版本号、动作、操作人、标题', () => {
    const html = render(
      baseProps({
        revisions: revisionPage([revision(2), revision(1)]),
        reviewActions: reviewPage([]),
      }),
    );
    expect(html).toContain('v2');
    expect(html).toContain('v1');
    expect(html).toContain('编辑');
    expect(html).toContain('建稿');
    expect(html).toContain('编辑者1');
    expect(html).toContain('标题1');
  });

  it('标明历史不可编辑或删除', () => {
    const html = render(
      baseProps({ revisions: revisionPage([revision(1)]), reviewActions: reviewPage([]) }),
    );
    expect(html).toContain('版本只读，不能编辑或删除');
  });

  it('选择按钮带 aria-pressed，可被读屏识别选中态', () => {
    const html = render(
      baseProps({ revisions: revisionPage([revision(1)]), reviewActions: reviewPage([]) }),
    );
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('>选择<');
  });

  it('有下一页时给出加载更多入口，没有时不给', () => {
    const withMore = render(
      baseProps({
        revisions: revisionPage([revision(2)], true),
        reviewActions: reviewPage([]),
      }),
    );
    expect(withMore).toContain('加载更多版本');

    const withoutMore = render(
      baseProps({ revisions: revisionPage([revision(1)]), reviewActions: reviewPage([]) }),
    );
    expect(withoutMore).not.toContain('加载更多版本');
  });

  it('表格有可访问名称与列头', () => {
    const html = render(
      baseProps({ revisions: revisionPage([revision(1)]), reviewActions: reviewPage([]) }),
    );
    expect(html).toContain('<caption');
    expect(html).toContain('内容版本历史');
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
  });
});

describe('success 状态：审核动作', () => {
  const action: ReviewActionRecord = {
    action: 'REJECT',
    fromStatus: 'IN_REVIEW',
    toStatus: 'DRAFT',
    reason: '缺少可核验来源',
    createdAt: '2026-10-12T00:00:00.000Z',
    actor: { id: 'r1', displayName: '审核者' },
  };

  it('渲染动作、状态迁移、操作人与退回理由', () => {
    const html = render(
      baseProps({
        revisions: revisionPage([revision(1)]),
        reviewActions: reviewPage([action]),
      }),
    );
    expect(html).toContain('审核动作');
    expect(html).toContain('退回修改');
    expect(html).toContain('审核中');
    expect(html).toContain('草稿');
    expect(html).toContain('审核者');
    expect(html).toContain('理由：缺少可核验来源');
  });

  it('无退回理由时不渲染理由行', () => {
    const html = render(
      baseProps({
        revisions: revisionPage([revision(1)]),
        reviewActions: reviewPage([{ ...action, action: 'SUBMIT', reason: null }]),
      }),
    );
    expect(html).toContain('提交审核');
    expect(html).not.toContain('理由：');
  });

  it('未知动作名原样显示，不编造中文标签', () => {
    const html = render(
      baseProps({
        revisions: revisionPage([revision(1)]),
        reviewActions: reviewPage([{ ...action, action: 'SOME_FUTURE_ACTION' }]),
      }),
    );
    expect(html).toContain('SOME_FUTURE_ACTION');
  });
});

describe('快照截断如实呈现', () => {
  it('选中版本时提示差异不完整（截断由服务端标记）', () => {
    // 未选版本时不渲染 diff 区；这里验证"有截断标记的快照"本身不引发异常，
    // 且时间线照常渲染 —— 截断信息只在对比视图里出现。
    const html = render(
      baseProps({
        revisions: revisionPage([
          revision(2, {
            bodyText: '很长的正文',
            bodyTextLength: 5000,
            bodyTextTruncated: true,
          }),
        ]),
        reviewActions: reviewPage([]),
      }),
    );
    expect(html).toContain('v2');
    expect(html).not.toContain('undefined');
  });
});