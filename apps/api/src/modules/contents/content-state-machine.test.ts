import { describe, expect, it } from 'vitest';

import {
  allowedActions,
  checkPublicationReadiness,
  decideTransition,
  isRelationType,
  roleCanPerform,
  type TransitionRequest,
} from './content-state-machine.js';

/**
 * 内容状态机与发布前校验单测（技术方案 §6 / §5.3）。
 */
describe('content state machine', () => {
  const base: TransitionRequest = {
    status: 'DRAFT',
    action: 'SUBMIT',
    actorId: 'editor-1',
    actorRoles: ['EDITOR'],
    authorId: 'editor-1',
  };

  describe('allowed transitions', () => {
    it('allows DRAFT → IN_REVIEW for an editor', () => {
      expect(decideTransition(base)).toEqual({
        from: 'DRAFT',
        to: 'IN_REVIEW',
        action: 'SUBMIT',
      });
    });

    it('allows IN_REVIEW → APPROVED for a reviewer', () => {
      const result = decideTransition({
        ...base,
        status: 'IN_REVIEW',
        action: 'APPROVE',
        actorRoles: ['REVIEWER'],
        authorId: 'someone-else',
      });
      expect(result.to).toBe('APPROVED');
    });

    it('allows APPROVED → PUBLISHED for a reviewer', () => {
      const result = decideTransition({
        ...base,
        status: 'APPROVED',
        action: 'PUBLISH',
        actorRoles: ['REVIEWER'],
        authorId: 'someone-else',
      });
      expect(result.to).toBe('PUBLISHED');
    });

    it('allows PUBLISHED → ARCHIVED', () => {
      const result = decideTransition({
        ...base,
        status: 'PUBLISHED',
        action: 'ARCHIVE',
        actorRoles: ['REVIEWER'],
        authorId: 'x',
      });
      expect(result.to).toBe('ARCHIVED');
    });

    it('allows ARCHIVED → DRAFT via RESTORE', () => {
      const result = decideTransition({
        ...base,
        status: 'ARCHIVED',
        action: 'RESTORE',
        actorRoles: ['ADMIN'],
        authorId: 'x',
      });
      expect(result.to).toBe('DRAFT');
    });
  });

  describe('illegal transitions (fail-closed)', () => {
    it('rejects DRAFT → PUBLISHED (must pass through review)', () => {
      expect(() =>
        decideTransition({ ...base, action: 'PUBLISH', actorRoles: ['ADMIN'], authorId: 'x' }),
      ).toThrow(/不允许动作/);
    });

    it('rejects DRAFT → APPROVED', () => {
      expect(() =>
        decideTransition({ ...base, action: 'APPROVE', actorRoles: ['ADMIN'], authorId: 'x' }),
      ).toThrow(/不允许动作/);
    });

    it('rejects any action on ARCHIVED except RESTORE', () => {
      expect(allowedActions('ARCHIVED')).toEqual(['RESTORE']);
    });

    it('rejects unknown status-like action', () => {
      expect(() =>
        decideTransition({
          ...base,
          status: 'PUBLISHED',
          action: 'EDIT',
          actorRoles: ['ADMIN'],
          authorId: 'x',
        }),
      ).toThrow(/不允许动作/);
    });
  });

  describe('RBAC (AGENTS.md §4.2: Editor 不得审核或发布)', () => {
    it('rejects EDITOR approving', () => {
      expect(() =>
        decideTransition({
          ...base,
          status: 'IN_REVIEW',
          action: 'APPROVE',
          actorRoles: ['EDITOR'],
          authorId: 'x',
        }),
      ).toThrow(/无权执行/);
    });

    it('rejects EDITOR rejecting', () => {
      expect(() =>
        decideTransition({
          ...base,
          status: 'IN_REVIEW',
          action: 'REJECT',
          actorRoles: ['EDITOR'],
          authorId: 'x',
          reason: 'no',
        }),
      ).toThrow(/无权执行/);
    });

    it('rejects EDITOR publishing', () => {
      expect(() =>
        decideTransition({
          ...base,
          status: 'APPROVED',
          action: 'PUBLISH',
          actorRoles: ['EDITOR'],
          authorId: 'x',
        }),
      ).toThrow(/无权执行/);
    });

    it('rejects VIEWER from editing', () => {
      expect(() =>
        decideTransition({ ...base, action: 'EDIT', actorRoles: ['VIEWER'], authorId: 'x' }),
      ).toThrow(/无权执行/);
    });

    it('roleCanPerform matches transition rules', () => {
      expect(roleCanPerform(['EDITOR'], 'EDIT')).toBe(true);
      expect(roleCanPerform(['EDITOR'], 'APPROVE')).toBe(false);
      expect(roleCanPerform(['REVIEWER'], 'APPROVE')).toBe(true);
      expect(roleCanPerform(['ADMIN'], 'PUBLISH')).toBe(true);
      // 大小写不敏感
      expect(roleCanPerform(['admin'], 'PUBLISH')).toBe(true);
    });
  });

  describe('self-review ban (MVP)', () => {
    it('rejects reviewer approving own content', () => {
      expect(() =>
        decideTransition({
          status: 'IN_REVIEW',
          action: 'APPROVE',
          actorId: 'same-person',
          actorRoles: ['REVIEWER'],
          authorId: 'same-person',
        }),
      ).toThrow(/不能审核或发布自己创建的内容/);
    });

    it('rejects admin publishing own content', () => {
      expect(() =>
        decideTransition({
          status: 'APPROVED',
          action: 'PUBLISH',
          actorId: 'admin-1',
          actorRoles: ['ADMIN'],
          authorId: 'admin-1',
        }),
      ).toThrow(/不能审核或发布自己创建的内容/);
    });

    it('does NOT apply the self-review ban to SUBMIT (author may submit own draft)', () => {
      expect(() =>
        decideTransition({ ...base, authorId: 'editor-1', actorId: 'editor-1' }),
      ).not.toThrow();
    });
  });

  describe('reject requires a reason', () => {
    it('rejects REJECT without reason', () => {
      expect(() =>
        decideTransition({
          status: 'IN_REVIEW',
          action: 'REJECT',
          actorId: 'r1',
          actorRoles: ['REVIEWER'],
          authorId: 'a1',
        }),
      ).toThrow(/退回必须填写理由/);
    });

    it('rejects REJECT with whitespace-only reason', () => {
      expect(() =>
        decideTransition({
          status: 'IN_REVIEW',
          action: 'REJECT',
          actorId: 'r1',
          actorRoles: ['REVIEWER'],
          authorId: 'a1',
          reason: '   ',
        }),
      ).toThrow(/退回必须填写理由/);
    });

    it('accepts REJECT with a reason', () => {
      const result = decideTransition({
        status: 'IN_REVIEW',
        action: 'REJECT',
        actorId: 'r1',
        actorRoles: ['REVIEWER'],
        authorId: 'a1',
        reason: '来源不足，请补充页码',
      });
      expect(result.to).toBe('DRAFT');
    });
  });
});

describe('publication readiness (技术方案 §5.3)', () => {
  const ready = {
    title: '秦淮风光带',
    summary: '明城墙与秦淮河沿岸的历史街区。',
    bodyJson: '{"type":"doc","content":[]}',
    slug: 'qinhuai-fengguangdai',
    type: 'PLACE',
    hasSource: true,
    originalStatement: false,
    mediaRightsCleared: true,
    coordAccuracy: 'APPROXIMATE',
    hasLonLat: true,
  };

  it('passes a fully valid content', () => {
    expect(checkPublicationReadiness(ready)).toEqual({ ready: true, issues: [] });
  });

  it('reports every failing field at once (structured 422, not first-error)', () => {
    const result = checkPublicationReadiness({
      title: '',
      summary: null,
      bodyJson: '{}',
      slug: 'Bad Slug!',
      type: 'PLACE',
      hasSource: false,
      originalStatement: false,
      mediaRightsCleared: false,
      coordAccuracy: 'UNKNOWN',
      hasLonLat: true,
    });
    expect(result.ready).toBe(false);
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain('TITLE_REQUIRED');
    expect(codes).toContain('SUMMARY_REQUIRED');
    expect(codes).toContain('BODY_REQUIRED');
    expect(codes).toContain('SLUG_INVALID');
    expect(codes).toContain('SOURCE_REQUIRED');
    expect(codes).toContain('MEDIA_RIGHTS_NOT_CLEARED');
    expect(codes).toContain('COORDINATE_UNVERIFIED');
    expect(result.issues.length).toBe(7);
  });

  it('accepts original statement as an alternative to sources', () => {
    const result = checkPublicationReadiness({
      ...ready,
      hasSource: false,
      originalStatement: true,
    });
    expect(result.ready).toBe(true);
  });

  it('rejects precise coordinates when accuracy is UNKNOWN', () => {
    const result = checkPublicationReadiness({
      ...ready,
      coordAccuracy: 'UNKNOWN',
      hasLonLat: true,
    });
    expect(result.issues.map((issue) => issue.code)).toContain('COORDINATE_UNVERIFIED');
  });

  it('allows UNKNOWN accuracy when no coordinates are filled', () => {
    const result = checkPublicationReadiness({
      ...ready,
      coordAccuracy: 'UNKNOWN',
      hasLonLat: false,
    });
    expect(result.ready).toBe(true);
  });

  it('rejects multi-hyphen slug', () => {
    const result = checkPublicationReadiness({ ...ready, slug: 'a--b' });
    expect(result.issues.map((issue) => issue.code)).toContain('SLUG_INVALID');
  });

  it('accepts single-hyphen slug', () => {
    expect(checkPublicationReadiness({ ...ready, slug: 'a-b-c' }).ready).toBe(true);
  });
});

describe('relation type dictionary', () => {
  it('accepts known relation types', () => {
    for (const type of [
      'RELATED_TO',
      'PART_OF',
      'INFLUENCED',
      'CONTINUES',
      'REFERENCES',
      'LOCATED_AT',
    ]) {
      expect(isRelationType(type)).toBe(true);
    }
  });

  it('rejects unknown relation types', () => {
    expect(isRelationType('IS_A')).toBe(false);
    expect(isRelationType('')).toBe(false);
    expect(isRelationType('related_to')).toBe(false);
  });
});
