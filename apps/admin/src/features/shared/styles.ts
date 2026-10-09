import type { CSSProperties } from 'react';

/**
 * 共享内联样式。
 *
 * 为什么是内联对象而不是新增 CSS 文件：
 * - `src/styles/globals.css` 不在本任务的文件所有权内，不能改；
 * - AGENTS.md §6.5 要求不新增依赖（不装 CSS-in-JS 库）。
 * 所以这里集中收敛少量内联样式对象，颜色/间距一律引用 `--app-*` 变量，
 * 保证与 shell 保持同一套 design token。
 */

export const page: CSSProperties = {
  maxWidth: 'var(--app-max-content)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--app-space-md)',
};

export const card: CSSProperties = {
  border: '1px solid var(--app-border)',
  borderRadius: '0.25rem',
  padding: 'var(--app-space-md)',
  background: 'var(--app-bg)',
};

export const stack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--app-space-sm)',
};

export const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--app-space-sm)',
};

export const mutedText: CSSProperties = {
  color: 'var(--app-muted)',
  fontSize: '0.85rem',
  margin: 0,
};

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: 'var(--app-space-xs) var(--app-space-sm)',
  border: '1px solid var(--app-border)',
  borderRadius: '0.25rem',
  background: 'var(--app-bg)',
  color: 'var(--app-fg)',
  font: 'inherit',
};

export const dangerBanner: CSSProperties = {
  border: '1px solid var(--app-warning-border)',
  background: 'var(--app-warning-bg)',
  color: 'var(--app-warning-fg)',
  padding: 'var(--app-space-sm)',
  borderRadius: '0.25rem',
};

export const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9rem',
};

export const srOnly: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export const dialogBackdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--app-space-md)',
  zIndex: 50,
};
