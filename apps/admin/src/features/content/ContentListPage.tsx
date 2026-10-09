import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AdminContentDto, ContentAction, ContentStatus, ContentType } from '@/api/types';
import type { SessionUser } from '@/features/shared/session';

import { contentApi, isApiAuthError, isApiError } from '@/api/client';
import { CONTENT_STATUSES, CONTENT_TYPES } from '@/api/types';
import { StatusBadge } from '@/features/shared/Badge';
import { Button } from '@/features/shared/Button';
import { navigate } from '@/features/shared/router';
import { EmptyState, ErrorState, Loading } from '@/features/shared/States';
import { card, inputStyle, mutedText, row, srOnly, stack, tableStyle } from '@/features/shared/styles';
import { ACTION_LABELS, availableActions, statusLabel } from '@/features/shared/workflow';


/**
 * 内容列表（P1-10）。
 *
 * 全状态齐全（AGENTS.md §6.4）：loading / empty / error / forbidden / success。
 * 行内动作按钮按「当前状态 + 角色」镜像服务端规则计算可见性，
 * 真正的拦截始终在服务端（AGENTS.md §4.1）。
 */

const TYPE_LABELS: Record<ContentType, string> = {
  PLACE: '地点',
  PERSON: '人物',
  EVENT: '事件',
  ARCHITECTURE: '建筑',
  TRADITION: '民俗传统',
  TOPIC: '专题',
  ROUTE: '路线',
};

/** 关键词过滤：后端 list 端点目前只支持 type/status/limit，关键词在前端过滤已加载结果。 */
export function filterByKeyword(
  rows: readonly AdminContentDto[],
  keyword: string,
): AdminContentDto[] {
  const needle = keyword.trim().toLowerCase();
  if (needle === '') {
    return [...rows];
  }
  return rows.filter((row) =>
    `${row.title} ${row.slug} ${row.summary ?? ''}`.toLowerCase().includes(needle),
  );
}

type LoadState = 'loading' | 'ready' | 'error';

export interface ContentListPageProps {
  user: SessionUser;
  onUnauthorized: () => void;
}

export function ContentListPage({ user, onUnauthorized }: ContentListPageProps) {
  const [rows, setRows] = useState<AdminContentDto[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorInfo, setErrorInfo] = useState<{ message: string; requestId: string; forbidden: boolean } | null>(
    null,
  );
  const [type, setType] = useState<'' | ContentType>('');
  const [status, setStatus] = useState<'' | ContentStatus>('');
  const [keyword, setKeyword] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorInfo(null);
    try {
      const data = await contentApi.list({
        ...(type === '' ? {} : { type }),
        ...(status === '' ? {} : { status }),
        limit: 50,
      });
      setRows(data);
      setLoadState('ready');
    } catch (cause) {
      if (isApiAuthError(cause)) {
        onUnauthorized();
        return;
      }
      if (isApiError(cause)) {
        setErrorInfo({
          message: cause.message,
          requestId: cause.requestId,
          forbidden: cause.status === 403,
        });
      } else {
        setErrorInfo({ message: '无法连接服务器，请检查 API 是否已启动', requestId: '-', forbidden: false });
      }
      setLoadState('error');
    }
  }, [type, status, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => filterByKeyword(rows, keyword), [rows, keyword]);

  async function runTransition(row: AdminContentDto, action: ContentAction): Promise<void> {
    setPendingId(row.id);
    try {
      await contentApi.transition(row.id, action);
      await load();
    } catch (cause) {
      setErrorInfo({
        message: isApiError(cause) ? cause.message : '状态流转失败，请重试',
        requestId: isApiError(cause) ? cause.requestId : '-',
        forbidden: isApiError(cause) && cause.status === 403,
      });
      setLoadState('error');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div style={stack}>
      <div style={row}>
        <h1 style={{ fontSize: '1.35rem', margin: 0 }}>内容列表</h1>
        <Button onClick={() => void load()}>刷新</Button>
        <Button variant="primary" onClick={() => navigate('/contents/new')}>
          新建草稿
        </Button>
      </div>
      <p style={mutedText}>
        已登录：{user.displayName}（{user.roles.join(' / ')}）· 审核与发布按钮按服务端状态机与角色规则显示。
      </p>

      <section aria-label="筛选条件" style={card}>
        <div style={row}>
          <label style={row} htmlFor="filter-type">
            类型
            <select
              id="filter-type"
              value={type}
              onChange={(event) => setType(event.target.value as '' | ContentType)}
              style={{ ...inputStyle, width: 'auto' }}
            >
              <option value="">全部</option>
              {CONTENT_TYPES.map((option) => (
                <option key={option} value={option}>
                  {TYPE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <label style={row} htmlFor="filter-status">
            状态
            <select
              id="filter-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as '' | ContentStatus)}
              style={{ ...inputStyle, width: 'auto' }}
            >
              <option value="">全部</option>
              {CONTENT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label style={row} htmlFor="filter-keyword">
            关键词
            <input
              id="filter-keyword"
              type="search"
              value={keyword}
              placeholder="标题 / slug / 摘要"
              onChange={(event) => setKeyword(event.target.value)}
              style={{ ...inputStyle, width: 'auto' }}
            />
          </label>
        </div>
      </section>

      {loadState === 'loading' ? <Loading label="正在加载内容列表…" /> : null}

      {loadState === 'error' && errorInfo !== null ? (
        <ErrorState
          title={errorInfo.forbidden ? '没有权限查看内容列表' : '内容列表加载失败'}
          message={errorInfo.message}
          requestId={errorInfo.requestId}
          forbidden={errorInfo.forbidden}
          onRetry={() => void load()}
        />
      ) : null}

      {loadState === 'ready' && visibleRows.length === 0 ? (
        <EmptyState
          title={keyword.trim() === '' ? '暂无内容' : '没有匹配的内容'}
          description={
            keyword.trim() === ''
              ? '数据库中还没有任何未归档的内容。点击右上角「新建草稿」开始撰写，或调整筛选条件。'
              : '关键词没有命中已加载的列表。服务端分页上限为 50 条，可清空关键词或改用类型 / 状态筛选。'
          }
          action={
            <div style={row}>
              {keyword.trim() === '' ? null : (
                <Button onClick={() => setKeyword('')}>清空关键词</Button>
              )}
              <Button variant="primary" onClick={() => navigate('/contents/new')}>
                新建草稿
              </Button>
            </div>
          }
        />
      ) : null}

      {loadState === 'ready' && visibleRows.length > 0 ? (
        <table style={tableStyle} aria-busy="false">
          <caption style={srOnly}>内容列表，共 {visibleRows.length} 条</caption>
          <thead>
            <tr>
              <th scope="col">标题</th>
              <th scope="col">类型</th>
              <th scope="col">状态</th>
              <th scope="col">版本</th>
              <th scope="col">更新时间</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row_) => {
              const actions = availableActions(row_.status, user.roles, {
                actorId: user.id,
                authorId: row_.createdById,
              });
              return (
                <tr key={row_.id}>
                  <th scope="row" style={{ fontWeight: 500 }}>
                    {row_.title}
                    <span style={{ ...mutedText, display: 'block' }}>
                      <code>{row_.slug}</code>
                    </span>
                  </th>
                  <td>{TYPE_LABELS[row_.type]}</td>
                  <td>
                    <StatusBadge status={row_.status} />
                  </td>
                  <td>{row_.version}</td>
                  <td>{formatDateTime(row_.updatedAt)}</td>
                  <td>
                    <div style={row}>
                      <Button onClick={() => navigate(`/contents/${encodeURIComponent(row_.id)}`)}>
                        编辑
                      </Button>
                      {actions
                        .filter((action) => action !== 'EDIT')
                        .map((action) => (
                          <Button
                            key={action}
                            busy={pendingId === row_.id}
                            onClick={() => void runTransition(row_, action)}
                            title={`${ACTION_LABELS[action]}（当前状态：${statusLabel(row_.status)}）`}
                          >
                            {ACTION_LABELS[action]}
                          </Button>
                        ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (input: number): string => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
