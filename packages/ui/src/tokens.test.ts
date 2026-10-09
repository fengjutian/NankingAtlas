import { describe, expect, it } from 'vitest';

import { COLORS, FONT_STACKS, MAX_CONTENT_WIDTH, SPACING } from './tokens.js';

describe('ui tokens', () => {
  it('exposes both web and admin accent colors', () => {
    expect(COLORS.webAccent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(COLORS.adminAccent).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('exposes serif and sans font stacks', () => {
    expect(FONT_STACKS.serif).toContain('serif');
    expect(FONT_STACKS.sans).toContain('sans-serif');
  });

  it('exposes a five-step spacing scale', () => {
    expect(Object.keys(SPACING)).toEqual(['xs', 'sm', 'md', 'lg', 'xl', 'xxl']);
  });

  it('exposes distinct max content widths for web and admin', () => {
    expect(MAX_CONTENT_WIDTH.web).not.toBe(MAX_CONTENT_WIDTH.admin);
  });
});
