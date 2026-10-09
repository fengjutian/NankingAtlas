import { useId } from 'react';

import { mutedText, srOnly, stack } from './styles';

import type { ReactNode } from 'react';

export interface FieldControlProps {
  id: string;
  /** 指向 hint / error 的 id；两者都没有时为 undefined。 */
  describedBy: string | undefined;
  invalid: boolean;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  /** render prop：保证 label / aria-describedby / aria-invalid 一定被正确接线。 */
  children: (props: FieldControlProps) => ReactNode;
}

/**
 * 表单字段容器：`<label for>` + 提示 + 错误 + `aria-invalid`。
 * AGENTS.md §6.4：公共组件必须有语义 HTML、键盘支持、错误/加载/空状态。
 */
export function Field({ label, hint, error, required = false, children }: FieldProps) {
  const id = useId();
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined || error === null || error === '' ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId]
    .filter((value): value is string => value !== undefined)
    .join(' ');
  const invalid = errorId !== undefined;

  return (
    <div style={stack}>
      <label htmlFor={id} style={{ fontSize: '0.9rem', fontWeight: 600 }}>
        {label}
        {required ? (
          <span aria-hidden="true" style={{ color: 'var(--app-warning-fg)' }}>
            {' '}
            *
          </span>
        ) : null}
        {required ? <span style={srOnly}>（必填）</span> : null}
      </label>
      {hint === undefined ? null : (
        <p id={hintId} style={mutedText}>
          {hint}
        </p>
      )}
      {children({ id, describedBy: describedBy === '' ? undefined : describedBy, invalid })}
      {invalid ? (
        <p
          id={errorId}
          role="alert"
          style={{ color: 'var(--app-warning-fg)', fontSize: '0.85rem', margin: 0 }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
