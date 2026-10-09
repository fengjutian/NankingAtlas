import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTOSAVE_DEBOUNCE_MS,
  createAutosaveController,
  describeSaveError,
  type AutosaveController,
} from './AutosaveStatus';

/**
 * 自动保存控制器单测（无 React，纯控制器 + fake timers）。
 *
 * 覆盖最容易出错的三个点：
 *   1. debounce 时序 —— 连续输入只发一次请求
 *   2. 并发保护 —— 新请求 abort 上一次在途请求
 *   3. 失败重试 —— 错误态能再次 schedule
 */
describe('autosave controller', () => {
  let controller: AutosaveController | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    controller?.cancel();
    controller = undefined;
    vi.useRealTimers();
  });

  function makeController(save: (signal: AbortSignal) => Promise<void>): AutosaveController {
    controller = createAutosaveController({ save, delayMs: AUTOSAVE_DEBOUNCE_MS });
    return controller;
  }

  it('does not save before the debounce window elapses', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = makeController(save);

    c.schedule();
    expect(c.getState().phase).toBe('dirty');
    expect(c.hasUnsavedChanges()).toBe(true);

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid edits into a single save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = makeController(save);

    // 模拟连续输入：每次都重置计时
    for (let i = 0; i < 10; i += 1) {
      c.schedule();
      await vi.advanceTimersByTimeAsync(200);
    }
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reaches the saved phase with a timestamp', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = makeController(save);

    c.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(c.getState().phase).toBe('saved');
    expect(c.getState().savedAt).not.toBeNull();
    expect(c.hasUnsavedChanges()).toBe(false);
  });

  it('enters the error phase and keeps changes unsaved on failure', async () => {
    const save = vi.fn().mockRejectedValue(new Error('boom'));
    const c = makeController(save);

    c.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(c.getState().phase).toBe('error');
    expect(c.getState().errorMessage).toContain('boom');
    // 保存失败后仍是"有未保存改动"，用户才能重试
    expect(c.hasUnsavedChanges()).toBe(true);
  });

  it('can retry after a failure', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    const c = makeController(save);

    c.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(c.getState().phase).toBe('error');

    c.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(c.getState().phase).toBe('saved');
  });

  it('aborts the in-flight request when a new save is scheduled', async () => {
    const signals: AbortSignal[] = [];
    // 第一次保存挂起不 resolve，用来观察 abort
    let resolveFirst: (() => void) | undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(
        (signal: AbortSignal) =>
          new Promise<void>((resolve) => {
            signals.push(signal);
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);

    const c = makeController(save);

    c.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(signals[0]?.aborted).toBe(false);

    // 第一次还没完成时来了新改动 → 必须 abort 上一次
    c.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(signals[0]?.aborted).toBe(true);

    resolveFirst?.();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('cancel() stops pending timers so no save fires', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = makeController(save);

    c.schedule();
    c.cancel();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 2);

    expect(save).not.toHaveBeenCalled();
  });

  it('flush() saves immediately without waiting for the timer', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = makeController(save);

    c.schedule();
    await c.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(c.getState().phase).toBe('saved');
  });
});

describe('describeSaveError', () => {
  it('uses the error message when present', () => {
    expect(describeSaveError(new Error('网络中断'))).toBe('网络中断');
  });

  it('falls back to a generic message for values without one', () => {
    // 非 Error 值：实现选择原样回显（调试信息比通用文案更有用）
    expect(describeSaveError('plain string')).toBe('plain string');
    expect(describeSaveError(null)).toBe('自动保存失败');
    expect(describeSaveError({})).toBe('自动保存失败');
  });

  it('falls back when the message is empty', () => {
    expect(describeSaveError(new Error(''))).toBe('自动保存失败');
  });
});
