import { useCallback, useEffect, useRef, useState } from 'react';

import type { SourceSearchPage } from '@nanking-atlas/api-contract';

import { Button } from '@/features/shared/Button';
import { Field } from '@/features/shared/Field';
import { EmptyState, ErrorState, Loading } from '@/features/shared/States';
import { mutedText, row, stack, tableStyle } from '@/features/shared/styles';

/**
 * 来源检索选择器（FD-002）。
 *
 * 取代「手填来源 ID」：编辑按标题 / 作者 / 出版方检索，选中后即可关联。
 * 同一区块上方保留了「新建来源」表单，两者共用同一个选中态 ——
 * 刚建的来源可以直接被选中关联，不必去别处找它的 ID。
 *
 * ## 关于「已核验」
 *
 * 这里**不提供**任何"标记为已核验"的开关。来源的可信度由人工在
 * `verificationNote` 里写明（AGENTS.md §3.2：AI 不得自动把内容标为已核验），
 * 本组件只把已有的核验备注**如实展示**出来，不推断、不默认勾选。
 *
 * 状态：loading / empty / error / forbidden / success。
 * 没有 conflict —— 选择来源是本地选择动作，不与服务端并发写冲突
 * （真正的写冲突在"关联来源"提交时由服务端 409 表达）。
 */

export type SourceSort = 'createdAt:desc' | 'title:asc';

const searchStyle: React.CSSProperties = {
  width: '100%',
  minWidth: '12rem',
  padding: 'var(--app-space-xs) var(--app-space-sm)',
  border: '1px solid var(--app-border)',
  borderRadius: '0.25rem',
  background: 'var(--app-bg)',
  color: 'var(--app-fg)',
  font: 'inherit',
};

export interface SourceSearchRequest {
  q?: string;
  kind?: string;
  sort?: SourceSort;
  cursor?: string;
}

export interface SourcePickerProps {
  /** 拉取一页；由编辑页注入真实 client，便于测试与复用。 */
  onSearch: (request: SourceSearchRequest, signal?: AbortSignal) => Promise<SourceSearchPage>;
  selectedSourceId: string;
  onSelect: (sourceId: string) => void;
  disabled?: boolean;
}

interface PickerState {
  status: 'loading' | 'ready' | 'error' | 'forbidden';
  page: SourceSearchPage | null;
  message: string | null;
  requestId: string | null;
}

const INITIAL: PickerState = { status: 'loading', page: null, message: null, requestId: null };

export function SourcePicker({
  onSearch,
  selectedSourceId,
  onSelect,
  disabled = false,
}: SourcePickerProps) {
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<SourceSort>('createdAt:desc');
  const [state, setState] = useState<PickerState>(INITIAL);
  const [loadingMore, setLoadingMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (cursor?: string, append = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!append) {
        setState((prev) => ({ ...prev, status: 'loading' }));
      }
      try {
        const request: SourceSearchRequest = { sort };
        const trimmed = keyword.trim();
        if (trimmed.length > 0) {
          request.q = trimmed;
        }
        if (cursor !== undefined) {
          request.cursor = cursor;
        }
        const page = await onSearch(request, controller.signal);
        setState((prev) => ({
          status: 'ready',
          page: append && prev.page !== null ? appendPage(prev.page, page) : page,
          message: null,
          requestId: null,
        }));
      } catch (cause) {
        if (isAbortLike(cause)) {
          return;
        }
        const forbidden = isForbidden(cause);
        setState({
          status: forbidden ? 'forbidden' : 'error',
          page: null,
          message: cause instanceof Error ? cause.message : '来源检索失败',
          requestId: requestIdOf(cause),
        });
      }
    },
    [keyword, onSearch, sort],
  );

  // 首次进入即展示来源库（空关键词 = 全部），让编辑能看到"已经有哪些来源"。
  // 刻意**不做**输入即搜：每次按键都打服务端会让来源库抖成一团，
  // 改为回车 / 点「检索」显式触发。
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      setState((prev) => ({ ...prev, status: 'loading' }));
      try {
        const page = await onSearch({ sort: 'createdAt:desc' }, controller.signal);
        setState({ status: 'ready', page, message: null, requestId: null });
      } catch (cause) {
        if (isAbortLike(cause)) {
          return;
        }
        setState({
          status: isForbidden(cause) ? 'forbidden' : 'error',
          page: null,
          message: cause instanceof Error ? cause.message : '来源检索失败',
          requestId: requestIdOf(cause),
        });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [onSearch]);

  async function loadMore(): Promise<void> {
    const cursor = state.page?.nextCursor;
    if (cursor === null || cursor === undefined) {
      return;
    }
    setLoadingMore(true);
    try {
      await run(cursor, true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div style={stack}>
      <div style={row}>
        <Field label="检索来源" hint="按标题、作者或出版方匹配；留空显示全部来源">
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              type="search"
              disabled={disabled}
              value={keyword}
              placeholder="例如：金陵古今图考"
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void run();
                }
              }}
              style={{ ...searchStyle }}
            />
          )}
        </Field>
        <Button busy={state.status === 'loading'} disabled={disabled} onClick={() => void run()}>
          检索
        </Button>
      </div>

      <div style={row}>
        <label htmlFor="source-sort" style={mutedText}>
          排序
        </label>
        <select
          id="source-sort"
          disabled={disabled}
          value={sort}
          onChange={(event) => {
            setSort(event.target.value === 'title:asc' ? 'title:asc' : 'createdAt:desc');
            void run();
          }}
          style={searchStyle}
        >
          <option value="createdAt:desc">最新优先</option>
          <option value="title:asc">标题升序</option>
        </select>
        <span style={mutedText}>中文按码点序排序，不是拼音序</span>
      </div>

      <ResultBody
        state={state}
        selectedSourceId={selectedSourceId}
        disabled={disabled}
        loadingMore={loadingMore}
        onSelect={onSelect}
        onLoadMore={() => void loadMore()}
        onRetry={() => void run()}
      />
    </div>
  );
}

interface ResultBodyProps {
  state: PickerState;
  selectedSourceId: string;
  disabled: boolean;
  loadingMore: boolean;
  onSelect: (sourceId: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

function ResultBody({
  state,
  selectedSourceId,
  disabled,
  loadingMore,
  onSelect,
  onLoadMore,
  onRetry,
}: ResultBodyProps) {
  if (state.status === 'loading') {
    return <Loading label="正在检索来源…" />;
  }

  if (state.status === 'forbidden') {
    return (
      <ErrorState
        title="无法检索来源"
        message={state.message ?? '当前账号角色没有查看来源库的权限。'}
        forbidden
        {...(state.requestId === null ? {} : { requestId: state.requestId })}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        title="来源检索失败"
        message={state.message ?? '请重试。'}
        {...(state.requestId === null ? {} : { requestId: state.requestId })}
        onRetry={onRetry}
      />
    );
  }

  const items = state.page?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        title="没有匹配的来源"
        description="换个关键词，或用上方表单新建一条来源。检索不会自动创建任何记录。"
      />
    );
  }

  return (
    <div style={stack}>
      <table style={tableStyle}>
        <caption style={srOnlyCaption}>来源检索结果</caption>
        <thead>
          <tr>
            <th scope="col">选择</th>
            <th scope="col">标题</th>
            <th scope="col">类型</th>
            <th scope="col">作者</th>
            <th scope="col">出版方</th>
            <th scope="col">访问日期</th>
            <th scope="col">核验备注</th>
          </tr>
        </thead>
        <tbody>
          {items.map((source) => (
            <tr key={source.id}>
              <td>
                <Button
                  variant={source.id === selectedSourceId ? 'primary' : 'default'}
                  ariaPressed={source.id === selectedSourceId}
                  disabled={disabled}
                  onClick={() => onSelect(source.id)}
                >
                  {source.id === selectedSourceId ? '已选' : '选择'}
                </Button>
              </td>
              <th scope="row">{source.title}</th>
              <td>{source.kind}</td>
              <td>{source.author ?? <span style={mutedText}>—</span>}</td>
              <td>{source.publisher ?? <span style={mutedText}>—</span>}</td>
              <td>{source.accessedAt?.slice(0, 10) ?? <span style={mutedText}>—</span>}</td>
              <td>
                {source.verificationNote === null ? (
                  <span style={mutedText}>未填写</span>
                ) : (
                  <span title={source.verificationNote}>
                    {truncate(source.verificationNote, 24)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/*
        同一来源可能有多条同名记录（作者 / 出版方 / 日期不同）。
        上表把它们逐条列出而不是折叠，编辑才能判断该选哪一条 ——
        这是 FD-002 对「返回数据必须足够区分同名来源」的要求。
      */}
      {selectedSourceId === '' ? (
        <p style={mutedText}>尚未选择来源。选中后填写下方「支撑论断」完成关联。</p>
      ) : (
        <p style={mutedText}>
          已选择来源：<code>{selectedSourceId}</code>
        </p>
      )}

      {state.page?.hasMore === true ? (
        <div>
          <Button busy={loadingMore} onClick={onLoadMore}>
            加载更多
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function appendPage(prev: SourceSearchPage, next: SourceSearchPage): SourceSearchPage {
  // 服务端已保证同一排序下的 keyset 分页不重不漏；这里只做稳定去重，
  // 避免网络重试把同一条重复渲染出来。
  const seen = new Set(prev.items.map((item) => item.id));
  return {
    items: [...prev.items, ...next.items.filter((item) => !seen.has(item.id))],
    nextCursor: next.nextCursor,
    hasMore: next.hasMore,
  };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function isAbortLike(cause: unknown): boolean {
  return cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'ApiAbortError');
}

function isForbidden(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { status?: unknown }).status === 403
  );
}

function requestIdOf(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null) {
    return null;
  }
  const value = (cause as { requestId?: unknown }).requestId;
  return typeof value === 'string' ? value : null;
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