import { describe, expect, it } from 'vitest';

import {
  ACCURACY_LABELS,
  RIGHTS_LABELS,
  SOURCE_KIND_LABELS,
  buildExcerpt,
  buildTypeFacts,
  canShowExactCoordinates,
  contentTypeLabel,
  countHiddenMedia,
  detailHref,
  formatCoordinates,
  formatDateZh,
  formatDistance,
  isContentType,
  isLocationAccuracy,
  isRightsStatus,
  isSourceKind,
  matchesKeyword,
  selectPublicMedia,
} from './types';

import type { PublicContent, PublicMedia } from './types';

function content(overrides: Partial<PublicContent> = {}): PublicContent {
  return {
    id: 'c1',
    type: 'PLACE',
    slug: 'a-slug',
    title: '示例',
    subtitle: null,
    summary: null,
    body: { type: 'doc', content: [] },
    language: 'ZH',
    publishedAt: '2026-10-09T00:00:00.000Z',
    ...overrides,
  };
}

function media(overrides: Partial<PublicMedia> = {}): PublicMedia {
  return {
    url: 'https://cdn.example.invalid/a.webp',
    altText: '一条街道的立面',
    creditLine: '摄影：示例',
    rightsStatus: 'LICENSED',
    caption: null,
    ...overrides,
  };
}

describe('类型与枚举守卫', () => {
  it('accepts only contract enum values', () => {
    expect(isContentType('PLACE')).toBe(true);
    expect(isContentType('ARTICLE')).toBe(false);
    expect(isLocationAccuracy('AREA_ONLY')).toBe(true);
    expect(isLocationAccuracy('SUPER')).toBe(false);
    expect(isRightsStatus('RESTRICTED')).toBe(true);
    expect(isRightsStatus('')).toBe(false);
    expect(isSourceKind('ARCHIVE')).toBe(true);
    expect(isSourceKind(42)).toBe(false);
  });

  it('labels every enum value in Chinese', () => {
    expect(contentTypeLabel('PERSON')).toBe('人物');
    expect(ACCURACY_LABELS.UNKNOWN).toBe('坐标未核验');
    expect(RIGHTS_LABELS.RESTRICTED).toContain('禁止');
    expect(SOURCE_KIND_LABELS.FIELD_NOTE).toBe('田野记录');
  });
});

describe('媒体准入（版权与可访问性）', () => {
  it('shows media that has alt, credit line and a public rights status', () => {
    expect(selectPublicMedia([media()])).toHaveLength(1);
  });

  it('hides UNKNOWN and RESTRICTED media', () => {
    const hidden = [media({ rightsStatus: 'UNKNOWN' }), media({ rightsStatus: 'RESTRICTED' })];
    expect(selectPublicMedia(hidden)).toEqual([]);
    expect(countHiddenMedia(hidden)).toBe(2);
  });

  it('hides media missing alt or credit line', () => {
    const items = [media({ altText: null }), media({ creditLine: '  ' })];
    expect(selectPublicMedia(items)).toEqual([]);
    expect(countHiddenMedia(items)).toBe(2);
  });

  it('counts nothing hidden for an empty list', () => {
    expect(countHiddenMedia([])).toBe(0);
  });
});

describe('坐标展示规则', () => {
  it('allows precise coordinates only for EXACT + VERIFIED', () => {
    expect(canShowExactCoordinates('EXACT', 'VERIFIED')).toBe(true);
    // APPROXIMATE 只是"近似值"，尚未核验完成 → 不展示精确点
    expect(canShowExactCoordinates('APPROXIMATE', 'VERIFIED')).toBe(false);
    expect(canShowExactCoordinates('AREA_ONLY', 'VERIFIED')).toBe(false);
    expect(canShowExactCoordinates('UNKNOWN', 'VERIFIED')).toBe(false);
    expect(canShowExactCoordinates(null, 'VERIFIED')).toBe(false);
    expect(canShowExactCoordinates(undefined, 'VERIFIED')).toBe(false);
  });

  it('requires VERIFIED even when accuracy is EXACT', () => {
    for (const status of ['UNVERIFIED', 'PARTIAL', 'DISPUTED'] as const) {
      expect(canShowExactCoordinates('EXACT', status)).toBe(false);
    }
  });

  it('falls back to accuracy-only when verification status is absent', () => {
    expect(canShowExactCoordinates('EXACT')).toBe(true);
    expect(canShowExactCoordinates('APPROXIMATE')).toBe(false);
    expect(canShowExactCoordinates('UNKNOWN')).toBe(false);
    expect(canShowExactCoordinates(null, null)).toBe(false);
  });

  it('formats valid coordinates and rejects unusable ones', () => {
    expect(formatCoordinates(118.78, 32.06)).toBe('32.06000, 118.78000（纬度, 经度）');
    expect(formatCoordinates(null, 32.06)).toBeNull();
    expect(formatCoordinates(400, 32.06)).toBeNull();
    expect(formatCoordinates(Number.NaN, 32)).toBeNull();
  });
});

describe('buildTypeFacts', () => {
  it('shows coordinates only when the accuracy supports them', () => {
    const facts = buildTypeFacts(content({ type: 'PLACE' }), {
      place: { lon: 118.78, lat: 32.06, accuracy: 'EXACT', verificationStatus: 'VERIFIED' },
    });
    expect(facts.find((fact) => fact.label === '经纬度')?.value).toBe(
      '32.06000, 118.78000（纬度, 经度）',
    );
  });

  it('suppresses precise coordinates for UNKNOWN and AREA_ONLY', () => {
    for (const accuracy of ['UNKNOWN', 'AREA_ONLY'] as const) {
      const facts = buildTypeFacts(content({ type: 'PLACE' }), {
        place: { lon: 118.78, lat: 32.06, accuracy },
      });
      expect(facts.find((fact) => fact.label === '经纬度')?.value).toBe('暂不展示');
    }
  });

  it('explains the suppression reason to the reader', () => {
    const facts = buildTypeFacts(content({ type: 'PLACE' }), { place: { accuracy: 'UNKNOWN' } });
    expect(facts.find((fact) => fact.label === '坐标精度')?.note).toContain('不展示精确经纬度');
  });

  it('marks missing public fields as unavailable instead of inventing values', () => {
    const facts = buildTypeFacts(content({ type: 'PLACE' }), {});
    expect(facts.find((fact) => fact.label === '地址')?.value).toBe('暂缺');
    expect(facts.find((fact) => fact.label === '核验状态')?.value).toBe('暂缺');
  });

  it('formats route duration, distance and stop count', () => {
    const facts = buildTypeFacts(content({ type: 'ROUTE' }), {
      route: { durationMinutes: 75, distanceMeters: 2500, stops: [{ position: 0 }] },
    });
    expect(facts.find((fact) => fact.label === '建议时长')?.value).toBe('75 分钟');
    expect(facts.find((fact) => fact.label === '路线长度')?.value).toBe('2.5 公里');
    expect(facts.find((fact) => fact.label === '站点数量')?.value).toBe('1 站');
  });

  it('formats person, event, architecture and tradition extensions', () => {
    expect(
      buildTypeFacts(content({ type: 'PERSON' }), { person: { birthText: '某年' } }).find(
        (fact) => fact.label === '生年',
      )?.value,
    ).toBe('某年');
    expect(
      buildTypeFacts(content({ type: 'EVENT' }), { event: { datePrecision: 'YEAR' } }).find(
        (fact) => fact.label === '日期精度',
      )?.value,
    ).toBe('YEAR');
    expect(
      buildTypeFacts(content({ type: 'ARCHITECTURE' }), {
        architecture: { heritageLevel: '市级' },
      }).find((fact) => fact.label === '保护级别')?.value,
    ).toBe('市级');
    expect(
      buildTypeFacts(content({ type: 'TRADITION' }), { tradition: { traditionType: '节令' } }).find(
        (fact) => fact.label === '类型',
      )?.value,
    ).toBe('节令');
  });

  it('reports a missing curator note instead of hiding the section', () => {
    const facts = buildTypeFacts(content({ type: 'TOPIC' }), {});
    expect(facts).toHaveLength(1);
    expect(facts[0]?.label).toBe('策展笔记');
    expect(facts[0]?.value).toBe('暂缺');
  });

  it('formats distances below one kilometre in metres', () => {
    expect(formatDistance(480)).toBe('480 米');
    expect(formatDistance(0)).toBe('');
    expect(formatDistance(-10)).toBe('');
  });
});

describe('展示辅助', () => {
  it('formats an ISO date in Chinese and rejects unusable input', () => {
    expect(formatDateZh('2026-10-09T00:00:00.000Z')).toBe('2026年10月9日');
    expect(formatDateZh(null)).toBe('');
    expect(formatDateZh('nonsense')).toBe('');
  });

  it('prefers the summary and falls back to the body text', () => {
    expect(buildExcerpt('  摘要  ', '正文')).toBe('摘要');
    expect(buildExcerpt(null, '正文纯文本')).toBe('正文纯文本');
  });

  it('truncates long text with an ellipsis', () => {
    expect(buildExcerpt(null, '文'.repeat(200), 10)).toBe(`${'文'.repeat(10)}…`);
    expect(buildExcerpt('短', '正文', 10)).toBe('短');
  });

  it('matches keywords case-insensitively and treats an empty keyword as a match', () => {
    expect(matchesKeyword(['Nanjing City Wall'], 'nanjing')).toBe(true);
    expect(matchesKeyword(['城墙', null], '城墙')).toBe(true);
    expect(matchesKeyword(['城墙'], '老门东')).toBe(false);
    expect(matchesKeyword(['城墙'], '   ')).toBe(true);
  });

  it('maps every content type to a detail path', () => {
    expect(detailHref(content({ type: 'PLACE' }))).toBe('/places/a-slug');
    expect(detailHref(content({ type: 'TOPIC' }))).toBe('/topics/a-slug');
    expect(detailHref(content({ type: 'ROUTE' }))).toBe('/routes/a-slug');
    expect(detailHref(content({ type: 'TRADITION' }))).toBe('/chronicle/a-slug');
  });
});
