// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import {
  deleteReleaseFromProduct, deleteSprintFromProduct, RELEASE_RECORDS_LINE, releaseDeleteMessage, releaseHasAllocations, releaseHoldsRecords,
  SPRINT_RECORDS_LINE, sprintHoldsRecords,
} from '../lib/settingsMutations';
import { req } from './testHelpers';
import type { Product, RibItem } from '../types';

// Annotated `Product`: the deletion helpers under test take a full Product, and
// the omitted scalars (descriptions, orders, sizes, dates) play no part in what
// they do — release/sprint removal, card-order cleanup, progress pruning.
function makeProduct(): Product {
  return {
    id: 'p1',
    name: 'Test Product',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 2,
    sprintCadenceWeeks: 2,
    sizeMapping: [{ label: 'M', points: 3 }],
    releases: [
      { id: 'rel-1', name: 'Release 1', description: '', order: 1, targetDate: null },
      { id: 'rel-2', name: 'Release 2', description: '', order: 2, targetDate: null },
      { id: 'rel-3', name: 'Release 3', description: '', order: 3, targetDate: null },
    ],
    sprints: [
      { id: 'sp-1', name: 'Sprint 1', order: 1, endDate: null },
      { id: 'sp-2', name: 'Sprint 2', order: 2, endDate: null },
    ],
    releaseCardOrder: {
      'rel-1': ['rib-1', 'rib-2'],
      'rel-2': ['rib-3'],
      'unassigned': ['rib-4'],
    },
    themes: [{
      id: 't1', name: 'Theme', order: 1,
      backboneItems: [{
        id: 'b1', name: 'Backbone', description: '', order: 1,
        ribItems: [
          {
            id: 'rib-1', name: 'Rib 1', description: '', order: 1, size: 'M', category: 'core',
            releaseAllocations: [{ releaseId: 'rel-1', percentage: 60 }, { releaseId: 'rel-2', percentage: 40 }],
            progressHistory: [
              { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 30 },
              { sprintId: 'sp-1', releaseId: 'rel-2', percentComplete: 20 },
              { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 50 },
            ],
          },
          {
            id: 'rib-2', name: 'Rib 2', description: '', order: 2, size: 'M', category: 'core',
            releaseAllocations: [{ releaseId: 'rel-1', percentage: 100 }],
            progressHistory: [
              { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 100 },
            ],
          },
          {
            id: 'rib-3', name: 'Rib 3', description: '', order: 3, size: 'M', category: 'core',
            releaseAllocations: [{ releaseId: 'rel-2', percentage: 100 }],
            progressHistory: [
              { sprintId: 'sp-2', releaseId: 'rel-2', percentComplete: 50 },
            ],
          },
          {
            id: 'rib-4', name: 'Rib 4', description: '', order: 4, size: null, category: 'core',
            releaseAllocations: [],
            progressHistory: [],
          },
        ],
      }],
    }],
  };
}

describe('releaseHasAllocations', () => {
  it('returns true when ribs reference the release', () => {
    expect(releaseHasAllocations(makeProduct(), 'rel-1')).toBe(true);
  });

  it('returns false when no ribs reference the release', () => {
    expect(releaseHasAllocations(makeProduct(), 'rel-3')).toBe(false);
  });

  it('returns false for non-existent release', () => {
    expect(releaseHasAllocations(makeProduct(), 'nope')).toBe(false);
  });
});

describe('deleteReleaseFromProduct', () => {
  it('removes the release and re-indexes order', () => {
    const result = deleteReleaseFromProduct(makeProduct(), 'rel-2');
    expect(result.releases).toEqual([
      { id: 'rel-1', name: 'Release 1', description: '', order: 1, targetDate: null },
      { id: 'rel-3', name: 'Release 3', description: '', order: 2, targetDate: null },
    ]);
  });

  it('removes the release column from releaseCardOrder', () => {
    const result = deleteReleaseFromProduct(makeProduct(), 'rel-2');
    expect(result.releaseCardOrder).toEqual({
      'rel-1': ['rib-1', 'rib-2'],
      'unassigned': ['rib-4'],
    });
  });

  it('removes matching allocations from all ribs', () => {
    const result = deleteReleaseFromProduct(makeProduct(), 'rel-1');
    const ribs = req(result.themes[0]?.backboneItems[0]?.ribItems, 'ribs');
    // rib-1 had rel-1 + rel-2 allocations; rel-1 removed
    expect(ribs[0]?.releaseAllocations).toEqual([{ releaseId: 'rel-2', percentage: 40 }]);
    // rib-2 had only rel-1 allocation; now empty
    expect(ribs[1]?.releaseAllocations).toEqual([]);
    // rib-3 unaffected (only rel-2)
    expect(ribs[2]?.releaseAllocations).toEqual([{ releaseId: 'rel-2', percentage: 100 }]);
  });

  it('removes matching progressHistory entries', () => {
    const result = deleteReleaseFromProduct(makeProduct(), 'rel-1');
    const ribs = req(result.themes[0]?.backboneItems[0]?.ribItems, 'ribs');
    // rib-1: had 3 entries, 2 for rel-1 removed
    expect(ribs[0]?.progressHistory).toEqual([
      { sprintId: 'sp-1', releaseId: 'rel-2', percentComplete: 20 },
    ]);
    // rib-2: had 1 entry for rel-1, now empty
    expect(ribs[1]?.progressHistory).toEqual([]);
  });

  it('does not mutate the original product', () => {
    const original = makeProduct();
    const originalJSON = JSON.stringify(original);
    deleteReleaseFromProduct(original, 'rel-1');
    expect(JSON.stringify(original)).toBe(originalJSON);
  });

  it('handles product with no releaseCardOrder', () => {
    const p = makeProduct();
    delete p.releaseCardOrder;
    const result = deleteReleaseFromProduct(p, 'rel-1');
    expect(result.releaseCardOrder).toEqual({});
  });
});

describe('deleteSprintFromProduct', () => {
  it('removes the sprint and re-indexes order', () => {
    const result = deleteSprintFromProduct(makeProduct(), 'sp-1');
    expect(result.sprints).toEqual([
      { id: 'sp-2', name: 'Sprint 2', order: 1, endDate: null },
    ]);
  });

  it('removes matching progressHistory entries', () => {
    const result = deleteSprintFromProduct(makeProduct(), 'sp-1');
    const ribs = req(result.themes[0]?.backboneItems[0]?.ribItems, 'ribs');
    // rib-1: had 3 entries, 2 for sp-1 removed
    expect(ribs[0]?.progressHistory).toEqual([
      { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 50 },
    ]);
    // rib-2: had 1 entry for sp-1, now empty
    expect(ribs[1]?.progressHistory).toEqual([]);
    // rib-3: had 1 entry for sp-2, unaffected
    expect(ribs[2]?.progressHistory).toEqual([
      { sprintId: 'sp-2', releaseId: 'rel-2', percentComplete: 50 },
    ]);
  });

  it('does not mutate the original product', () => {
    const original = makeProduct();
    const originalJSON = JSON.stringify(original);
    deleteSprintFromProduct(original, 'sp-1');
    expect(JSON.stringify(original)).toBe(originalJSON);
  });
});

describe('releaseHoldsRecords', () => {
  const withHistory = (progressHistory: unknown): Product => {
    const p = makeProduct();
    const [rib] = p.themes[0]?.backboneItems[0]?.ribItems ?? [];
    req(rib, 'rib').progressHistory = progressHistory as never;
    return p;
  };
  const at = (percentComplete: number | null, comment = '', sprintId = 's1', releaseId = 'r9') => ({ sprintId, releaseId, percentComplete, comment });

  it('sees a value, a typed 0, a comment and an entry for an unknown sprint', () => {
    expect(releaseHoldsRecords(withHistory([at(30)]), 'r9')).toBe(true);
    expect(releaseHoldsRecords(withHistory([at(0)]), 'r9')).toBe(true);
    expect(releaseHoldsRecords(withHistory([at(null, 'note')]), 'r9')).toBe(true);
    expect(releaseHoldsRecords(withHistory([at(30, '', 'gone')]), 'r9')).toBe(true);
  });

  it('does not see an empty null entry, another release, or no history', () => {
    expect(releaseHoldsRecords(withHistory([at(null)]), 'r9')).toBe(false);
    expect(releaseHoldsRecords(withHistory([at(30)]), 'r8')).toBe(false);
    expect(releaseHoldsRecords(withHistory(undefined), 'r9')).toBe(false);
  });

  it('says what the delete takes, in these words', () => {
    expect(RELEASE_RECORDS_LINE).toBe('Recorded progress and notes for this release are deleted too.');
    expect(SPRINT_RECORDS_LINE).toBe('Recorded progress and notes for this sprint are deleted too.');
  });

  it('finds a record in any theme or backbone, not only when all of them hold one', () => {
    const theme = (id: string, ribItems: RibItem[]) => ({ id, name: id, order: 1, backboneItems: [
      { id: `${id}-empty`, name: 'E', order: 1, ribItems: [] },
      { id: `${id}-b`, name: 'B', order: 2, ribItems },
    ] });
    const rib = req(makeProduct().themes[0]?.backboneItems[0]?.ribItems[0], 'rib');
    const product = { ...makeProduct(), themes: [
      theme('none', []),
      theme('held', [{ ...rib, progressHistory: [at(30)] }]),
    ] };
    expect(releaseHoldsRecords(product, 'r9')).toBe(true);
    expect(sprintHoldsRecords(product, 's1')).toBe(true);
  });

  it('sprintHoldsRecords asks the same of a sprint, in any release', () => {
    expect(sprintHoldsRecords(withHistory([at(30)]), 's1')).toBe(true);
    expect(sprintHoldsRecords(withHistory([at(0, '', 's1', 'gone')]), 's1')).toBe(true);
    expect(sprintHoldsRecords(withHistory([at(null, 'note')]), 's1')).toBe(true);
    expect(sprintHoldsRecords(withHistory([at(null)]), 's1')).toBe(false);
    expect(sprintHoldsRecords(withHistory([at(30)]), 's2')).toBe(false);
    expect(sprintHoldsRecords(withHistory(undefined), 's1')).toBe(false);
  });

  it('builds a message with the line only when it applies, and an empty lead leaves no gap', () => {
    expect(releaseDeleteMessage('Lead.', withHistory([at(30)]), 'r9')).toBe(`Lead. ${RELEASE_RECORDS_LINE}`);
    expect(releaseDeleteMessage('Lead.', withHistory([]), 'r9')).toBe('Lead.');
    expect(releaseDeleteMessage('', withHistory([at(30)]), 'r9')).toBe(RELEASE_RECORDS_LINE);
  });
});

describe('a rib with no progress list', () => {
  const firstRib = (p: Product) => req(p.themes[0]?.backboneItems[0]?.ribItems[0], 'rib');
  const bare = () => {
    const p = makeProduct();
    delete (firstRib(p) as Partial<RibItem>).progressHistory;
    return p;
  };

  it('does not stop a release being deleted, and gains no key', () => {
    const p = bare();
    const releaseId = req(p.releases[0], 'release').id;
    const next = deleteReleaseFromProduct(p, releaseId);
    expect(next.releases.map(r => r.id)).not.toContain(releaseId);
    expect('progressHistory' in firstRib(next)).toBe(false);
    expect(firstRib(next).releaseAllocations.map(a => a.releaseId)).not.toContain(releaseId);
  });

  it('does not stop a sprint being deleted, and gains no key', () => {
    const p = bare();
    const sprintId = req(p.sprints[0], 'sprint').id;
    const next = deleteSprintFromProduct(p, sprintId);
    expect(next.sprints.map(s => s.id)).not.toContain(sprintId);
    expect('progressHistory' in firstRib(next)).toBe(false);
  });
});

// ─── The size list (v0.55.8) ───────────────────────────────────────

import {
  addBackSizeToProduct, addSizeToProduct, orphanLabels, removeSizeDecision, removeSizeFromProduct, renameSizeInProduct,
  setSizePointsInProduct, sizeLabelProblem, sizeUsage,
} from '../lib/settingsMutations';
import { entry, makeProduct as makeRibProduct, makeRib, ribOf } from './fixtures/progressIntegrity';
import type { Size, SizeMapping } from '../types';

describe('size list transforms', () => {
  const ON = [{ releaseId: 'R1', percentage: 100 }];
  const lockedRib = (id: string, size: string) => makeRib(id, ON, [entry('S1', 'R1', 10)], size as Size);
  const freeRib = (id: string, size: string) => makeRib(id, ON, [], size as Size);
  const sized = (rows: SizeMapping[], ribs: RibItem[], order?: Record<string, string[]>): Product =>
    ({ ...makeRibProduct(ribs), sizeMapping: rows, ...(order ? { sizingCardOrder: order } : {}) });
  const rows = (...pairs: [string, number][]) => pairs.map(([label, points]) => ({ label, points }));

  it('rename carries items and merges the card order ahead of stale ids, with no id twice', () => {
    const prev = sized(rows(['M', 20], ['L', 40]), [freeRib('a', 'M'), freeRib('b', 'M'), freeRib('c', 'L')],
      { M: ['b', 'a'], Big: ['z', 'a'], unsized: ['u'] });
    const next = renameSizeInProduct(prev, 0, 'M', '  Big ');
    expect(next.sizeMapping.map(r => r.label)).toEqual(['Big', 'L']);
    expect(['a', 'b', 'c'].map(id => ribOf(next, id).size)).toEqual(['Big', 'Big', 'L']);
    expect(next.sizingCardOrder).toEqual({ Big: ['b', 'a', 'z'], unsized: ['u'] });
    expect(prev.sizeMapping[0]).toEqual({ label: 'M', points: 20 });
  });

  it('rename revives items already on the new label, and allows a case-only change of the same row', () => {
    const prev = sized(rows(['M', 20]), [freeRib('a', 'M'), lockedRib('o', 'm')]);
    const next = renameSizeInProduct(prev, 0, 'M', 'm');
    expect(['a', 'o'].map(id => ribOf(next, id).size)).toEqual(['m', 'm']);
    expect(next.sizeMapping).toEqual([{ label: 'm', points: 20 }]);
  });

  it('rename never moves the unsized key, and a shadowed row changes alone', () => {
    const legacy = sized(rows(['unsized', 5]), [freeRib('a', 'unsized')], { unsized: ['a'] });
    expect(renameSizeInProduct(legacy, 0, 'unsized', 'U').sizingCardOrder).toEqual({ unsized: ['a'] });
    const dup = sized(rows(['M', 20], ['M', 50]), [freeRib('a', 'M')], { M: ['a'] });
    const next = renameSizeInProduct(dup, 1, 'M', 'Big');
    expect([next.sizeMapping.map(r => r.label), ribOf(next, 'a').size, next.sizingCardOrder]).toEqual([['M', 'Big'], 'M', { M: ['a'] }]);
  });

  it('a label such as constructor is renamed and removed without throwing', () => {
    const prev = sized(rows(['constructor', 3], ['__proto__', 4]), [freeRib('a', 'constructor')], {});
    const renamed = renameSizeInProduct(prev, 0, 'constructor', 'toString');
    expect(ribOf(renamed, 'a').size).toBe('toString');
    expect(Object.keys(renamed.sizingCardOrder ?? {})).toEqual([]);
    const removed = removeSizeFromProduct(renameSizeInProduct(prev, 1, '__proto__', 'hasOwnProperty'), 1, 'hasOwnProperty');
    expect(removed.sizeMapping.map(r => r.label)).toEqual(['constructor']);
    expect(removeSizeFromProduct(prev, 0, 'constructor', true).sizeMapping.map(r => r.label)).toEqual(['__proto__']);
  });

  it('a falsy label is used by nothing: not carried, counted or cleared', () => {
    const prev = sized(rows(['', 5], ['L', 40]), [lockedRib('e', ''), freeRib('n', null as unknown as string)]);
    expect(sizeUsage(prev).has('')).toBe(false);
    expect(ribOf(renameSizeInProduct(prev, 0, '', 'XS'), 'e').size).toBe('');
    expect(removeSizeDecision(prev, 0, '')).toEqual({ kind: 'unused', dropKey: true });
    expect(orphanLabels(prev)).toEqual([]);
  });

  it('an unused remove drops its card-order key, never the unsized key', () => {
    const prev = sized(rows(['XS', 5], ['unsized', 1]), [], { XS: ['gone'], unsized: ['u'] });
    expect(removeSizeFromProduct(prev, 0, 'XS').sizingCardOrder).toEqual({ unsized: ['u'] });
    expect(removeSizeFromProduct(prev, 1, 'unsized').sizingCardOrder).toEqual({ XS: ['gone'], unsized: ['u'] });
  });

  it('returns prev on a mismatched expected label, a lock found in the updater, or a confirm not given', () => {
    const prev = sized(rows(['XS', 5], ['M', 20]), [freeRib('a', 'M'), lockedRib('b', 'M')]);
    expect(renameSizeInProduct(prev, 0, 'M', 'Medium')).toBe(prev);
    expect(setSizePointsInProduct(prev, 0, 'M', 30)).toBe(prev);
    expect(removeSizeFromProduct(prev, 0, 'M', true)).toBe(prev);
    expect(removeSizeFromProduct(prev, 1, 'M', true)).toBe(prev);
    const unlocked = sized(rows(['M', 20]), [freeRib('a', 'M')]);
    expect(removeSizeFromProduct(unlocked, 0, 'M')).toBe(unlocked);
    expect(ribOf(removeSizeFromProduct(unlocked, 0, 'M', true), 'a').size).toBeNull();
  });

  it('points: refuses what import refuses, keeps decimals, writes nothing unchanged', () => {
    const prev = sized(rows(['M', 20]), []);
    expect([-1, NaN, Infinity, 20].map(p => setSizePointsInProduct(prev, 0, 'M', p))).toEqual([prev, prev, prev, prev]);
    expect(setSizePointsInProduct(prev, 0, 'M', 0.5).sizeMapping).toEqual([{ label: 'M', points: 0.5 }]);
  });

  it('labels: trimmed, 1-20 characters, not unsized, unique ignoring case', () => {
    const list = rows(['M', 20], ['L', 40]);
    expect(['', ' ', 'x'.repeat(21), 'Unsized', 'l', ' M ', 'Medium'].map(t => sizeLabelProblem(list, 0, t))).toEqual([
      'A size needs a label.', 'A size needs a label.', 'At most 20 characters.', '“unsized” is reserved.',
      '“L” is already in the list.', null, null,
    ]);
  });

  it('Add Size and Add back decide their row inside the updater', () => {
    const prev = sized(rows(['new', 1]), [freeRib('a', 'XL')]);
    const twice = addSizeToProduct(addSizeToProduct(prev));
    expect(twice.sizeMapping.map(r => r.label)).toEqual(['new', 'New 2', 'New 3']);
    const back = addBackSizeToProduct(prev, 'XL');
    expect(addBackSizeToProduct(back, 'XL')).toBe(back);
    expect(addBackSizeToProduct(prev, 'XL ')).toBe(prev);
    const full = sized(Array.from({ length: 20 }, (_, i) => ({ label: `Z${i}`, points: i })), []);
    expect([addSizeToProduct(full), addBackSizeToProduct(full, 'XL')]).toEqual([full, full]);
  });
});
