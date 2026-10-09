import { describe, expect, it } from 'vitest';

import {
  extractHeadingEntries,
  extractToc,
  injectHeadingIds,
  renderArticle,
  slugifyHeading,
} from './seo';

import type { TiptapDocument } from '@nanking-atlas/validation';

function heading(level: number, text: string): Record<string, unknown> {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

function doc(...nodes: Record<string, unknown>[]): TiptapDocument {
  return { type: 'doc', content: nodes } as TiptapDocument;
}

describe('slugifyHeading', () => {
  it('keeps Chinese characters', () => {
    expect(slugifyHeading('老门东历史文化街区')).toBe('老门东历史文化街区');
  });

  it('lower-cases ASCII and folds punctuation into dashes', () => {
    expect(slugifyHeading('Nanjing City Wall (1368)')).toBe('nanjing-city-wall-1368');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugifyHeading('  —— 城墙  —— ')).toBe('城墙');
  });

  it('falls back to a stable placeholder for headings with no usable characters', () => {
    expect(slugifyHeading('！！！')).toBe('section');
    expect(slugifyHeading('')).toBe('section');
  });
});

describe('extractHeadingEntries', () => {
  it('collects headings with their level and text', () => {
    const entries = extractHeadingEntries(doc(heading(2, '沿革'), heading(3, '分期')));
    expect(entries).toEqual([
      { id: '沿革', text: '沿革', level: 2 },
      { id: '分期', text: '分期', level: 3 },
    ]);
  });

  it('defaults a missing level to 2', () => {
    const entries = extractHeadingEntries(
      doc({ type: 'heading', content: [{ type: 'text', text: '无级别' }] }),
    );
    expect(entries[0]?.level).toBe(2);
  });

  it('de-duplicates repeated headings with an increasing suffix', () => {
    const entries = extractHeadingEntries(doc(heading(2, '沿革'), heading(2, '沿革'), heading(2, '沿革')));
    expect(entries.map((entry) => entry.id)).toEqual(['沿革', '沿革-2', '沿革-3']);
  });

  it('finds headings nested inside blockquotes and lists', () => {
    const nested = {
      type: 'blockquote',
      content: [heading(2, '引用中的标题')],
    };
    expect(extractHeadingEntries(doc(nested)).map((entry) => entry.text)).toEqual(['引用中的标题']);
  });

  it('skips empty headings', () => {
    expect(extractHeadingEntries(doc(heading(2, '   ')))).toEqual([]);
  });
});

describe('extractToc', () => {
  it('keeps only h2/h3 by default', () => {
    const toc = extractToc(doc(heading(1, '标题'), heading(2, '章节'), heading(3, '小节'), heading(4, '更小')));
    expect(toc.map((entry) => entry.text)).toEqual(['章节', '小节']);
  });

  it('supports a custom level range', () => {
    const toc = extractToc(doc(heading(2, 'A'), heading(4, 'B')), 2, 4);
    expect(toc).toHaveLength(2);
  });

  it('returns an empty list for a document without headings', () => {
    expect(extractToc(doc({ type: 'paragraph', content: [{ type: 'text', text: '正文' }] }))).toEqual([]);
  });
});

describe('injectHeadingIds', () => {
  it('returns the html untouched when there are no headings', () => {
    expect(injectHeadingIds('<p>正文</p>', [])).toBe('<p>正文</p>');
  });

  it('adds ids in document order', () => {
    const html = injectHeadingIds('<h2>沿革</h2><p>x</p><h3>分期</h3>', [
      { id: '沿革', text: '沿革', level: 2 },
      { id: '分期', text: '分期', level: 3 },
    ]);
    expect(html).toBe('<h2 id="沿革">沿革</h2><p>x</p><h3 id="分期">分期</h3>');
  });

  it('refuses to inject an id that is not in the safe character set', () => {
    const html = injectHeadingIds('<h2>x</h2>', [{ id: 'a" onclick="1', text: 'x', level: 2 }]);
    expect(html).toBe('<h2>x</h2>');
  });

  it('does not shift ids when the level does not match', () => {
    const html = injectHeadingIds('<h3>甲</h3><h2>乙</h2>', [
      { id: '甲', text: '甲', level: 2 },
      { id: '乙', text: '乙', level: 2 },
    ]);
    expect(html).toBe('<h3>甲</h3><h2 id="乙">乙</h2>');
  });
});

describe('renderArticle', () => {
  it('degrades instead of throwing when the body fails validation', () => {
    const rendered = renderArticle({ type: 'script' });
    expect(rendered.valid).toBe(false);
    expect(rendered.html).toBe('');
    expect(rendered.headings).toEqual([]);
  });

  it('degrades for a non-object body', () => {
    expect(renderArticle(null).valid).toBe(false);
    expect(renderArticle('正文').valid).toBe(false);
  });

  it('renders escaped html and anchors that match the toc', () => {
    const rendered = renderArticle(
      doc(heading(2, '沿革'), { type: 'paragraph', content: [{ type: 'text', text: '正文段落' }] }),
    );
    expect(rendered.valid).toBe(true);
    expect(rendered.html).toContain('<h2 id="沿革">沿革</h2>');
    expect(rendered.plainText).toContain('正文段落');
    expect(rendered.headings[0]?.id).toBe('沿革');
  });

  it('escapes inline markup instead of executing it', () => {
    const rendered = renderArticle(
      doc({
        type: 'paragraph',
        content: [{ type: 'text', text: '<script>alert(1)</script>' }],
      }),
    );
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('gives repeated headings unique anchors end to end', () => {
    const rendered = renderArticle(doc(heading(2, '沿革'), heading(2, '沿革')));
    expect(rendered.html).toContain('<h2 id="沿革">');
    expect(rendered.html).toContain('<h2 id="沿革-2">');
  });
});
