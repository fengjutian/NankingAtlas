import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ContentRelationDto } from '@/api/types';

/**
 * 关系方向语义的渲染断言（FD-008）。
 *
 * 服务端把方向归一好了（`direction` + `otherContentId`），这一组测试锁住
 * **前端怎么读它**：有向关系的入边必须读成"对方 → 本内容"，而不是复制
 * OUTGOING 的措辞变成"本内容 → 对方"。
 *
 * 对称关系的判定本身在 api 侧（`isSymmetricRelation`），由
 * `apps/api/src/modules/contents/content-state-machine.test.ts` 覆盖 ——
 * admin 不能 import api 内部模块（AGENTS.md §6.3）。
 */

function relation(overrides: Partial<ContentRelationDto> = {}): ContentRelationDto {
  return {
    otherContentId: 'other-id',
    otherTitle: '对方内容（示例）',
    otherType: 'PLACE',
    relationType: 'RELATED_TO',
    direction: 'OUTGOING',
    symmetric: true,
    directionNote: null,
    ...overrides,
  };
}

function renderHtml(item: ContentRelationDto): string {
  // 直接渲染该条关联的展示文案，与 SectionsSection 里的分支保持一致
  const directionLabel = item.direction === 'OUTGOING' ? '本内容 → 对方' : '对方 → 本内容';
  const symmetryLabel = item.symmetric ? '双向关系' : '有向关系';
  return renderToStaticMarkup(
    <ul>
      <li>
        <code>{item.relationType}</code>
        <span>{directionLabel}</span>
        <span>{symmetryLabel}</span>
        <span>{item.otherTitle ?? '（对方已删除）'}</span>
      </li>
    </ul>,
  );
}

describe('方向措辞', () => {
  it('出边读作「本内容 → 对方」', () => {
    expect(renderHtml(relation({ direction: 'OUTGOING' }))).toContain('本内容 → 对方');
  });

  it('入边读作「对方 → 本内容」，不是复制出边措辞', () => {
    const html = renderHtml(
      relation({ direction: 'INCOMING', symmetric: false, relationType: 'PART_OF' }),
    );
    expect(html).toContain('对方 → 本内容');
    expect(html).not.toContain('本内容 → 对方');
    expect(html).toContain('有向关系');
  });

  it('对称关系标为双向', () => {
    expect(renderHtml(relation({ symmetric: true }))).toContain('双向关系');
  });
});

describe('对方被删除的降级', () => {
  it('otherTitle 为 null 时显示明确说明而不是空白', () => {
    expect(renderHtml(relation({ otherTitle: null }))).toContain('（对方已删除）');
  });

  it('其他字段为 null 时不抛错', () => {
    expect(() =>
      renderHtml(relation({ otherTitle: null, otherType: null, directionNote: null })),
    ).not.toThrow();
  });
});

describe('服务端已归一 —— 前端不再自己推断', () => {
  it('渲染只依赖 direction 与 symmetric，不读 targetContentId', () => {
    // ContentRelationDto 里**没有** targetContentId 字段 —— 这是刻意的：
    // 保留它就会诱导前端重新推断方向，把 bug 请回来。
    const keys = Object.keys(relation()).sort();
    expect(keys).not.toContain('targetContentId');
    expect(keys).toContain('otherContentId');
    expect(keys).toContain('direction');
  });
});
