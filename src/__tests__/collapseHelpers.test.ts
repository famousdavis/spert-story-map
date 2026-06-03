// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { stripOrphans, bulkNextCollapsed, pruneSelection } from '../components/storymap/collapseHelpers';

describe('stripOrphans', () => {
  it('drops ids not present in the valid set', () => {
    expect(stripOrphans(['a', 'b', 'c'], new Set(['a', 'c']))).toEqual(['a', 'c']);
  });
  it('keeps all when every id is valid', () => {
    expect(stripOrphans(['a', 'b'], new Set(['a', 'b']))).toEqual(['a', 'b']);
  });
  it('returns empty for empty input', () => {
    expect(stripOrphans([], new Set(['a']))).toEqual([]);
  });
});

describe('bulkNextCollapsed', () => {
  it('collapses all when none are collapsed', () => {
    expect(bulkNextCollapsed(['r1', 'r2'], [])).toEqual(['r1', 'r2']);
  });
  it('collapses all when only some are collapsed', () => {
    expect(bulkNextCollapsed(['r1', 'r2', 'r3'], ['r2'])).toEqual(['r1', 'r2', 'r3']);
  });
  it('expands all when every release is already collapsed', () => {
    expect(bulkNextCollapsed(['r1', 'r2'], ['r1', 'r2'])).toEqual([]);
  });
  it('treats a current set containing all release ids (plus stale) as fully collapsed → expand', () => {
    expect(bulkNextCollapsed(['r1'], ['r1', 'stale'])).toEqual([]);
  });
  it('vacuous case: zero releases always yields expand ([])', () => {
    expect(bulkNextCollapsed([], [])).toEqual([]);
    expect(bulkNextCollapsed([], ['x'])).toEqual([]);
  });
});

describe('pruneSelection', () => {
  it('returns null when every selected id is still visible', () => {
    expect(pruneSelection(new Set(['a', 'b']), new Set(['a', 'b', 'c']))).toBeNull();
  });
  it('returns null for an empty selection', () => {
    expect(pruneSelection(new Set<string>(), new Set(['a']))).toBeNull();
  });
  it('prunes ids that are no longer visible', () => {
    const result = pruneSelection(new Set(['a', 'b', 'c']), new Set(['a', 'c']));
    expect(result).not.toBeNull();
    expect([...result!].sort()).toEqual(['a', 'c']);
  });
  it('prunes to empty when nothing is visible', () => {
    const result = pruneSelection(new Set(['a']), new Set<string>());
    expect(result).not.toBeNull();
    expect([...result!]).toEqual([]);
  });
});
