import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdminHomepageSlot, HomepageCandidate } from '@/api/types';
import type { SessionUser } from '@/features/shared/session';

import { homepageApi, isApiAuthError, isApiError } from '@/api/client';
import { Badge } from '@/features/shared/Badge';
import { Button, ButtonRow } from '@/features/shared/Button';
import { formatDateTime } from '@/features/shared/datetime';
import { Field } from '@/features/shared/Field';
import { EmptyState, ErrorState, Loading } from '@/features/shared/States';
import { card, dangerBanner, inputStyle, mutedText, row, stack } from '@/features/shared/styles';

/**
 * 首页槽位管理（FD-007）。
 *
 * 槽位键是受控字典（hero / featured / latest / places / routes），每个键**只有一条**
 * 配置记录，所以这里的"排序"是改 `position`，不是拖拽重排。
 *
 * 页面要回答的核心问题是「**为什么首页上没显示**」。有四个互相独立的原因，
 * 每一项都对应一个可见标记：
 *   - 未开始（SCHEDULED）/ 已过期（EXPIRED）→ 时间窗
 *   - 内容被撤回或归档（contentUnavailable）→ 内容状态
 *   - 同一内容挂在多个槽位（conflictWith）→ 配置冲突
 *   - 空槽位 → 还没配内容
 *
 * 内容候选只列出**已发布且未归档**的条目，与服务端校验同源；但服务端仍会
 * 独立再验一次 —— 前端过滤只是省一次往返，不是授权（AGENTS.md §4.1）。
 */

export interface HomepageSlotPageProps {
  user: SessionUser;
  onUnauthorized: () => void;
}

const SLOT_KEYS = [
  { key: 'hero', label: '头图 hero' },
  { key: 'featured', label: '精选 featured' },
  { key: 'latest', label: '最新 latest' },
  { key: 'places', label: '地点 places' },
  { key: 'routes', label: '路线 routes' },
] as const;

const SLOT_KEY_SET = new Set<string>(SLOT_KEYS.map((item) => item.key));

interface LoadState {
  status: 'loading' | 'ready' | 'error' | 'forbidden';
  slots: AdminHomepageSlot[];
  message: string | null;
  requestId: string | null;
}

const INITIAL: LoadState = { status: 'loading', slots: [], message: null, requestId: null };

export function HomepageSlotPage({ user, onUnauthorized }: HomepageSlotPageProps) {
  const [state, setState] = useState<LoadState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const isAdmin = user.roles.includes('ADMIN');

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const slots = await homepageApi.listSlots(controller.signal);
      setState({ status: 'ready', slots, message: null, requestId: null });
    } catch (cause) {
      if (isAbortLike(cause)) {
        return;
      }
      if (isApiAuthError(cause)) {
        onUnauthorized();
        return;
      }
      setState({
        status: isApiError(cause) && cause.status === 403 ? 'forbidden' : 'error',
        slots: [],
        message: cause instanceof Error ? cause.message : '槽位加载失败',
        requestId: isApiError(cause) ? cause.requestId : null,
      });
    }
  }, [onUnauthorized]);

  useEffect(() => {
    if (isAdmin) {
      void load();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [isAdmin, load]);

  if (!isAdmin) {
    return <ErrorState title="无权配置首页槽位" message="首页槽位配置仅限管理员。" forbidden />;
  }

  return (
    <div style={{ ...stack, maxWidth: 'var(--app-max-content)' }}>
      <div style={row}>
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>首页槽位</h1>
        <span style={mutedText}>只有已发布且未归档的内容才能上首页；服务端会再校验一次。</span>
      </div>

      {state.status === 'loading' ? (
        /*
         * 五个槽位键是**已知常量**（受控字典），不依赖服务端数据。
         * 所以加载时先渲染区块骨架，而不是整页一个 loading ——
         * 否则编辑会以为"没有槽位可配"，加载完成后页面结构还会突然长出来。
         */
        <div style={stack}>
          {SLOT_KEYS.map((item) => (
            <section
              key={item.key}
              aria-labelledby={`slot-${item.key}`}
              style={{ ...card, ...stack }}
            >
              <div style={row}>
                <h2 id={`slot-${item.key}`} style={{ fontSize: '1.05rem', margin: 0 }}>
                  {item.label}
                </h2>
                <code>{item.key}</code>
              </div>
              <Loading label={`正在加载 ${item.label} 的配置…`} />
            </section>
          ))}
        </div>
      ) : null}
      {state.status === 'forbidden' ? (
        <ErrorState
          title="无权配置首页槽位"
          message={state.message ?? '首页槽位配置仅限管理员。'}
          forbidden
          {...(state.requestId === null ? {} : { requestId: state.requestId })}
        />
      ) : null}
      {state.status === 'error' ? (
        <ErrorState
          title="槽位加载失败"
          message={state.message ?? '请重试。'}
          {...(state.requestId === null ? {} : { requestId: state.requestId })}
          onRetry={() => void load()}
        />
      ) : null}

      {state.status === 'ready' ? (
        <div style={stack}>
          {SLOT_KEYS.map((item) => (
            <SlotEditor
              key={item.key}
              slotKey={item.key}
              slotLabel={item.label}
              slot={state.slots.find((entry) => entry.slotKey === item.key) ?? null}
              onSaved={() => void load()}
              onUnauthorized={onUnauthorized}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SlotEditor({
  slotKey,
  slotLabel,
  slot,
  onSaved,
  onUnauthorized,
}: {
  slotKey: (typeof SLOT_KEYS)[number]['key'];
  slotLabel: string;
  slot: AdminHomepageSlot | null;
  onSaved: () => void;
  onUnauthorized: () => void;
}) {
  const [contentId, setContentId] = useState(slot?.contentId ?? '');
  const [position, setPosition] = useState(String(slot?.position ?? 0));
  const [startsAt, setStartsAt] = useState(toLocalInput(slot?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(slot?.endsAt ?? null));
  const [candidates, setCandidates] = useState<HomepageCandidate[]>([]);
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // 服务端数据变化（保存后 reload）时同步回表单。
  useEffect(() => {
    setContentId(slot?.contentId ?? '');
    setPosition(String(slot?.position ?? 0));
    setStartsAt(toLocalInput(slot?.startsAt ?? null));
    setEndsAt(toLocalInput(slot?.endsAt ?? null));
  }, [slot]);

  async function search(): Promise<void> {
    setSearching(true);
    try {
      const page = await homepageApi.listCandidates(
        keyword.trim() === '' ? undefined : { q: keyword.trim() },
      );
      setCandidates(page.items);
    } catch (cause) {
      if (isApiAuthError(cause)) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof Error ? cause.message : '候选内容检索失败');
    } finally {
      setSearching(false);
    }
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setRequestId(null);
    setSaved(false);
    try {
      await homepageApi.configureSlot({
        slotKey,
        contentId: contentId.trim() === '' ? null : contentId.trim(),
        position: Number.parseInt(position, 10) || 0,
        startsAt: startsAt === '' ? null : new Date(startsAt).toISOString(),
        endsAt: endsAt === '' ? null : new Date(endsAt).toISOString(),
      });
      setSaved(true);
      onSaved();
    } catch (cause) {
      if (isApiAuthError(cause)) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof Error ? cause.message : '保存失败');
      setRequestId(isApiError(cause) ? cause.requestId : null);
    } finally {
      setBusy(false);
    }
  }

  const positionInvalid = !Number.isInteger(Number.parseInt(position, 10));

  return (
    <section aria-labelledby={`slot-${slotKey}`} style={{ ...card, ...stack }}>
      <div style={row}>
        <h2 id={`slot-${slotKey}`} style={{ fontSize: '1.05rem', margin: 0 }}>
          {slotLabel}
        </h2>
        <code>{slotKey}</code>
        <SlotStateBadge slot={slot} />
      </div>

      {slot?.contentUnavailable === true ? (
        <p role="alert" style={dangerBanner}>
          引用的内容当前是「{slot.contentStatus ?? '未知'}」，<strong>不会出现在首页</strong>
          。请换一条已发布的内容，或先把它发布。
        </p>
      ) : null}

      {slot !== null && slot.conflictWith.length > 0 ? (
        <p role="alert" style={dangerBanner}>
          同一条内容还被挂在：{slot.conflictWith.join(' / ')}
          。同一内容出现在多个槽位通常是配置错误。
        </p>
      ) : null}

      <div style={row}>
        <Field label="位置" required error={positionInvalid ? '必须是 0 ~ 999 的整数' : null}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              type="number"
              min={0}
              max={999}
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              style={inputStyle}
            />
          )}
        </Field>
        <Field label="生效开始" hint="留空表示不限（常驻）">
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              style={inputStyle}
            />
          )}
        </Field>
        <Field label="生效结束" hint="留空表示不限；到点自动下架">
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              style={inputStyle}
            />
          )}
        </Field>
      </div>

      <div style={stack}>
        <Field label="检索可挂载内容" hint="只列出已发布且未归档的内容">
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void search();
                }
              }}
              style={inputStyle}
            />
          )}
        </Field>
        <ButtonRow>
          <Button busy={searching} onClick={() => void search()}>
            检索
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={busy || positionInvalid}
            onClick={() => void save()}
          >
            保存槽位
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setContentId('');
              setPosition('0');
              setStartsAt('');
              setEndsAt('');
            }}
          >
            清空表单
          </Button>
        </ButtonRow>
      </div>

      {candidates.length === 0 ? (
        <p style={mutedText}>尚未检索候选内容。按标题或 slug 检索后选择。</p>
      ) : (
        <div style={stack}>
          <span style={mutedText}>候选内容（{candidates.length} 条）</span>
          <ul style={{ ...stack, listStyle: 'none', padding: 0, margin: 0 }}>
            {candidates.map((item) => (
              <li key={item.id} style={row}>
                <Button
                  variant={contentId === item.id ? 'primary' : 'default'}
                  ariaPressed={contentId === item.id}
                  disabled={busy}
                  title={`选择「${item.title}」`}
                  onClick={() => {
                    setContentId(item.id);
                    setSaved(false);
                  }}
                >
                  {contentId === item.id ? '已选' : '选择'}
                </Button>
                <span>{item.title}</span>
                <code>{item.slug}</code>
                <Badge tone="approved">{item.status}</Badge>
                <span style={mutedText}>
                  {item.publishedAt === null ? '' : formatDateTime(item.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={mutedText}>
        当前引用：
        {slot?.contentTitle === null || slot?.contentTitle === undefined ? (
          <strong>（空槽位，首页该区块不显示内容）</strong>
        ) : (
          <>
            <strong>{slot.contentTitle}</strong>（{slot.contentStatus}）
          </>
        )}
      </p>

      {saved ? <p style={mutedText}>已保存。</p> : null}

      {error === null ? null : (
        <p role="alert" style={dangerBanner}>
          {error}
          {requestId === null ? null : <span style={mutedText}> requestId: {requestId}</span>}
        </p>
      )}
    </section>
  );
}

/** 槽位当前是否生效 —— 时间窗与内容可用性是两个独立维度，分开展示。 */
function SlotStateBadge({ slot }: { slot: AdminHomepageSlot | null }) {
  if (slot === null) {
    return <Badge tone="neutral">未配置</Badge>;
  }
  if (slot.contentUnavailable) {
    return <Badge tone="danger">内容不可用</Badge>;
  }
  if (slot.activeState === 'SCHEDULED') {
    return <Badge tone="review">未开始</Badge>;
  }
  if (slot.activeState === 'EXPIRED') {
    return <Badge tone="archived">已过期</Badge>;
  }
  return <Badge tone="published">生效中</Badge>;
}

/** ISO → `datetime-local` 的本地时间字符串；空值返回空串。 */
function toLocalInput(iso: string | null): string {
  if (iso === null) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function isAbortLike(cause: unknown): boolean {
  return cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'ApiAbortError');
}

/** 槽位键合法性（前后端都要校验；这里只是省一次往返）。 */
export function isKnownSlotKey(value: string): boolean {
  return SLOT_KEY_SET.has(value);
}

/** 空状态在"全部槽位都未配置"时才有意义。 */
export function AllSlotsEmptyHint({ slots }: { slots: readonly AdminHomepageSlot[] }) {
  if (slots.length > 0) {
    return null;
  }
  return (
    <EmptyState
      title="还没有配置任何槽位"
      description="为每个区块选择一条已发布的内容；留空的区块首页不显示内容。"
    />
  );
}
