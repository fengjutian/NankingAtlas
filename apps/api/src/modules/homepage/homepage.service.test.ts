import { describe, expect, it } from 'vitest';

import { HOMEPAGE_SLOT_KEYS, isHomepageSlotKey } from './homepage.service.js';

/**
 * 首页槽位键的受控字典单测（P2-02）。
 *
 * 槽位键是后台可写字段，若不做白名单，拼错会在首页渲染出未知区块。
 */
describe('homepage slot keys', () => {
  it('accepts every declared slot key', () => {
    for (const key of HOMEPAGE_SLOT_KEYS) {
      expect(isHomepageSlotKey(key)).toBe(true);
    }
  });

  it('rejects unknown keys', () => {
    for (const key of ['', 'HERO', 'unknown', 'hero ', ' hero', 'Hero']) {
      expect(isHomepageSlotKey(key)).toBe(false);
    }
  });

  it('covers the documented slots', () => {
    expect(HOMEPAGE_SLOT_KEYS).toContain('hero');
    expect(HOMEPAGE_SLOT_KEYS).toContain('featured');
  });
});
