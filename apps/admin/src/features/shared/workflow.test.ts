import { describe, expect, it } from 'vitest';

import {
  ACTION_LABELS,
  ALLOWED_ACTIONS_BY_STATUS,
  availableActions,
  explainUnavailableAction,
  isReviewAction,
  isValidSlug,
  roleCanPerform,
  statusLabel,
  summaryLengthHint,
  titleLengthHint,
  validateTransition,
  actionRequiresReason,
  SUMMARY_MAX,
  TITLE_MAX,
} from './workflow';

import type { ContentAction, ContentStatus, UserRole } from '@/api/types';

/**
 * 前端状态机镜像单测。
 *
 * 这些表是服务端 `content-state-machine.ts` 的副本。测试锁定它与
 * 技术方案 §6 的规则一致 —— 前端镜像漂移会让按钮显示与实际拦截不符，
 * 是用户可见的 bug（按钮能点但服务端拒绝，或反过来）。
 */
describe('workflow: allowed actions by status', () => {
  it('DRAFT allows edit / submit / archive', () => {
    expect([...ALLOWED_ACTIONS_BY_STATUS.DRAFT].sort()).toEqual(
      ['ARCHIVE', 'EDIT', 'SUBMIT'].sort(),
    );
  });

  it('IN_REVIEW allows approve / reject / archive', () => {
    expect([...ALLOWED_ACTIONS_BY_STATUS.IN_REVIEW].sort()).toEqual(
      ['APPROVE', 'ARCHIVE', 'REJECT'].sort(),
    );
  });

  it('PUBLISHED only allows archive', () => {
    expect(ALLOWED_ACTIONS_BY_STATUS.PUBLISHED).toEqual(['ARCHIVE']);
  });

  it('ARCHIVED only allows restore', () => {
    expect(ALLOWED_ACTIONS_BY_STATUS.ARCHIVED).toEqual(['RESTORE']);
  });

  it('every status has a label', () => {
    const statuses: ContentStatus[] = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED'];
    for (const status of statuses) {
      expect(statusLabel(status)).not.toBe('');
    }
  });

  it('every action has a label', () => {
    for (const action of Object.keys(ACTION_LABELS) as ContentAction[]) {
      expect(ACTION_LABELS[action]).not.toBe('');
    }
  });
});

describe('workflow: role permissions (AGENTS.md §4.2)', () => {
  it('EDITOR may edit and submit but never approve/reject/publish', () => {
    const editor: UserRole[] = ['EDITOR'];
    expect(roleCanPerform(editor, 'EDIT')).toBe(true);
    expect(roleCanPerform(editor, 'SUBMIT')).toBe(true);
    expect(roleCanPerform(editor, 'APPROVE')).toBe(false);
    expect(roleCanPerform(editor, 'REJECT')).toBe(false);
    expect(roleCanPerform(editor, 'PUBLISH')).toBe(false);
  });

  it('REVIEWER may approve and publish', () => {
    const reviewer: UserRole[] = ['REVIEWER'];
    expect(roleCanPerform(reviewer, 'APPROVE')).toBe(true);
    expect(roleCanPerform(reviewer, 'PUBLISH')).toBe(true);
  });

  it('ADMIN may do everything', () => {
    const admin: UserRole[] = ['ADMIN'];
    for (const action of Object.keys(ACTION_LABELS) as ContentAction[]) {
      expect(roleCanPerform(admin, action)).toBe(true);
    }
  });

  it('VIEWER may not edit', () => {
    expect(roleCanPerform(['VIEWER'], 'EDIT')).toBe(false);
  });

  it('multi-role user gets the union', () => {
    expect(roleCanPerform(['EDITOR', 'REVIEWER'], 'APPROVE')).toBe(true);
  });
});

describe('workflow: availableActions', () => {
  it('hides approve/reject/publish for an editor on IN_REVIEW', () => {
    const actions = availableActions('IN_REVIEW', ['EDITOR'], {
      actorId: 'editor-1',
      authorId: 'someone-else',
    });
    expect(actions).not.toContain('APPROVE');
    expect(actions).not.toContain('REJECT');
  });

  it('shows approve/reject for a reviewer on IN_REVIEW', () => {
    const actions = availableActions('IN_REVIEW', ['REVIEWER'], {
      actorId: 'reviewer-1',
      authorId: 'someone-else',
    });
    expect(actions).toContain('APPROVE');
    expect(actions).toContain('REJECT');
  });

  it('hides review actions when reviewer is the author (self-review ban)', () => {
    const actions = availableActions('IN_REVIEW', ['REVIEWER'], {
      actorId: 'same',
      authorId: 'same',
    });
    expect(actions).not.toContain('APPROVE');
    expect(actions).not.toContain('REJECT');
  });

  it('does not apply self-review ban to non-review actions', () => {
    const actions = availableActions('DRAFT', ['EDITOR'], {
      actorId: 'same',
      authorId: 'same',
    });
    expect(actions).toContain('SUBMIT');
  });

  it('ARCHIVED + EDITOR yields nothing', () => {
    const actions = availableActions('ARCHIVED', ['EDITOR'], {
      actorId: 'e1',
      authorId: 'e1',
    });
    expect(actions).toEqual([]);
  });
});

describe('workflow: explainUnavailableAction', () => {
  it('explains role insufficiency', () => {
    const msg = explainUnavailableAction('IN_REVIEW', ['EDITOR'], 'APPROVE', {
      actorId: 'e1',
      authorId: 'x',
    });
    expect(msg).toContain('无权');
  });

  it('explains the self-review ban', () => {
    const msg = explainUnavailableAction('IN_REVIEW', ['REVIEWER'], 'APPROVE', {
      actorId: 'same',
      authorId: 'same',
    });
    expect(msg).toContain('自己创建的内容');
  });

  it('explains state-level rejection', () => {
    const msg = explainUnavailableAction('DRAFT', ['ADMIN'], 'PUBLISH', {
      actorId: 'a1',
      authorId: 'a1',
    });
    expect(msg).toContain('不允许');
  });

  it('returns null when the action is available', () => {
    expect(explainUnavailableAction('DRAFT', ['EDITOR'], 'SUBMIT')).toBeNull();
  });
});

describe('workflow: reject requires a reason', () => {
  it('flags REJECT as needing a reason, others not', () => {
    expect(actionRequiresReason('REJECT')).toBe(true);
    expect(actionRequiresReason('APPROVE')).toBe(false);
    expect(actionRequiresReason('PUBLISH')).toBe(false);
  });

  it('rejects empty / whitespace-only reasons', () => {
    expect(validateTransition('REJECT', '')).toContain('退回必须填写理由');
    expect(validateTransition('REJECT', '   ')).toContain('退回必须填写理由');
  });

  it('rejects over-long reasons', () => {
    expect(validateTransition('REJECT', 'a'.repeat(2001))).toContain('2000');
  });

  it('accepts a normal reason', () => {
    expect(validateTransition('REJECT', '来源不足，请补充页码')).toBeNull();
  });

  it('never requires a reason for non-REJECT actions', () => {
    expect(validateTransition('APPROVE', '')).toBeNull();
    expect(validateTransition('PUBLISH', '')).toBeNull();
  });
});

describe('workflow: review action classification', () => {
  it('marks APPROVE / REJECT / PUBLISH as review actions', () => {
    expect(isReviewAction('APPROVE')).toBe(true);
    expect(isReviewAction('REJECT')).toBe(true);
    expect(isReviewAction('PUBLISH')).toBe(true);
  });

  it('does not mark EDIT / SUBMIT / ARCHIVE / RESTORE as review actions', () => {
    expect(isReviewAction('EDIT')).toBe(false);
    expect(isReviewAction('SUBMIT')).toBe(false);
    expect(isReviewAction('ARCHIVE')).toBe(false);
    expect(isReviewAction('RESTORE')).toBe(false);
  });
});

describe('workflow: form rules mirror the server schema', () => {
  it('slug pattern matches the server rule', () => {
    expect(isValidSlug('qinhuai-fengguangdai')).toBe(true);
    expect(isValidSlug('a-b-c')).toBe(true);
    expect(isValidSlug('a--b')).toBe(false);
    expect(isValidSlug('Bad-Slug')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });

  it('title length hint: empty is error, long is warn/error, normal is ok', () => {
    expect(titleLengthHint('')).toBe('error');
    expect(titleLengthHint('   ')).toBe('error');
    expect(titleLengthHint('正常标题')).toBe('ok');
    // 超过 80% 上限即 warn（服务端在 200 才拒绝，这里提前提示）
    expect(titleLengthHint('a'.repeat(Math.floor(TITLE_MAX * 0.9)))).toBe('warn');
    expect(titleLengthHint('a'.repeat(Math.floor(TITLE_MAX * 0.5)))).toBe('ok');
    expect(titleLengthHint('a'.repeat(TITLE_MAX + 1))).toBe('error');
  });

  it('summary length hint', () => {
    expect(summaryLengthHint('')).toBe('ok');
    expect(summaryLengthHint('a'.repeat(Math.floor(SUMMARY_MAX * 0.9)))).toBe('warn');
    expect(summaryLengthHint('a'.repeat(SUMMARY_MAX + 1))).toBe('error');
  });
});
