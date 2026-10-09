import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/features/shared/Button';
import { mutedText, row } from '@/features/shared/styles';

/**
 * 自动保存（P1-10）。
 *
 * 规则：
 * - 内容变化后 debounce ≥ 1500ms 才发 PATCH，避免每敲一个字打一次服务端；
 * - 每次保存都带当前 version 作为 `If-Match`，由服务端做乐观锁裁决；
 * - 新保存请求发出前 abort 上一次未完成的请求（并发保护）；
 * - 有未保存改动时 `beforeunload` 提示，避免误关标签页丢稿。
 *
 * 控制器写成不依赖 React 的纯对象，行为可用 `vi.useFakeTimers()` 单测。
 */

export const AUTOSAVE_DEBOUNCE_MS = 1500;

export type AutosavePhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface AutosaveState {
  phase: AutosavePhase;
  /** 最近一次成功保存的时间戳（ms）；null 表示尚未保存过。 */
  savedAt: number | null;
  errorMessage: string | null;
}

export interface AutosaveControllerOptions {
  /** 真正执行保存的回调；应带上 If-Match 并在 409 时抛 CONTENT_VERSION_CONFLICT。 */
  save: () => Promise<void>;
  delayMs?: number;
  onStateChange?: (state: AutosaveState) => void;
  onError?: (error: unknown) => void;
  onConflict?: (error: unknown) => void;
}

export interface AutosaveController {
  /** 标记有改动并重置 debounce 计时。 */
  schedule: () => void;
  /** 立即执行待保存内容（组件卸载 / 手动保存）。 */
  flush: () => Promise<void>;
  /** 取消计时与在途请求，不再触发任何保存。 */
  cancel: () => void;
  /** 是否还有未落库的改动。 */
  hasUnsavedChanges: () => boolean;
  getState: () => AutosaveState;
}

export function createAutosaveController(options: AutosaveControllerOptions): AutosaveController {
  const delayMs = options.delayMs ?? AUTOSAVE_DEBOUNCE_MS;
  let state: AutosaveState = { phase: 'idle', savedAt: null, errorMessage: null };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: AbortController | null = null;
  let dirty = false;

  function setState(next: AutosaveState): void {
    state = next;
    options.onStateChange?.(next);
  }

  async function run(): Promise<void> {
    // 并发保护：先掐掉上一次未完成的请求（服务端版本号也会打架）。
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    setState({ ...state, phase: 'saving', errorMessage: null });
    try {
      await options.save();
      if (controller.signal.aborted) {
        return;
      }
      dirty = false;
      setState({ phase: 'saved', savedAt: Date.now(), errorMessage: null });
    } catch (error) {
      if (controller.signal.aborted) {
        // 被后一次保存取代：不算失败，保持"待保存"。
        return;
      }
      setState({ ...state, phase: 'error', errorMessage: describeSaveError(error) });
      options.onError?.(error);
    } finally {
      if (inFlight === controller) {
        inFlight = null;
      }
    }
  }

  return {
    schedule(): void {
      dirty = true;
      if (state.phase !== 'saving') {
        setState({ ...state, phase: 'dirty', errorMessage: null });
      }
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delayMs);
    },
    async flush(): Promise<void> {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (!dirty && state.phase !== 'error') {
        return;
      }
      await run();
    },
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      inFlight?.abort();
      inFlight = null;
      dirty = false;
      setState({ phase: 'idle', savedAt: state.savedAt, errorMessage: null });
    },
    hasUnsavedChanges(): boolean {
      return dirty;
    },
    getState(): AutosaveState {
      return state;
    },
  };
}

/** 保存失败原因：优先用服务端 message，其次用错误自身文案。 */
export function describeSaveError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message !== '') {
      return message;
    }
  }
  if (typeof error === 'string' && error !== '') {
    return error;
  }
  return '自动保存失败';
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export interface AutosaveStatusProps {
  state: AutosaveState;
  onRetry: () => void;
  busy?: boolean;
}

function formatTime(timestamp: number | null): string {
  if (timestamp === null) {
    return '';
  }
  const date = new Date(timestamp);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function describePhase(state: AutosaveState): string {
  switch (state.phase) {
    case 'idle':
      return '尚无改动';
    case 'dirty':
      return `有未保存改动，将在 ${AUTOSAVE_DEBOUNCE_MS / 1000} 秒后自动保存`;
    case 'saving':
      return '正在保存…';
    case 'saved':
      return `已保存 ${formatTime(state.savedAt)}`;
    case 'error':
      return state.errorMessage ?? '自动保存失败';
    default:
      return '';
  }
}

/** 状态条：saving 用 aria-live 播报，其余状态直接显示文字。 */
export function AutosaveStatus({ state, onRetry, busy = false }: AutosaveStatusProps) {
  return (
    <div style={row}>
      <span role="status" aria-live="polite" style={{ ...mutedText, margin: 0 }}>
        {describePhase(state)}
      </span>
      {state.phase === 'error' ? (
        <Button busy={busy} onClick={onRetry}>
          重试保存
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 有未保存改动时注册 `beforeunload` 提示。
 * 返回值给调用方：是否处于"有未保存改动"状态（也用于列表页离开确认）。
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean): void {
  const handler = useCallback(
    (event: BeforeUnloadEvent): string => {
      event.preventDefault();
      // 部分浏览器需要设置 returnValue 才会弹出确认框。
      event.returnValue = '';
      return '';
    },
    [],
  );
  useEffect(() => {
    if (!hasUnsavedChanges) {
      return undefined;
    }
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [hasUnsavedChanges, handler]);
}

/** 把控制器接到 React 上：controller 惰性创建一次，状态通过 onStateChange 回流。 */
export function useAutosaveController(options: {
  save: () => Promise<void>;
  delayMs?: number;
  onError?: (error: unknown) => void;
}): { controller: AutosaveController; state: AutosaveState } {
  const [state, setState] = useState<AutosaveState>({
    phase: 'idle',
    savedAt: null,
    errorMessage: null,
  });

  // 用 ref 承接最新回调，避免因为回调身份变化重建控制器（会丢掉待保存计时）。
  const saveRef = useRef(options.save);
  saveRef.current = options.save;
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const controllerRef = useRef<AutosaveController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createAutosaveController({
      save: () => saveRef.current(),
      onStateChange: setState,
      onError: (error) => onErrorRef.current?.(error),
      ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
    });
  }
  const controller = controllerRef.current;

  // 卸载时取消计时与在途请求（beforeunload 提示由 useUnsavedChangesWarning 负责）。
  useEffect(() => () => controller.cancel(), [controller]);

  return { controller, state };
}
