import { describe, it, expect } from 'vitest';
import { NOTE_COLORS, getDarkColor } from '../src/shared/noteColors';

describe('NOTE_COLORS', () => {
  it('has exactly 5 light/dark color pairs, each a valid hex color', () => {
    expect(NOTE_COLORS).toHaveLength(5);
    for (const { light, dark } of NOTE_COLORS) {
      expect(light).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(dark).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('keeps the existing note palette as the light values, in order', () => {
    expect(NOTE_COLORS.map((c) => c.light)).toEqual([
      '#FFF59D',
      '#FFCCBC',
      '#C8E6C9',
      '#B3E5FC',
      '#E1BEE7',
    ]);
  });
});

describe('getDarkColor', () => {
  it('returns the dark counterpart for a known light color', () => {
    expect(getDarkColor('#FFF59D')).toBe('#8D6E00');
    expect(getDarkColor('#E1BEE7')).toBe('#6A1B9A');
  });

  it('falls back to a fixed neutral dark color for an unknown color (not the input itself, which would render invisible background-on-background text)', () => {
    expect(getDarkColor('#123456')).toBe('#333333');
  });
});
