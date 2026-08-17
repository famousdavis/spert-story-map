// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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

  // ⚠️ THIS PINS EVERY CLASS STRING, AND THAT IS THE WHOLE POINT.
  //
  // The three tests above assert the table's STRUCTURE — eight entries, the right
  // property names, unique keys — and never its VALUES. That gap is measurable: the
  // v0.52.0 mutation baseline recorded this file at 83.33% branch coverage and an
  // 11.43% kill rate, because every one of the 32 class strings could be replaced with
  // "" and only ONE (`rose.solid`) was asserted anywhere. Thirty-one silent survivors.
  //
  // It is not a theoretical risk: this palette has already been migrated once
  // (amber -> orange for CARD colours, v0.38.0). A lookup table that nothing pins is
  // exactly where the next migration breaks quietly — every colour still renders, just
  // with no styling.
  //
  // Deliberately a whole-table `toEqual` rather than per-field assertions: it is the
  // cheapest form, it cannot drift out of step with the table's shape, and a diff on
  // failure names the offending colour and field directly.
  it('pins every class string in the table', () => {
    expect(THEME_COLOR_OPTIONS).toEqual([
      {
        key: 'blue',
        solid: 'bg-blue-600',
        light: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
        dot: 'bg-blue-400',
        swatch: 'bg-blue-500',
      },
      {
        key: 'teal',
        solid: 'bg-teal-600',
        light: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
        dot: 'bg-teal-400',
        swatch: 'bg-teal-500',
      },
      {
        key: 'violet',
        solid: 'bg-violet-600',
        light: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
        dot: 'bg-violet-400',
        swatch: 'bg-violet-500',
      },
      {
        key: 'rose',
        solid: 'bg-rose-600',
        light: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
        dot: 'bg-rose-400',
        swatch: 'bg-rose-500',
      },
      {
        key: 'amber',
        solid: 'bg-amber-600',
        light: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
        dot: 'bg-amber-400',
        swatch: 'bg-amber-500',
      },
      {
        key: 'emerald',
        solid: 'bg-emerald-600',
        light: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
        dot: 'bg-emerald-400',
        swatch: 'bg-emerald-500',
      },
      {
        key: 'indigo',
        solid: 'bg-indigo-600',
        light: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
        dot: 'bg-indigo-400',
        swatch: 'bg-indigo-500',
      },
      {
        key: 'orange',
        solid: 'bg-orange-600',
        light: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
        dot: 'bg-orange-400',
        swatch: 'bg-orange-500',
      },
    ]);
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
    // `color: undefined` marks this as a theme WITHOUT a colour. The param is
    // a weak type, so a literal sharing no property with it is rejected outright.
    const theme = { id: 't1', name: 'Test', color: undefined };
    const result = getThemeColorClasses(theme, 0);
    expect(result.key).toBe('blue');
  });

  it('cycles index-based colors beyond palette length', () => {
    // `color: undefined` marks this as a theme WITHOUT a colour. The param is
    // a weak type, so a literal sharing no property with it is rejected outright.
    const theme = { id: 't1', name: 'Test', color: undefined };
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
