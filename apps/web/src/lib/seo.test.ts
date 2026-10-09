import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublicContent } from './types';
import type * as SeoModule from './seo';

/**
 * `seo.ts` 读取 `NEXT_PUBLIC_SITE_URL` 决定 canonical 形态，
 * 因此按环境动态载入以覆盖"未配置域名"这条分支。
 */
async function loadSeo(siteUrl: string | null): Promise<typeof SeoModule> {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'test');
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', siteUrl === null ? '' : siteUrl);
  return import('./seo');
}

function content(overrides: Partial<PublicContent> = {}): PublicContent {
  return {
    id: 'c1',
    type: 'PERSON',
    slug: 'a-slug',
    title: '示例标题',
    subtitle: null,
    summary: null,
    body: { type: 'doc', content: [] },
    language: 'ZH',
    publishedAt: '2026-10-09T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('canonical 与索引策略', () => {
  it('falls back to a shareable relative path when the site URL is unknown', async () => {
    const { canonicalUrl, isSiteUrlConfigured } = await loadSeo(null);
    expect(isSiteUrlConfigured()).toBe(false);
    expect(canonicalUrl('/chronicle/a-slug')).toBe('/chronicle/a-slug');
    expect(canonicalUrl('chronicle/a-slug')).toBe('/chronicle/a-slug');
  });

  it('produces absolute canonicals once the domain is configured', async () => {
    const { canonicalUrl, isSiteUrlConfigured } = await loadSeo('https://atlas.example.invalid/');
    expect(isSiteUrlConfigured()).toBe(true);
    expect(canonicalUrl('/places/a-slug')).toBe('https://atlas.example.invalid/places/a-slug');
  });

  it('keeps indexing disabled until the domain is confirmed', async () => {
    const { resolveIndexingPolicy } = await loadSeo(null);
    expect(resolveIndexingPolicy(false)).toEqual({ index: false, follow: true });
    expect(resolveIndexingPolicy(true)).toEqual({ index: true, follow: true });
  });
});

describe('buildPageMetadata', () => {
  it('emits a unique title, description and canonical', async () => {
    const { buildPageMetadata } = await loadSeo('https://atlas.example.invalid');
    const metadata = buildPageMetadata({
      title: '南京城市文化志',
      description: '以人物、事件、建筑为线索的长文档案。',
      path: '/chronicle',
    });
    expect(metadata.title).toBe('南京城市文化志');
    expect(metadata.description).toBe('以人物、事件、建筑为线索的长文档案。');
    expect(metadata.alternates?.canonical).toBe('https://atlas.example.invalid/chronicle');
  });

  it('fills Open Graph fields for a website page', async () => {
    const { buildPageMetadata } = await loadSeo('https://atlas.example.invalid');
    const metadata = buildPageMetadata({ title: 'T', description: 'D', path: '/living' });
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      title: 'T',
      description: 'D',
      url: 'https://atlas.example.invalid/living',
      siteName: '金陵风物志',
      locale: 'zh_CN',
    });
  });

  it('uses the article OG type and only a parseable publishedTime', async () => {
    const { buildPageMetadata } = await loadSeo(null);
    const ok = buildPageMetadata({
      title: 'T',
      description: 'D',
      path: '/chronicle/a-slug',
      type: 'article',
      publishedAt: '2026-10-09T00:00:00.000Z',
    });
    expect(ok.openGraph?.type).toBe('article');
    expect(ok.openGraph?.publishedTime).toBe('2026-10-09T00:00:00.000Z');

    const bad = buildPageMetadata({
      title: 'T',
      description: 'D',
      path: '/chronicle/a-slug',
      type: 'article',
      publishedAt: 'not-a-date',
    });
    expect(bad.openGraph?.publishedTime).toBeUndefined();
  });

  it('includes OG images only when an asset URL is supplied', async () => {
    const { buildPageMetadata } = await loadSeo(null);
    const without = buildPageMetadata({ title: 'T', description: 'D', path: '/' });
    expect(without.openGraph?.images).toBeUndefined();
    const withImage = buildPageMetadata({
      title: 'T',
      description: 'D',
      path: '/',
      imageUrl: 'https://atlas.example.invalid/og.jpg',
    });
    expect(withImage.openGraph?.images).toEqual([{ url: 'https://atlas.example.invalid/og.jpg' }]);
  });

  it('honours noIndex for pages that must stay out of the index', async () => {
    const { buildPageMetadata } = await loadSeo('https://atlas.example.invalid');
    const metadata = buildPageMetadata({ title: 'T', description: 'D', path: '/x', noIndex: true });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('truncates an over-long description', async () => {
    const { buildPageMetadata, truncateDescription } = await loadSeo(null);
    expect(truncateDescription('文'.repeat(300))).toHaveLength(151);
    expect(buildPageMetadata({ title: 'T', description: 'x'.repeat(300), path: '/' }).description).toHaveLength(151);
  });
});

describe('buildJsonLd', () => {
  it('returns null for a blank title instead of inventing data', async () => {
    const { buildJsonLd } = await loadSeo(null);
    expect(buildJsonLd({ content: content({ title: '   ' }), plainText: '' })).toBeNull();
  });

  it('emits Article for chronicle-style types with publisher instead of a fabricated author', async () => {
    const { buildJsonLd } = await loadSeo('https://atlas.example.invalid');
    const data = buildJsonLd({ content: content({ type: 'PERSON' }), plainText: '正文纯文本' });
    expect(data?.['@type']).toBe('Article');
    expect(data?.['headline']).toBe('示例标题');
    expect(data?.['datePublished']).toBe('2026-10-09T00:00:00.000Z');
    expect(data?.['url']).toBe('https://atlas.example.invalid/people/a-slug');
    expect(data?.['author']).toEqual({ '@type': 'Organization', name: 'Nanking Atlas 编辑部' });
    expect(data?.['inLanguage']).toBe('zh-CN');
  });

  it('emits Place for PLACE and TouristRoute for ROUTE', async () => {
    const { buildJsonLd } = await loadSeo(null);
    expect(buildJsonLd({ content: content({ type: 'PLACE' }), plainText: '' })?.['@type']).toBe('Place');
    expect(buildJsonLd({ content: content({ type: 'ROUTE' }), plainText: '' })?.['@type']).toBe(
      'TouristRoute',
    );
    expect(buildJsonLd({ content: content({ type: 'TOPIC' }), plainText: '' })?.['@type']).toBe('Article');
    expect(buildJsonLd({ content: content({ type: 'TRADITION' }), plainText: '' })?.['@type']).toBe(
      'Article',
    );
  });

  it('includes geo only when the coordinate is both precise and verified', async () => {
    const { buildJsonLd } = await loadSeo(null);
    const place = content({ type: 'PLACE' });
    const verified = buildJsonLd({
      content: place,
      plainText: '',
      place: {
        lon: 118.78,
        lat: 32.06,
        accuracy: 'EXACT',
        verificationStatus: 'VERIFIED',
        address: '某路 1 号',
      },
    });
    expect(verified?.['geo']).toEqual({
      '@type': 'GeoCoordinates',
      longitude: 118.78,
      latitude: 32.06,
    });
    expect(verified?.['address']).toBe('某路 1 号');
  });

  it('omits geo when the accuracy is UNKNOWN or AREA_ONLY', async () => {
    const { buildJsonLd } = await loadSeo(null);
    for (const accuracy of ['UNKNOWN', 'AREA_ONLY'] as const) {
      const data = buildJsonLd({
        content: content({ type: 'PLACE' }),
        plainText: '',
        place: { lon: 118.78, lat: 32.06, accuracy, verificationStatus: 'VERIFIED' },
      });
      expect(data?.['geo']).toBeUndefined();
    }
  });

  it('omits geo when the coordinate has not passed verification', async () => {
    const { buildJsonLd } = await loadSeo(null);
    for (const verificationStatus of ['UNVERIFIED', 'PARTIAL', 'DISPUTED'] as const) {
      const data = buildJsonLd({
        content: content({ type: 'PLACE' }),
        plainText: '',
        place: { lon: 118.78, lat: 32.06, accuracy: 'EXACT', verificationStatus },
      });
      expect(data?.['geo']).toBeUndefined();
    }
  });

  it('omits geo for out-of-range coordinates', async () => {
    const { buildJsonLd } = await loadSeo(null);
    const data = buildJsonLd({
      content: content({ type: 'PLACE' }),
      plainText: '',
      place: { lon: 400, lat: 32.06, accuracy: 'EXACT', verificationStatus: 'VERIFIED' },
    });
    expect(data?.['geo']).toBeUndefined();
  });

  it('omits datePublished when the publication time is missing or invalid', async () => {
    const { buildJsonLd } = await loadSeo(null);
    expect(
      buildJsonLd({ content: content({ publishedAt: null }), plainText: '' })?.['datePublished'],
    ).toBeUndefined();
    expect(
      buildJsonLd({ content: content({ publishedAt: 'soon' }), plainText: '' })?.['datePublished'],
    ).toBeUndefined();
  });

  it('adds route itinerary only for stops that have a slug', async () => {
    const { buildJsonLd } = await loadSeo('https://atlas.example.invalid');
    const data = buildJsonLd({
      content: content({ type: 'ROUTE' }),
      plainText: '',
      route: {
        durationMinutes: 90,
        distanceMeters: 3200,
        stops: [
          { position: 0, placeSlug: 'gate-1', placeTitle: '城门', note: null },
          { position: 1, placeTitle: '无名站点' },
        ],
      },
    });
    expect(data?.['totalTime']).toBe('PT90M');
    const itinerary = data?.['itinerary'] as { numberOfItems: number } | undefined;
    expect(itinerary?.numberOfItems).toBe(1);
  });

  it('omits itinerary when a route has no public stops', async () => {
    const { buildJsonLd } = await loadSeo(null);
    const data = buildJsonLd({ content: content({ type: 'ROUTE' }), plainText: '', route: { stops: [] } });
    expect(data?.['itinerary']).toBeUndefined();
  });

  it('uses the summary as description and falls back to the body text', async () => {
    const { buildJsonLd } = await loadSeo(null);
    const withSummary = buildJsonLd({ content: content({ summary: '摘要内容' }), plainText: '正文' });
    expect(withSummary?.['description']).toBe('摘要内容');
    const withoutSummary = buildJsonLd({ content: content(), plainText: '仅有正文纯文本' });
    expect(withoutSummary?.['description']).toBe('仅有正文纯文本');
  });

  it('marks English content with the en language tag', async () => {
    const { buildJsonLd } = await loadSeo(null);
    expect(buildJsonLd({ content: content({ language: 'EN' }), plainText: '' })?.['inLanguage']).toBe(
      'en',
    );
  });
});

describe('serializeJsonLd', () => {
  it('returns null when there is no structured data', async () => {
    const { serializeJsonLd } = await loadSeo(null);
    expect(serializeJsonLd(null)).toBeNull();
  });

  it('escapes angle brackets so a title cannot close the script tag', async () => {
    const { serializeJsonLd } = await loadSeo(null);
    const json = serializeJsonLd({ headline: '</script><img src=x onerror=alert(1)>' });
    expect(json).not.toContain('<');
    expect(json).not.toContain('>');
    expect(json).toContain('\\u003c');
    expect(JSON.parse(json ?? '{}')).toEqual({
      headline: '</script><img src=x onerror=alert(1)>',
    });
  });

  it('escapes line separators that break JSON in script context', async () => {
    const { serializeJsonLd } = await loadSeo(null);
    const json = serializeJsonLd({ headline: `a${String.fromCharCode(0x2028)}b` });
    expect(json).toContain('\\u2028');
  });
});
