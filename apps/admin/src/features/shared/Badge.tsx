import { statusLabel } from './workflow';

import type { ContentStatus } from '@/api/types';
import type { CSSProperties, ReactNode } from 'react';

export type BadgeTone =
  'neutral' | 'draft' | 'review' | 'approved' | 'published' | 'archived' | 'danger';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span style={badgeStyle(tone)}>{children}</span>;
}

const TONE_BY_STATUS: Record<ContentStatus, BadgeTone> = {
  DRAFT: 'draft',
  IN_REVIEW: 'review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

export function statusTone(status: ContentStatus): BadgeTone {
  return TONE_BY_STATUS[status];
}

/** 内容状态徽标：列表与编辑器共用同一套映射，避免两处各写一份。 */
export function StatusBadge({ status }: { status: ContentStatus }) {
  return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>;
}

function badgeStyle(tone: BadgeTone): CSSProperties {
  const base: CSSProperties = {
    display: 'inline-block',
    padding: '0 var(--app-space-xs)',
    borderRadius: '0.25rem',
    border: '1px solid var(--app-border)',
    fontSize: '0.75rem',
    lineHeight: '1.6',
    whiteSpace: 'nowrap',
  };
  switch (tone) {
    case 'published':
      return { ...base, borderColor: 'var(--app-accent)', color: 'var(--app-accent)' };
    case 'review':
    case 'approved':
      return { ...base, borderColor: 'var(--app-warning-border)', color: 'var(--app-warning-fg)' };
    case 'danger':
      return { ...base, background: 'var(--app-warning-bg)', color: 'var(--app-warning-fg)' };
    case 'draft':
    case 'archived':
    case 'neutral':
      return { ...base, color: 'var(--app-muted)' };
    default:
      return base;
  }
}
