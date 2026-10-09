import { useEffect, useRef, useState } from 'react';

import type { AdminContentDto } from '@/api/types';

import { Button, ButtonRow } from '@/features/shared/Button';
import {
  dangerBanner,
  dialogBackdrop,
  mutedText,
  stack,
  tableStyle,
} from '@/features/shared/styles';

/**
 * 版本冲突对话框（P1-10）。
 *
 * 触发：保存时服务端返回 409 + `CONTENT_VERSION_CONFLICT`，
 * 错误 details 里带 `{ currentVersion, expectedVersion }`
 * （apps/api global-exception.filter.ts）。
 *
 * 三个出口都要明确，不能替用户做决定：
 * 1. 重新加载服务端版本 —— 丢弃本地未保存改动；
 * 2. 查看差异 —— 并排展示字段级差异，用户自己判断；
 * 3. 覆盖保存 —— 用本地内容 + 服务端最新 version 重试（服务端仍会重新校验）。
 */

export interface ConflictVersionInfo {
  /** 本地编辑所基于的 version（If-Match 用的那个）。 */
  localVersion: number;
  /** 服务端当前 version。 */
  serverVersion: number | null;
  serverUpdatedAt: string | null;
}

export interface FieldDiff {
  field: string;
  label: string;
  local: string;
  server: string;
}

/** 从 409 错误的 details 里解析版本信息；解析不到就退化成 null（不编造数字）。 */
export function readConflictVersions(
  details: Record<string, unknown> | undefined,
  fallbackLocalVersion: number,
): ConflictVersionInfo {
  const current = details?.currentVersion;
  const expected = details?.expectedVersion;
  return {
    localVersion: typeof expected === 'number' ? expected : fallbackLocalVersion,
    serverVersion: typeof current === 'number' ? current : null,
    serverUpdatedAt: null,
  };
}

function preview(value: unknown): string {
  if (value === null || value === undefined) {
    return '（空）';
  }
  if (typeof value === 'string') {
    return value.trim() === '' ? '（空）' : value;
  }
  return JSON.stringify(value, null, 2);
}

/** 字段级差异；只比对用户在 UI 里能编辑的字段。 */
export function diffContentFields(
  local: Pick<AdminContentDto, 'title' | 'subtitle' | 'summary' | 'slug' | 'body'>,
  server: Pick<AdminContentDto, 'title' | 'subtitle' | 'summary' | 'slug' | 'body'>,
): FieldDiff[] {
  const fields: readonly {
    key: 'title' | 'subtitle' | 'summary' | 'slug' | 'body';
    label: string;
  }[] = [
    { key: 'title', label: '标题' },
    { key: 'subtitle', label: '副标题' },
    { key: 'summary', label: '摘要' },
    { key: 'slug', label: 'Slug' },
    { key: 'body', label: '正文' },
  ];
  return fields
    .filter(({ key }) => preview(local[key]) !== preview(server[key]))
    .map(({ key, label }) => ({
      field: key,
      label,
      local: preview(local[key]),
      server: preview(server[key]),
    }));
}

export function isNewerServerVersion(info: ConflictVersionInfo): boolean {
  return info.serverVersion !== null && info.serverVersion > info.localVersion;
}

export interface ConflictDialogProps {
  open: boolean;
  info: ConflictVersionInfo;
  local: Pick<AdminContentDto, 'title' | 'subtitle' | 'summary' | 'slug' | 'body'>;
  server: Pick<AdminContentDto, 'title' | 'subtitle' | 'summary' | 'slug' | 'body'>;
  onReloadServer: () => void;
  onOverwrite: () => void;
  onClose: () => void;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function ConflictDialog({
  open,
  info,
  local,
  server,
  onReloadServer,
  onOverwrite,
  onClose,
}: ConflictDialogProps) {
  const [showDiff, setShowDiff] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const diffs = diffContentFields(local, server);

  // 打开时把焦点移进对话框；Esc 关闭；Tab 在对话框内循环（焦点陷阱）。
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const node = panelRef.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || node === null) {
        return;
      }
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      const head = items[0];
      const tail = items[items.length - 1];
      if (head === undefined || tail === undefined) {
        return;
      }
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div style={dialogBackdrop}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-dialog-title"
        aria-describedby="conflict-dialog-desc"
        style={{
          ...dangerBanner,
          background: 'var(--app-bg)',
          maxWidth: '48rem',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <div style={stack}>
          <h2 id="conflict-dialog-title" style={{ fontSize: '1.1rem', margin: 0 }}>
            保存冲突：内容已被他人修改
          </h2>
          <p id="conflict-dialog-desc" style={mutedText}>
            服务端拒绝了这次保存（HTTP 409
            CONTENT_VERSION_CONFLICT）。本地改动尚未丢失，请选择处理方式。
          </p>
          <dl style={{ ...stack, margin: 0 }}>
            <div>
              <dt style={{ fontWeight: 600 }}>本地基于的版本</dt>
              <dd style={{ margin: 0 }}>
                <code>W/&quot;{info.localVersion}&quot;</code>
              </dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600 }}>服务端当前版本</dt>
              <dd style={{ margin: 0 }}>
                {info.serverVersion === null ? (
                  <span>未知（服务端未返回 currentVersion）</span>
                ) : (
                  <code>W/&quot;{info.serverVersion}&quot;</code>
                )}
              </dd>
            </div>
            {info.serverUpdatedAt === null ? null : (
              <div>
                <dt style={{ fontWeight: 600 }}>服务端最后更新</dt>
                <dd style={{ margin: 0 }}>{info.serverUpdatedAt}</dd>
              </div>
            )}
          </dl>

          {showDiff ? (
            <div>
              <h3 style={{ fontSize: '0.95rem', margin: 0 }}>字段级差异（{diffs.length} 处）</h3>
              {diffs.length === 0 ? (
                <p style={mutedText}>可编辑字段没有差异，差异可能出现在正文之外的扩展字段上。</p>
              ) : (
                <table style={tableStyle}>
                  <caption style={srOnly}>本地版本与服务端版本的字段差异</caption>
                  <thead>
                    <tr>
                      <th scope="col">字段</th>
                      <th scope="col">本地（未保存）</th>
                      <th scope="col">服务端</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffs.map((diff) => (
                      <tr key={diff.field}>
                        <th scope="row">{diff.label}</th>
                        <td>
                          <pre style={preStyle}>{diff.local}</pre>
                        </td>
                        <td>
                          <pre style={preStyle}>{diff.server}</pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          <ButtonRow>
            <Button variant="primary" onClick={onReloadServer}>
              重新加载服务端版本（丢弃本地改动）
            </Button>
            <Button onClick={() => setShowDiff((prev) => !prev)} aria-pressed={showDiff}>
              {showDiff ? '收起差异' : '查看差异'}
            </Button>
            <Button variant="danger" onClick={onOverwrite}>
              覆盖保存（本地内容 + 服务端最新版本）
            </Button>
            <Button onClick={onClose}>稍后处理</Button>
          </ButtonRow>
          <p style={mutedText}>
            覆盖保存不会跳过任何发布校验：服务端仍会以最新版本号重放一次乐观锁，并重新执行来源、版权与地理核验。
          </p>
        </div>
      </div>
    </div>
  );
}

const srOnly = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

const preStyle = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontSize: '0.8rem',
} as const;
