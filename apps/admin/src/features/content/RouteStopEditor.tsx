import { useCallback, useEffect, useRef, useState } from 'react';

import type { RouteStopAdminItem } from '@/api/types';
import type { SessionUser } from '@/features/shared/session';

import { routeApi, isApiAuthError, isApiError } from '@/api/client';
import { Badge } from '@/features/shared/Badge';
import { Button, ButtonRow } from '@/features/shared/Button';
import { EmptyState, ErrorState, Loading } from '@/features/shared/States';
import { dangerBanner, mutedText, row, stack, tableStyle } from '@/features/shared/styles';

/**
 * 路线站点编排（FD-009）。
 *
 * ## 排序为什么用按钮而不是拖拽
 *
 * FD-009 原文：「支持键盘可操作的排序；拖拽只能作为增强功能」。
 * 拖拽对键盘用户和读屏用户基本不可用，而站点顺序本身就是策展内容 ——
 * 顺序错了，路线就错了。所以主交互是「上移 / 下移」按钮（天然键盘可达），
 * 没有引入拖拽库。
 *
 * ## position 不由前端算
 *
 * 前端只维护一个数组，保存时整条 `PUT`，服务端按数组下标写 position。
 * 这样「客户端自己传位置造出跳号路线」在结构上就不可能（DTO 里没有 position 字段）。
 *
 * ## 未核验站点
 *
 * `hasPoint: false` 的站点仍在列表里（不能静默丢弃，那会破坏站序），
 * 但会明确标注「不会画到地图上」—— FD-009 的硬要求。
 */

export interface RouteStopEditorProps {
  routeId: string;
  user: SessionUser;
}

interface EditorState {
  status: 'loading' | 'ready' | 'error' | 'forbidden';
  stops: RouteStopAdminItem[];
  message: string | null;
  requestId: string | null;
}

const INITIAL: EditorState = { status: 'loading', stops: [], message: null, requestId: null };

export function RouteStopEditor({ routeId, user }: RouteStopEditorProps) {
  const [state, setState] = useState<EditorState>(INITIAL);
  const [draft, setDraft] = useState<RouteStopAdminItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const page = await routeApi.listStops(routeId, controller.signal);
      setState({ status: 'ready', stops: page.stops, message: null, requestId: null });
      setDraft(page.stops);
    } catch (cause) {
      if (isAbortLike(cause)) {
        return;
      }
      if (isApiAuthError(cause)) {
        setState((prev) => ({ ...prev, status: 'error' }));
        return;
      }
      setState({
        status: isApiError(cause) && cause.status === 403 ? 'forbidden' : 'error',
        stops: [],
        message: cause instanceof Error ? cause.message : '站点加载失败',
        requestId: isApiError(cause) ? cause.requestId : null,
      });
    }
  }, [routeId]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  /** 把第 index 站与相邻站交换；position 由服务端按下标重算。 */
  function move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= draft.length) {
      return;
    }
    setDraft((prev) => {
      const next = [...prev];
      const a = next[index];
      const b = next[target];
      if (a === undefined || b === undefined) {
        return prev;
      }
      next[index] = b;
      next[target] = a;
      return next;
    });
    setSaved(false);
  }

  function removeAt(index: number): void {
    setDraft((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await routeApi.replaceStops(routeId, {
        stops: draft.map((stop) => ({
          placeContentId: stop.place?.contentId ?? '',
          note: stop.note,
        })),
      });
      setSaved(true);
      await load();
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : '保存失败',
        requestId: isApiError(cause) ? cause.requestId : null,
      });
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'forbidden') {
    return (
      <ErrorState
        title="无权编排该路线"
        message={state.message ?? '需要编辑角色。'}
        forbidden
        {...(state.requestId === null ? {} : { requestId: state.requestId })}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        title="路线站点加载失败"
        message={state.message ?? '请重试。'}
        {...(state.requestId === null ? {} : { requestId: state.requestId })}
        onRetry={() => void load()}
      />
    );
  }

  if (state.status === 'loading') {
    return <Loading label="正在加载路线站点…" />;
  }

  const missing = draft.some((stop) => stop.place === null);
  const unlocatable = draft.some((stop) => stop.place !== null && !stop.place.hasPoint);

  return (
    <div style={stack}>
      <div style={row}>
        <h2 style={{ fontSize: '1.05rem', margin: 0 }}>路线站点</h2>
        <span style={mutedText}>共 {draft.length} 站 · 顺序即策展内容</span>
      </div>

      {draft.length === 0 ? (
        <EmptyState
          title="还没有站点"
          description="用上方内容检索选择地点，按期望顺序加入。空站点的路线页会正常打开，只是不显示任何站点。"
        />
      ) : (
        <table style={tableStyle} aria-label="路线站点列表">
          <caption style={srOnlyCaption}>路线站点顺序，可用上移下移按钮调整</caption>
          <thead>
            <tr>
              <th scope="col">顺序</th>
              <th scope="col">站点</th>
              <th scope="col">核验</th>
              <th scope="col">移动</th>
              <th scope="col">移除</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((stop, index) => (
              <tr key={`${stop.place?.contentId ?? 'missing'}-${String(index)}`}>
                <td>第 {index + 1} 站</td>
                <th scope="row">
                  {stop.place === null ? (
                    <span style={mutedText}>（引用的内容已删除，占位保留）</span>
                  ) : (
                    stop.place.title
                  )}
                </th>
                <td>
                  {stop.place === null ? (
                    <span style={mutedText}>—</span>
                  ) : stop.place.hasPoint ? (
                    <Badge tone="published">已核验 · 上图</Badge>
                  ) : (
                    <Badge tone="review">未核验 · 不上图</Badge>
                  )}
                </td>
                <td>
                  <ButtonRow>
                    <Button
                      disabled={busy || index === 0}
                      ariaLabel={`上移 ${stop.place?.title ?? '缺失站点'}`}
                      onClick={() => move(index, -1)}
                    >
                      上移
                    </Button>
                    <Button
                      disabled={busy || index === draft.length - 1}
                      ariaLabel={`下移 ${stop.place?.title ?? '缺失站点'}`}
                      onClick={() => move(index, 1)}
                    >
                      下移
                    </Button>
                  </ButtonRow>
                </td>
                <td>
                  <Button
                    variant="danger"
                    busy={busy}
                    ariaLabel={`移除 ${stop.place?.title ?? '缺失站点'}`}
                    onClick={() => removeAt(index)}
                  >
                    移除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {unlocatable ? (
        <p style={mutedText}>
          标注「未核验」的站点仍会出现在公开路线页的列表里，但<strong>不会</strong>画到地图上。
          只要有一个站点没有可信坐标，整条路线连线就不会绘制。
        </p>
      ) : null}

      {missing ? (
        <p role="alert" style={dangerBanner}>
          有站点的内容已被删除。占位保留是为了不打乱站序，请移除后再保存。
        </p>
      ) : null}

      <RouteStopPicker
        routeId={routeId}
        busy={busy}
        onAdded={(stop) => {
          setDraft((prev) => [...prev, stop]);
          setSaved(false);
        }}
      />

      <ButtonRow>
        <Button
          variant="primary"
          busy={busy}
          disabled={busy || missing}
          onClick={() => void save()}
        >
          保存站点顺序
        </Button>
        {missing ? <span style={mutedText}>存在缺失站点的占位，先移除才能保存</span> : null}
        {saved ? <span style={mutedText}>已保存</span> : null}
      </ButtonRow>

      {error === null ? null : (
        <p role="alert" style={dangerBanner}>
          {error.message}
          {error.requestId === null ? null : (
            <span style={mutedText}> requestId: {error.requestId}</span>
          )}
        </p>
      )}

      <p style={mutedText}>操作身份：{user.displayName || user.email}</p>
    </div>
  );
}

/** 检索并加入站点。拉取候选后直接追加到草稿，由父级保存。 */
function RouteStopPicker({
  routeId,
  busy,
  onAdded,
}: {
  routeId: string;
  busy: boolean;
  onAdded: (stop: RouteStopAdminItem) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [candidates, setCandidates] = useState<
    readonly { id: string; title: string; slug: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function search(): Promise<void> {
    setSearching(true);
    setSearchError(null);
    try {
      const page = await routeApi.searchPlaceCandidates(
        keyword.trim() === '' ? undefined : { q: keyword.trim() },
      );
      setCandidates(page.items);
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : '地点检索失败');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div style={stack}>
      <h3 style={{ fontSize: '0.95rem', margin: 0 }}>添加站点</h3>
      <p style={mutedText}>按标题或 slug 检索地点；只有 PLACE 类型可以作为站点。</p>
      <div style={row}>
        <input
          type="search"
          aria-label="检索地点"
          placeholder="输入关键词后回车检索"
          disabled={busy}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void search();
            }
          }}
          style={searchStyle}
        />
        <Button busy={searching} disabled={busy} onClick={() => void search()}>
          检索地点
        </Button>
      </div>

      {candidates.length === 0 ? (
        <p style={mutedText}>尚未检索候选地点。</p>
      ) : (
        <ul style={{ ...stack, listStyle: 'none', padding: 0, margin: 0 }}>
          {candidates.map((item) => (
            <li key={item.id} style={row}>
              <Button
                disabled={busy}
                ariaLabel={`添加站点 ${item.title}`}
                onClick={() => {
                  onAdded({
                    position: 0,
                    note: null,
                    place: {
                      contentId: item.id,
                      title: item.title,
                      slug: item.slug,
                      status: 'PUBLISHED',
                      archivedAt: null,
                      verificationStatus: 'UNVERIFIED',
                      accuracy: 'UNKNOWN',
                      hasPoint: false,
                      pointNote: null,
                    },
                  });
                }}
              >
                添加
              </Button>
              <span>{item.title}</span>
              <code>{item.slug}</code>
            </li>
          ))}
        </ul>
      )}

      {searchError === null ? null : (
        <p role="alert" style={dangerBanner}>
          {searchError}
        </p>
      )}

      <span style={srOnlyCaption}>{`为路线 ${routeId} 添加站点`}</span>
    </div>
  );
}

function isAbortLike(cause: unknown): boolean {
  return cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'ApiAbortError');
}

const searchStyle: React.CSSProperties = {
  flex: '1 1 12rem',
  padding: 'var(--app-space-xs) var(--app-space-sm)',
  border: '1px solid var(--app-border)',
  borderRadius: '0.25rem',
  background: 'var(--app-bg)',
  color: 'var(--app-fg)',
  font: 'inherit',
};

const srOnlyCaption: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
