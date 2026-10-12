import { row } from './styles';

import type { CSSProperties, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'default' | 'danger';

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: ButtonVariant;
  /** 进行中：禁用 + `aria-busy`，避免重复提交。 */
  busy?: boolean;
  disabled?: boolean;
  /** 说明按钮为何不可用（禁用时给 screen reader 读的补充信息）。 */
  title?: string | undefined;
  /** 切换型按钮的选中状态（会渲染成 aria-pressed）。 */
  ariaPressed?: boolean | undefined;
  /**
   * 可访问名称。
   *
   * 列表里的重复操作（「上移」「移除」出现 N 次）**必须**提供：否则读屏用户
   * 只听到"上移，按钮"，不知道是哪一行。可见的短文字保持不变。
   */
  ariaLabel?: string | undefined;
}

function variantStyle(variant: ButtonVariant): CSSProperties {
  const base: CSSProperties = {
    padding: 'var(--app-space-xs) var(--app-space-sm)',
    borderRadius: '0.25rem',
    border: '1px solid var(--app-border)',
    background: 'var(--app-bg)',
    color: 'var(--app-fg)',
    font: 'inherit',
    cursor: 'pointer',
  };
  if (variant === 'primary') {
    return { ...base, borderColor: 'var(--app-accent)', color: 'var(--app-accent)' };
  }
  if (variant === 'danger') {
    return {
      ...base,
      borderColor: 'var(--app-warning-border)',
      background: 'var(--app-warning-bg)',
      color: 'var(--app-warning-fg)',
    };
  }
  return base;
}

/** 原生 `<button>` 包装：保证键盘可达与 `:focus-visible` 焦点环（globals.css 已定义）。 */
export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'default',
  busy = false,
  disabled = false,
  title,
  ariaPressed,
  ariaLabel,
}: ButtonProps) {
  const isDisabled = disabled || busy;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={busy ? true : undefined}
      {...(ariaPressed === undefined ? {} : { 'aria-pressed': ariaPressed })}
      {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
      title={title}
      style={{
        ...variantStyle(variant),
        ...(isDisabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
      }}
    >
      {children}
    </button>
  );
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return <div style={{ ...row, marginTop: 'var(--app-space-sm)' }}>{children}</div>;
}
