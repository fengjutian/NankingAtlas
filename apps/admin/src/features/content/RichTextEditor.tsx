import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { buildExtensions, buildToolbar } from './tiptapExtensions';

import type { Editor } from '@tiptap/core';

/**
 * 正文富文本编辑器（FD-003）。
 *
 * 约束（AGENTS.md §3.1 / §4.5 / §6.4）：
 * - 输出的文档必须能通过 `@nanking-atlas/validation` 的 `parseTiptapDocument`；
 *   编辑器扩展被收敛到与 validation 白名单一致（见 tiptapExtensions.ts）
 * - 保存失败时**不丢本地草稿**：内容变更立即回传父级，由自动保存负责落库
 * - 工具栏按钮有可读名称与 aria-pressed，纯键盘可操作
 * - 不使用 `dangerouslySetInnerHTML`
 */

export interface RichTextEditorProps {
  /** Tiptap document JSON 的字符串形式（与现有 draft.bodyJson 同一格式）。 */
  value: string;
  onChange: (nextJson: string) => void;
  disabled?: boolean;
  /** 文档是否合法；非法时展示错误并禁止依赖它的保存按钮。 */
  invalidReason?: string | null;
}

export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  invalidReason = null,
}: RichTextEditorProps) {
  // 用 ref 记住最新的回调，避免因父组件重渲染而重建编辑器：
  // 重建会丢失撤销历史、光标位置，并可能与自动保存产生额外一轮 onChange。
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo(() => buildExtensions(), []);

  const editor = useEditor({
    extensions,
    content: safeParse(value),
    editable: !disabled,
    // 不自动聚焦：进入编辑页不该抢走键盘焦点。
    autofocus: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'nla-editor-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': '正文内容',
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChangeRef.current(JSON.stringify(instance.getJSON()));
    },
  });

  // 外部内容变化（如载入内容、冲突后重载）时同步进编辑器。
  //
  // 比较必须**先归一化**：`toDraft` 载入时用的是 `JSON.stringify(body, null, 2)`
  // （缩进 2），而编辑器产出的是紧凑 JSON。直接比字符串会把纯格式差异
  // 当成内容变化，进而触发一次 setContent —— 那会**清空撤销历史**，
  // 用户按 Ctrl+Z 发现"我刚才输的字没了"。
  const lastSyncedRef = useRef<string>(normalizeJson(value));
  useEffect(() => {
    if (editor === null) {
      return;
    }
    const incoming = normalizeJson(value);
    if (incoming === lastSyncedRef.current) {
      return;
    }
    lastSyncedRef.current = incoming;
    if (JSON.stringify(editor.getJSON()) !== incoming) {
      editor.commands.setContent(safeParse(value), { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  // 卸载时销毁，释放 ProseMirror 的 DOM 观察器。
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (editor === null) {
    return <div aria-busy="true">正在加载编辑器…</div>;
  }

  return (
    <div style={{ ...wrapper }}>
      <Toolbar editor={editor} disabled={disabled} />
      <EditorContent editor={editor} className="nla-editor-surface" />
      <div style={statusRow}>
        {invalidReason === null ? (
          <span style={mutedText}>正文结构已通过白名单校验</span>
        ) : (
          <span role="alert" style={errorText}>
            {invalidReason}
          </span>
        )}
        <span style={mutedText}>支持：段落、H2/H3、引用、列表、代码块、链接、图片、分隔线</span>
      </div>
    </div>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const actions = useMemo(() => buildToolbar(), []);

  /**
   * 用 React state 跟随编辑器事务，而不是 dispatch 空 transaction 逼自己重渲染
   * ——空 transaction 会进 undo 历史，编辑按一次 Ctrl+Z 就回到"点工具栏前"的状态，
   * 而且没有任何东西真的变了。用户会认为编辑器坏了。
   */
  const [, setTick] = useState(0);
  useEffect(() => {
    const rerender = (): void => {
      setTick((tick) => tick + 1);
    };
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);

  return (
    <div role="toolbar" aria-label="正文格式工具栏" style={toolbar}>
      {actions.map((action) => {
        const active = action.isActive(editor);
        return (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            aria-label={action.ariaLabel}
            aria-pressed={active}
            title={action.ariaLabel}
            onClick={() => {
              action.run(editor);
            }}
            style={{
              ...toolbarButton,
              ...(active ? toolbarButtonActive : {}),
              ...(disabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 归一化 JSON：解析后重新序列化，去掉缩进差异。
 *
 * 解析失败时退回 trim 后的原串 —— 那已经是"内容确实不对"，
 * 与其在这里替换成空串（掩盖问题），不如让后面的同步逻辑照常比较。
 */
function normalizeJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value.trim();
  }
}

/**
 * 把外部字符串解析成 Tiptap content。
 *
 * 刻意**不**因为解析失败就抛错：内容来自数据库，可能带着旧版本编辑器写入的
 * 或已被收紧白名单判为非法的结构。此时应当让编辑器以空文档打开、把问题暴露在
 * 校验提示里，而不是让整个编辑页白屏。
 */
function safeParse(value: string): object {
  try {
    const parsed: unknown = JSON.parse(value);
    const type = (parsed as { type?: unknown }).type;
    if (typeof parsed === 'object' && parsed !== null && type === 'doc') {
      return parsed;
    }
  } catch {
    // 落到下面的空文档
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

const mutedText: React.CSSProperties = {
  color: 'var(--app-muted)',
  fontSize: '0.8rem',
  margin: 0,
};

const errorText: React.CSSProperties = {
  color: 'var(--app-warning-fg)',
  fontSize: '0.8rem',
  margin: 0,
};

const wrapper: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--app-space-xs)',
  border: '1px solid var(--app-border)',
  borderRadius: '0.25rem',
  padding: 'var(--app-space-sm)',
  background: 'var(--app-bg)',
};

const toolbar: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.25rem',
  paddingBottom: 'var(--app-space-xs)',
  borderBottom: '1px solid var(--app-border)',
};

const toolbarButton: React.CSSProperties = {
  minWidth: '2rem',
  padding: '0.15rem 0.4rem',
  border: '1px solid var(--app-border)',
  borderRadius: '0.2rem',
  background: 'var(--app-bg)',
  color: 'var(--app-fg)',
  font: 'inherit',
  cursor: 'pointer',
};

const toolbarButtonActive: React.CSSProperties = {
  borderColor: 'var(--app-accent)',
  color: 'var(--app-accent)',
};

const statusRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--app-space-sm)',
  justifyContent: 'space-between',
  paddingTop: 'var(--app-space-xs)',
};
