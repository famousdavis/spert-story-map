import { describe, it, expect } from 'vitest';
import { THEME_COLOR_OPTIONS, DEFAULT_THEME_COLOR_KEYS, getThemeColorClasses } from '../lib/themeColors';

describe('THEME_COLOR_OPTIONS', () => {
  it('has 8 color options', () => {
    expect(THEME_COLOR_OPTIONS).toHaveLength(8);
  });

  it('each option has required fields', () => {
    for (const opt of THEME_COLOR_OPTIONS) {
      expect(opt).toHaveProperty('key');
      expect(opt).toHaveProperty('solid');
      expect(opt).toHaveProperty('light');
      expect(opt).toHaveProperty('dot');
      expect(opt).toHaveProperty('swatch');
      expect(typeof opt.key).toBe('string');
      expect(typeof opt.solid).toBe('string');
    }
  });

  it('has unique keys', () => {
    const keys = THEME_COLOR_OPTIONS.map(o => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('DEFAULT_THEME_COLOR_KEYS', () => {
  it('matches THEME_COLOR_OPTIONS keys in order', () => {
    expect(DEFAULT_THEME_COLOR_KEYS).toEqual(THEME_COLOR_OPTIONS.map(o => o.key));
  });
});

describe('getThemeColorClasses', () => {
  it('returns color by theme.color when set', () => {
    const theme = { id: 't1', name: 'Test', color: 'rose' };
    const result = getThemeColorClasses(theme, 0);
    expect(result.key).toBe('rose');
    expect(result.solid).toContain('rose');
  });

  it('falls back to index-based cycling when theme.color is not set', () => {
    const theme = { id: 't1', name: 'Test' };
    const result = getThemeColorClasses(theme, 0);
    expect(result.key).toBe('blue');
  });

  it('cycles index-based colors beyond palette length', () => {
    const theme = { id: 't1', name: 'Test' };
    const result = getThemeColorClasses(theme, 8);
    expect(result.key).toBe('blue'); // wraps to index 0
  });

  it('falls back to index when theme.color is invalid', () => {
    const theme = { id: 't1', name: 'Test', color: 'nonexistent' };
    const result = getThemeColorClasses(theme, 2);
    expect(result.key).toBe('violet'); // index 2
  });

  it('handles null/undefined theme gracefully', () => {
    expect(getThemeColorClasses(null, 0).key).toBe('blue');
    expect(getThemeColorClasses(undefined, 3).key).toBe('rose');
  });
});
