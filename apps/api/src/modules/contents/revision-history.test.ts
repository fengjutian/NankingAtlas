import { describe, expect, it } from 'vitest';

import { MAX_SNAPSHOT_TEXT_LENGTH, toRevisionSnapshot } from './revision-history.js';

/**
 * 快照摘要（FD-001）的纯函数单测。
 *
 * 这里的每条规则都对应一个真实风险：
 * - 脏快照不能让追溯历史整条读不出来（降级而非抛出）；
 * - 正文必须转纯文本，不能把 Tiptap 结构标记带回浏览器；
 * - 超长正文必须**显式**截断并标记，不能静默截断；
 * - 任何路径都不能把 `snapshot_json` 的原始片段回吐。
 */

function snapshot(bodyJson: string): string {
  return JSON.stringify({ title: '标题', subtitle: null, summary: '摘要', slug: 'a-slug', bodyJson });
}

describe('toRevisionSnapshot 正常路径', () => {
  it('提取 Tiptap 正文为纯文本', () => {
    const bodyJson = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '第一段。' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '第二段。' }],
        },
      ],
    });

    const result = toRevisionSnapshot(snapshot(bodyJson));
    expect(result.title).toBe('标题');
    expect(result.summary).toBe('摘要');
    expect(result.slug).toBe('a-slug');
    expect(result.subtitle).toBeNull();
    expect(result.bodyText).toBe('第一段。\n第二段。');
    expect(result.bodyTextLength).toBe(result.bodyText.length);
    expect(result.bodyTextTruncated).toBe(false);
  });

  it('不把 Tiptap 结构标记带给前端', () => {
    const bodyJson = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', marks: [{ type: 'bold' }], text: '小节' }],
        },
      ],
    });

    const result = toRevisionSnapshot(snapshot(bodyJson));
    expect(result.bodyText).toBe('小节');
    expect(result.bodyText).not.toContain('"type"');
    expect(result.bodyText).not.toContain('bold');
  });
});

describe('toRevisionSnapshot 截断规则', () => {
  it('超长正文截断到上限并显式标记', () => {
    const long = '长'.repeat(MAX_SNAPSHOT_TEXT_LENGTH + 500);
    const bodyJson = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: long }] }],
    });

    const result = toRevisionSnapshot(snapshot(bodyJson));
    expect(result.bodyTextTruncated).toBe(true);
    expect(result.bodyTextLength).toBe(long.length);
    // 长度报告的是真实长度，截断只发生在 bodyText 上 —— 不能两者一起被截断，
    // 否则调用方无法判断"还有多少内容没看到"。
    expect(result.bodyText).toHaveLength(MAX_SNAPSHOT_TEXT_LENGTH);
  });

  it('恰好等于上限时不标记为截断', () => {
    const exact = '文'.repeat(MAX_SNAPSHOT_TEXT_LENGTH);
    const bodyJson = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: exact }] }],
    });

    const result = toRevisionSnapshot(snapshot(bodyJson));
    expect(result.bodyTextTruncated).toBe(false);
    expect(result.bodyTextLength).toBe(MAX_SNAPSHOT_TEXT_LENGTH);
  });
});

describe('toRevisionSnapshot 对脏快照降级而非抛出', () => {
  it('snapshot_json 本身不是合法 JSON 时返回空快照', () => {
    const result = toRevisionSnapshot('{not json');
    expect(result.title).toBe('');
    expect(result.slug).toBe('');
    expect(result.bodyText).toBe('');
    expect(result.bodyTextLength).toBe(0);
    expect(result.bodyTextTruncated).toBe(false);
  });

  it('正文不是合法 Tiptap 文档时留空，且不泄露原始片段', () => {
    // 模拟"白名单收紧前落库"的历史脏数据：含白名单外的节点。
    const bodyJson = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '安全文本' }],
        },
        { type: 'script', attrs: { payload: 'SECRET_TOKEN_VALUE' } },
      ],
    });

    const result = toRevisionSnapshot(snapshot(bodyJson));
    expect(result.bodyText).toBe('');
    expect(JSON.stringify(result)).not.toContain('SECRET_TOKEN_VALUE');
    expect(JSON.stringify(result)).not.toContain('script');
  });

  it('正文 JSON 本身损坏时留空', () => {
    const result = toRevisionSnapshot(
      JSON.stringify({ title: '标题', slug: 'a-slug', bodyJson: '{"type":"doc",' }),
    );
    expect(result.title).toBe('标题');
    expect(result.bodyText).toBe('');
  });

  it('字段类型不对时用安全默认值，不把对象直接塞进文本字段', () => {
    const result = toRevisionSnapshot(
      JSON.stringify({
        title: { nested: 'object' },
        subtitle: 42,
        summary: '',
        slug: null,
        bodyJson: null,
      }),
    );
    expect(result.title).toBe('');
    expect(result.subtitle).toBeNull();
    // 空串按"没有值"处理
    expect(result.summary).toBeNull();
    expect(result.slug).toBe('');
    expect(result.bodyText).toBe('');
  });

  it('snapshot_json 是数组或 null 时同样安全降级', () => {
    expect(toRevisionSnapshot('[]').title).toBe('');
    expect(toRevisionSnapshot('null').title).toBe('');
    expect(toRevisionSnapshot('"字符串"').bodyText).toBe('');
  });
});