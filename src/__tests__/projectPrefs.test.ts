// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.56.0 R-1, R-4: the tile colour and archive map's one normaliser, its entries, the cap, and
 * Forecaster's slot rule (`src/lib/projectPrefs.ts`, after SPERT Forecaster's
 * `src/shared/lib/project-prefs.ts` at 09c4cda).
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_PROJECT_PREFS, canHoldPref, hasRoomFor, isArchived, prefEntries, prefOf, reorderShown, sanitizeProjectPrefs, withPref,
  withStoredSlots,
} from '../lib/projectPrefs';
import { REMOVE, isWritablePath } from '../lib/prefEntries';

describe('sanitizeProjectPrefs (R-1)', () => {
  it('keeps the five colours and archived: true, each field on its own', () => {
    expect(sanitizeProjectPrefs({
      a: { color: 'blue', archived: true },
      b: { color: 'red', archived: true },
      c: { color: 'pink', archived: 'yes' },
      d: { color: 'none' },
      e: { archived: false },
      f: 'blue',
      g: null,
      h: ['blue'],
      i: { color: 'teal', extra: 1 },
    })).toEqual({ a: { color: 'blue', archived: true }, b: { archived: true }, c: { color: 'pink' }, i: { color: 'teal' } });
  });

  it.each([null, undefined, 'x', 5, [], [{ color: 'blue' }]])('reads %j as no map', raw => {
    expect(sanitizeProjectPrefs(raw)).toEqual({});
  });

  it('drops every id the settings write refuses, by the write\'s own rule', () => {
    const refused = ['', '__x__', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];
    const raw: Record<string, unknown> = {};
    for (const id of refused) Object.defineProperty(raw, id, { value: { color: 'blue' }, enumerable: true });
    raw['p 1.2'] = { color: 'blue' };
    const out = sanitizeProjectPrefs(raw);
    expect(Object.keys(out)).toEqual(['p 1.2']);
    for (const id of refused) {
      expect(canHoldPref(id)).toBe(false);
      expect(isWritablePath(['projectPrefs', id, 'color']), 'the write refuses it too').toBe(false);
    }
    expect(canHoldPref('p 1.2')).toBe(true);
  });

  it('keeps the first MAX_PROJECT_PREFS valid entries when a stored map holds more', () => {
    const raw: Record<string, unknown> = { bad: { color: 'red' } };
    for (let i = 0; i < MAX_PROJECT_PREFS + 5; i++) raw[`p${i}`] = { archived: true };
    const out = sanitizeProjectPrefs(raw);
    expect(Object.keys(out)).toHaveLength(MAX_PROJECT_PREFS);
    expect(Object.keys(out)[0]).toBe('p0');
    expect(Object.keys(out)[MAX_PROJECT_PREFS - 1]).toBe(`p${MAX_PROJECT_PREFS - 1}`);
    expect(MAX_PROJECT_PREFS).toBe(1000);
  });

  it('never gives a prototype member for an id it does not hold', () => {
    const prefs = sanitizeProjectPrefs({ a: { color: 'blue' } });
    expect(prefOf(prefs, 'constructor')).toEqual({});
    expect(isArchived(prefs, 'toString')).toBe(false);
  });
});

describe('the cap (R-1)', () => {
  const full = () => {
    const raw: Record<string, unknown> = {};
    for (let i = 0; i < MAX_PROJECT_PREFS; i++) raw[`p${i}`] = { color: 'blue' };
    return sanitizeProjectPrefs(raw);
  };
  it('at the cap a product with no entry has no room; one with an entry has', () => {
    expect(hasRoomFor(full(), 'new')).toBe(false);
    expect(hasRoomFor(full(), 'p3')).toBe(true);
    expect(hasRoomFor({}, 'new')).toBe(true);
  });
});

describe('entries (R-1): one per changed field, never the whole map', () => {
  it('sets and removes single fields', () => {
    expect(prefEntries('a', {}, { color: 'teal' })).toEqual([{ path: ['projectPrefs', 'a', 'color'], value: 'teal' }]);
    expect(prefEntries('a', { color: 'teal' }, { color: 'teal', archived: true }))
      .toEqual([{ path: ['projectPrefs', 'a', 'archived'], value: true }]);
    expect(prefEntries('a', { color: 'teal', archived: true }, {}))
      .toEqual([{ path: ['projectPrefs', 'a', 'color'], value: REMOVE }, { path: ['projectPrefs', 'a', 'archived'], value: REMOVE }]);
    expect(prefEntries('a', { color: 'pink' }, { color: 'pink' })).toEqual([]);
  });

  it('withPref sets an entry, and an empty one removes the key', () => {
    expect(withPref({ a: { color: 'blue' } }, 'a', { color: 'blue', archived: true })).toEqual({ a: { color: 'blue', archived: true } });
    expect(withPref({ a: { color: 'blue' }, b: { archived: true } }, 'a', {})).toEqual({ b: { archived: true } });
  });
});

describe('reorderShown, Forecaster\'s slot rule (R-4)', () => {
  it.each([
    [['A', 'H', 'B', 'C'], ['B', 'A', 'C'], ['B', 'H', 'A', 'C']],
    [['A', 'H', 'B', 'C'], ['C', 'A', 'B'], ['C', 'H', 'A', 'B']],
    [['H', 'A', 'B', 'C'], ['C', 'A', 'B'], ['H', 'C', 'A', 'B']],
    [['A', 'B', 'C', 'H'], ['B', 'C', 'A'], ['B', 'C', 'A', 'H']],
    [['A', 'B'], ['B', 'A'], ['B', 'A']],
  ])('%j shown as %j gives %j', (full, shown, want) => {
    expect(reorderShown(full, shown)).toEqual(want);
  });
});

describe('withStoredSlots (R89): the stored order with every id in its slot, then the listed ids it lacks', () => {
  it.each([
    [['X', 'a', 'b'], ['b', 'a', 'c'], ['X', 'a', 'b', 'c']],
    [undefined, ['b', 'a'], ['b', 'a']],
    ['not a list', ['a'], ['a']],
    [['a', 7, null, 'a', 'b'], ['c'], ['a', 'b', 'c']],
  ])('stored %j, listed %j gives %j', (stored, ids, want) => {
    expect(withStoredSlots(stored, ids)).toEqual(want);
  });
});
