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
  title?: string;
  /** 切换型按钮的选中状态（会渲染成 aria-pressed）。 */
  ariaPressed?: boolean;
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
}: ButtonProps) {
  const isDisabled = disabled || busy;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={busy ? true : undefined}
      {...(ariaPressed === undefined ? {} : { 'aria-pressed': ariaPressed })}
      title={title}
      style={{ ...variantStyle(variant), ...(isDisabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
    >
      {children}
    </button>
  );
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return <div style={{ ...row, marginTop: 'var(--app-space-sm)' }}>{children}</div>;
}
