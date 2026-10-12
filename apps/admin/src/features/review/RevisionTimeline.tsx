import { useMemo, useState } from 'react';

import type {
  Revision,
  RevisionPage,
  ReviewActionRecord,
  ReviewActionPage,
} from '@nanking-atlas/api-contract';

import { diffRevisions, revisionActionLabel, type RevisionDiff } from './revisionDiff';

import { StatusBadge } from '@/features/shared/Badge';
import { Button } from '@/features/shared/Button';
import { formatDateTime } from '@/features/shared/datetime';
import { EmptyState, ErrorState, Loading } from '@/features/shared/States';
import { card, dangerBanner, mutedText, row, stack, tableStyle } from '@/features/shared/styles';
import { statusLabel } from '@/features/shared/workflow';

/**
 * 审核区版本时间线（FD-001）。
 *
 * 覆盖的状态：loading / empty / error / forbidden / success。
 * **没有** conflict 状态：历史是不可变的只读快照，既不编辑也不提交，
 * 不存在"与服务端版本冲突"这回事 —— 硬造一个反而会误导。
 * 真正会冲突的是编辑区，那边已有 ConflictDialog。
 *
 * 数据来自两个独立端点：版本历史（revisions）与审核动作（review-actions）。
 * 状态流转只写审核动作、不产生版本，所以**不能**把两者合成一个列表 ——
 * 这里只并排展示，不编造二者的对应关系。
 */

export interface RevisionTimelineProps {
  revisions: RevisionPage | null;
  reviewActions: ReviewActionPage | null;
  state: 'loading' | 'ready' | 'error' | 'forbidden';
  errorMessage: string | null;
  requestId: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}

export function RevisionTimeline({
  revisions,
  reviewActions,
  state,
  errorMessage,
  requestId,
  loadingMore,
  onLoadMore,
  onRetry,
}: RevisionTimelineProps) {
  const revisionList = useMemo(() => revisions?.items ?? [], [revisions]);

  if (state === 'loading') {
    return <Loading label="正在加载版本历史…" />;
  }

  if (state === 'forbidden') {
    return (
      <ErrorState
        title="无法读取版本历史"
        message={errorMessage ?? '当前账号角色没有查看审核历史的权限。'}
        forbidden
        {...(requestId === null ? {} : { requestId })}
      />
    );
  }

  if (state === 'error') {
    return (
      <ErrorState
        title="版本历史加载失败"
        message={errorMessage ?? '请重试。'}
        {...(requestId === null ? {} : { requestId })}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div style={stack}>
      <RevisionList
        revisions={revisionList}
        hasMore={revisions?.hasMore === true}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
      />
      <ReviewActionList
        actions={reviewActions?.items ?? []}
        hasMore={reviewActions?.hasMore === true}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}

interface RevisionListProps {
  revisions: readonly Revision[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

function RevisionList({ revisions, hasMore, loadingMore, onLoadMore }: RevisionListProps) {
  // 选中的两个版本号。null = 未进入对比模式。
  const [diffPair, setDiffPair] = useState<{ from: number; to: number } | null>(null);

  const diff = useMemo(() => {
    if (diffPair === null) {
      return null;
    }
    const from = revisions.find((item) => item.revisionNo === diffPair.from);
    const to = revisions.find((item) => item.revisionNo === diffPair.to);
    // 两端必须都**在当前已加载的页**里，否则不能声称"没有差异"。
    if (from === undefined || to === undefined) {
      return null;
    }
    return diffRevisions(from, to);
  }, [diffPair, revisions]);

  function togglePick(revisionNo: number): void {
    setDiffPair((current) => {
      if (current === null) {
        return { from: revisionNo, to: revisionNo };
      }
      if (current.from === revisionNo && current.to === revisionNo) {
        return null;
      }
      if (current.from === revisionNo) {
        return { from: revisionNo, to: current.to };
      }
      if (current.to === revisionNo) {
        return { from: current.from, to: revisionNo };
      }
      // 选了第三个版本：固定时间线上更早的一端为 from，不让用户
      // 以为之前的对比被丢弃了。
      return { from: Math.min(current.from, revisionNo), to: Math.max(current.from, revisionNo) };
    });
  }

  const pickedCount = diffPair === null ? 0 : diffPair.from === diffPair.to ? 1 : 2;

  if (revisions.length === 0) {
    return (
      <EmptyState
        title="还没有版本记录"
        description="内容一旦保存就会产生不可变的版本快照；这里不会填充占位数据。"
      />
    );
  }

  return (
    <div style={stack}>
      <div style={row}>
        <strong>
          版本历史（{revisions.length} 条{hasMore ? '，还有更多' : ''}）
        </strong>
        <span style={mutedText}>
          {pickedCount === 0
            ? '选择两个版本可查看差异（版本只读，不能编辑或删除）'
            : pickedCount === 1
              ? '已选择 1 个版本，再选一个即可对比'
              : '已选择 2 个版本'}
        </span>
        {diffPair === null ? null : <Button onClick={() => setDiffPair(null)}>清除选择</Button>}
      </div>

      <table style={tableStyle}>
        <caption style={srOnlyCaption}>内容版本历史，按版本号倒序</caption>
        <thead>
          <tr>
            <th scope="col">对比</th>
            <th scope="col">版本</th>
            <th scope="col">动作</th>
            <th scope="col">操作人</th>
            <th scope="col">时间</th>
            <th scope="col">标题</th>
          </tr>
        </thead>
        <tbody>
          {revisions.map((revision) => {
            const selected =
              diffPair !== null &&
              (diffPair.from === revision.revisionNo || diffPair.to === revision.revisionNo);
            return (
              <tr key={revision.revisionNo}>
                <td>
                  <Button
                    variant={selected ? 'primary' : 'default'}
                    ariaPressed={selected}
                    onClick={() => togglePick(revision.revisionNo)}
                  >
                    {selected ? '已选' : '选择'}
                  </Button>
                </td>
                <th scope="row">v{revision.revisionNo}</th>
                <td>{revisionActionLabel(revision.action)}</td>
                <td>{revision.actor.displayName}</td>
                <td>{formatDateTime(revision.createdAt)}</td>
                <td>{revision.snapshot.title}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {diffPair === null ? null : diff === null ? (
        <p role="alert" style={dangerBanner}>
          选择的两个版本不在当前已加载的列表里，请重新选择或先加载更多。
        </p>
      ) : (
        <DiffView diff={diff} />
      )}

      {hasMore ? (
        <div>
          <Button busy={loadingMore} onClick={onLoadMore}>
            加载更多版本
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DiffView({ diff }: { diff: RevisionDiff }) {
  return (
    <section aria-label="版本差异" style={{ ...card, ...stack }}>
      <div style={row}>
        <strong>
          v{diff.fromRevisionNo} → v{diff.toRevisionNo} 差异
        </strong>
        {diff.changed ? null : <span style={mutedText}>两个版本在可见字段上没有差异</span>}
      </div>

      {diff.fields.some((field) => field.changed) ? (
        <table style={tableStyle}>
          <caption style={srOnlyCaption}>字段级差异</caption>
          <thead>
            <tr>
              <th scope="col">字段</th>
              <th scope="col">v{diff.fromRevisionNo}</th>
              <th scope="col">v{diff.toRevisionNo}</th>
            </tr>
          </thead>
          <tbody>
            {diff.fields.map((field) => (
              <tr key={field.field}>
                <th scope="row">{field.label}</th>
                <td>
                  {field.before === '' ? <span style={mutedText}>（空）</span> : field.before}
                </td>
                <td>
                  {field.after === '' ? (
                    <span style={mutedText}>（空）</span>
                  ) : (
                    <TextSegments
                      segments={[
                        { kind: 'same', text: field.before },
                        { kind: 'added', text: field.after },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {diff.body.changed || diff.body.truncated ? (
        <div style={stack}>
          <strong>正文</strong>
          {diff.body.truncated ? (
            <p style={mutedText}>
              这一版的正文超出服务端上限已被截断，下面的比较只覆盖可见部分，不代表全文。
            </p>
          ) : null}
          {diff.body.changed ? (
            <TextSegments segments={diff.body.segments} />
          ) : (
            <p style={mutedText}>可见正文没有差异。</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

const SEGMENT_STYLE: Readonly<Record<string, React.CSSProperties>> = {
  same: { whiteSpace: 'pre-wrap' },
  removed: {
    whiteSpace: 'pre-wrap',
    background: 'var(--app-warning-bg)',
    color: 'var(--app-warning-fg)',
    textDecoration: 'line-through',
  },
  added: {
    whiteSpace: 'pre-wrap',
    background: 'var(--app-warning-bg)',
    textDecoration: 'underline',
  },
};

function TextSegments({
  segments,
}: {
  segments: readonly RevisionDiff['body']['segments'][number][];
}) {
  if (segments.length === 0) {
    return <p style={mutedText}>（空）</p>;
  }
  return (
    <p style={{ ...stack, margin: 0 }}>
      {segments.map((segment, index) => (
        <span key={`${segment.kind}-${String(index)}`} style={SEGMENT_STYLE[segment.kind]}>
          {segment.text}
        </span>
      ))}
    </p>
  );
}

const REVIEW_ACTION_LABELS: Readonly<Record<string, string>> = {
  SUBMIT: '提交审核',
  APPROVE: '审核通过',
  REJECT: '退回修改',
  PUBLISH: '发布',
  ARCHIVE: '归档',
  RESTORE: '恢复为草稿',
};

function reviewActionLabel(action: string): string {
  return REVIEW_ACTION_LABELS[action] ?? action;
}

function ReviewActionList({
  actions,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  actions: readonly ReviewActionRecord[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (actions.length === 0) {
    return (
      <p style={mutedText}>
        还没有审核动作记录。提交、退回、发布等状态流转会在这里留下只增不改的痕迹。
      </p>
    );
  }

  return (
    <div style={stack}>
      <strong>
        审核动作（{actions.length} 条{hasMore ? '，还有更多' : ''}）
      </strong>
      <ul style={{ ...stack, listStyle: 'none', padding: 0, margin: 0 }}>
        {actions.map((action, index) => (
          <li key={`${action.createdAt}-${String(index)}`} style={card}>
            <div style={row}>
              <strong>{reviewActionLabel(action.action)}</strong>
              <span style={mutedText}>
                {statusLabel(action.fromStatus)} → {statusLabel(action.toStatus)}
              </span>
              <StatusBadge status={action.toStatus} />
              <span style={mutedText}>{action.actor.displayName}</span>
              <span style={mutedText}>{formatDateTime(action.createdAt)}</span>
            </div>
            {action.reason === null ? null : <p style={mutedText}>理由：{action.reason}</p>}
          </li>
        ))}
      </ul>
      {hasMore ? (
        <div>
          <Button busy={loadingMore} onClick={onLoadMore}>
            加载更多审核记录
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** 表格 caption：视觉隐藏但保留给读屏（AGENTS.md §6.4）。 */
const srOnlyCaption: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
