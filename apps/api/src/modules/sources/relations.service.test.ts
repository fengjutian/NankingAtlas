import { describe, expect, it } from 'vitest';

import { isSymmetricRelation, RELATION_TYPE_VALUES } from './relations.service.js';

/**
 * 关系方向语义的单元测试（FD-008）。
 *
 * `isSymmetricRelation` 决定前端怎么措辞：对称关系两端读法相同，
 * 有向关系的入边必须读成"X 指向本内容"。判定错了，前端就会把
 * 「某建筑 PART_OF 某地点」显示成「某建筑 属于 某地点」——
 * 方向反了，语义就完全错了。
 */

describe('对称关系判定', () => {
  it('只有 RELATED_TO 是对称的', () => {
    expect(isSymmetricRelation('RELATED_TO')).toBe(true);
  });

  it('其余受控关系类型都是有向的', () => {
    for (const type of RELATION_TYPE_VALUES) {
      if (type === 'RELATED_TO') {
        continue;
      }
      expect(isSymmetricRelation(type), `${type} 应为有向关系`).toBe(false);
    }
  });

  it('未知类型按有向处理（fail-safe）', () => {
    // 不认识的关系类型**不能**默认当成对称 —— 那会把方向语义弄反。
    // 保守地当作有向，让前端用"X 指向本内容"的措辞，至少不会自称双向。
    expect(isSymmetricRelation('NOT_A_RELATION')).toBe(false);
    expect(isSymmetricRelation('')).toBe(false);
  });

  it('判定对大小写敏感（受控字典是大写常量）', () => {
    expect(isSymmetricRelation('related_to')).toBe(false);
  });
});

describe('关系类型字典', () => {
  it('暴露受控字典的完整集合', () => {
    expect([...RELATION_TYPE_VALUES]).toEqual([
      'RELATED_TO',
      'PART_OF',
      'INFLUENCED',
      'CONTINUES',
      'REFERENCES',
      'LOCATED_AT',
    ]);
  });
});
