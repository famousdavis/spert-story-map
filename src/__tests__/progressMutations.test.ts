// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { updateProgress, removeProgress, updateComment, calculateNextSprintEndDate, describeAllocationWarnings } from '../lib/progressMutations';
import type { Product, ProductUpdater, Theme, Backbone, RibItem, ProgressEntry, ReleaseAllocation, Sprint } from '../types';
import { req } from './testHelpers';

function makeProduct({ themes = [] }: { themes?: Theme[] } = {}): Product {
  return {
    id: 'p1',
    name: 'Test Product',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 2,
    releases: [],
    sprints: [],
    themes,
    sizeMapping: [],
  };
}

function makeRib(id: string, progressHistory: ProgressEntry[] = []): RibItem {
  return {
    id,
    name: `Rib ${id}`,
    description: '',
    releaseAllocations: [],
    size: null,
    category: 'core',
    order: 1,
    progressHistory,
  };
}

function makeBackbone(id: string, ribs: RibItem[] = []): Backbone {
  return { id, name: `Backbone ${id}`, ribItems: ribs, order: 1 };
}

function makeTheme(id: string, backbones: Backbone[] = []): Theme {
  return { id, name: `Theme ${id}`, backboneItems: backbones, order: 1 };
}

function captureProgressUpdate(
  mutationFn: (update: (updater: ProductUpdater) => void) => void,
  product: Product,
): Product {
  let result: Product | undefined;
  const fakeUpdate = (updater: ProductUpdater) => {
    result = typeof updater === 'function' ? updater(product) : updater;
  };
  mutationFn(fakeUpdate);
  if (!result) throw new Error('captureProgressUpdate: mutation never called updateProduct');
  return result;
}

// --- updateProgress ---
describe('updateProgress', () => {
  it('creates a new progress entry', () => {
    const rib = makeRib('r1');
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => updateProgress(update, 'r1', 'rel-A', 'sp-1', 50),
      product,
    );

    const history = req(result.themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory, 'history');
    expect(history).toHaveLength(1);
    expect(history[0]?.sprintId).toBe('sp-1');
    expect(history[0]?.releaseId).toBe('rel-A');
    expect(history[0]?.percentComplete).toBe(50);
    expect(history[0]?.comment).toBe('');
    expect(history[0]?.updatedAt).toBeDefined();
  });

  it('updates an existing progress entry', () => {
    const rib = makeRib('r1', [
      { sprintId: 'sp-1', releaseId: 'rel-A', percentComplete: 30, comment: 'note', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => updateProgress(update, 'r1', 'rel-A', 'sp-1', 75),
      product,
    );

    const history = req(result.themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory, 'history');
    expect(history).toHaveLength(1);
    expect(history[0]?.percentComplete).toBe(75);
    expect(history[0]?.comment).toBe('note'); // preserved
  });

  it('does nothing when sprintId is falsy', () => {
    let called = false;
    const fakeUpdate = () => { called = true; };
    updateProgress(fakeUpdate, 'r1', 'rel-A', null, 50);
    expect(called).toBe(false);
  });

  it('does not modify other ribs', () => {
    const r1 = makeRib('r1', [{ sprintId: 'sp-1', releaseId: 'rel-A', percentComplete: 10, comment: '' }]);
    const r2 = makeRib('r2');
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [r1, r2])])],
    });

    const result = captureProgressUpdate(
      (update) => updateProgress(update, 'r1', 'rel-A', 'sp-1', 80),
      product,
    );

    expect(result.themes[0]?.backboneItems[0]?.ribItems[1]?.progressHistory).toHaveLength(0);
  });
});

// --- removeProgress ---
describe('removeProgress', () => {
  it('removes an entry with no comment', () => {
    const rib = makeRib('r1', [
      { sprintId: 'sp-1', releaseId: 'rel-A', percentComplete: 50, comment: '' },
    ]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => removeProgress(update, 'r1', 'rel-A', 'sp-1'),
      product,
    );

    expect(result.themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory).toHaveLength(0);
  });

  it('zeros percent but preserves entry with comment', () => {
    const rib = makeRib('r1', [
      { sprintId: 'sp-1', releaseId: 'rel-A', percentComplete: 50, comment: 'keep me' },
    ]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => removeProgress(update, 'r1', 'rel-A', 'sp-1'),
      product,
    );

    const history = req(result.themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory, 'history');
    expect(history).toHaveLength(1);
    expect(history[0]?.percentComplete).toBeNull();
    expect(history[0]?.comment).toBe('keep me');
  });

  it('is a no-op when entry does not exist', () => {
    const rib = makeRib('r1');
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => removeProgress(update, 'r1', 'rel-A', 'sp-1'),
      product,
    );

    // When updater returns null, rib is unchanged
    expect(result.themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory).toHaveLength(0);
  });

  it('does nothing when sprintId is falsy', () => {
    let called = false;
    const fakeUpdate = () => { called = true; };
    removeProgress(fakeUpdate, 'r1', 'rel-A', '');
    expect(called).toBe(false);
  });
});

// --- updateComment ---
describe('updateComment', () => {
  it('adds a comment to existing entry', () => {
    const rib = makeRib('r1', [
      { sprintId: 'sp-1', releaseId: 'rel-A', percentComplete: 50, comment: '' },
    ]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => updateComment(update, 'r1', 'rel-A', 'sp-1', 'looking good'),
      product,
    );

    const history = req(result.themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory, 'history');
    expect(history).toHaveLength(1);
    expect(history[0]?.comment).toBe('looking good');
    expect(history[0]?.percentComplete).toBe(50); // preserved
  });

  it('creates an entry with null percentComplete when none exists', () => {
    const rib = makeRib('r1');
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => updateComment(update, 'r1', 'rel-A', 'sp-1', 'comment only'),
      product,
    );

    const history = req(result.themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory, 'history');
    expect(history).toHaveLength(1);
    expect(history[0]?.percentComplete).toBeNull();
    expect(history[0]?.comment).toBe('comment only');
    expect(history[0]?.sprintId).toBe('sp-1');
    expect(history[0]?.releaseId).toBe('rel-A');
  });

  it('does nothing when sprintId is falsy', () => {
    let called = false;
    const fakeUpdate = () => { called = true; };
    updateComment(fakeUpdate, 'r1', 'rel-A', null, 'test');
    expect(called).toBe(false);
  });
});

// --- calculateNextSprintEndDate ---
describe('a write keeps one entry per (sprint, release)', () => {
  const dup = (first: Partial<ProgressEntry>, shadowed: Partial<ProgressEntry>): ProgressEntry[] => [
    { sprintId: 's1', releaseId: 'r1', percentComplete: 10, ...first },
    { sprintId: 's2', releaseId: 'r1', percentComplete: 40 },
    { sprintId: 's1', releaseId: 'r1', percentComplete: 30, ...shadowed },
    { sprintId: 's1', releaseId: 'r2', percentComplete: 5 },
  ];
  const product = (history: ProgressEntry[]) => makeProduct({
    themes: [makeTheme('t1', [makeBackbone('b1', [makeRib('rib-1', history)])])],
  });
  const after = (p: Product, write: (update: (updater: ProductUpdater) => void) => void) =>
    captureProgressUpdate(write, p).themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory ?? [];

  it('updateProgress collapses the pair and leaves other pairs alone', () => {
    const history = after(product(dup({}, {})), u => updateProgress(u, 'rib-1', 'r1', 's1', 20));
    expect(history.map(e => [e.sprintId, e.releaseId, e.percentComplete])).toEqual([['s1', 'r1', 20], ['s2', 'r1', 40], ['s1', 'r2', 5]]);
  });

  it('removeProgress on a first entry cannot resurface a shadowed one', () => {
    const history = after(product(dup({}, {})), u => removeProgress(u, 'rib-1', 'r1', 's1'));
    expect(history.filter(e => e.sprintId === 's1' && e.releaseId === 'r1')).toEqual([]);
  });

  it('updateComment collapses too', () => {
    const history = after(product(dup({}, {})), u => updateComment(u, 'rib-1', 'r1', 's1', 'new'));
    expect(history.filter(e => e.sprintId === 's1' && e.releaseId === 'r1')).toMatchObject([{ percentComplete: 10, comment: 'new' }]);
  });

  it('keeps the first non-empty comment, wherever it sat', () => {
    const history = after(product(dup({ comment: '' }, { comment: 'only here' })), u => updateProgress(u, 'rib-1', 'r1', 's1', 20));
    expect(history[0]).toMatchObject({ percentComplete: 20, comment: 'only here' });
    const first = after(product(dup({ comment: 'first' }, { comment: 'second' })), u => updateProgress(u, 'rib-1', 'r1', 's1', 20));
    expect(first[0]).toMatchObject({ comment: 'first' });
  });

  it('a kept comment means a removal nulls the value rather than deleting it', () => {
    const history = after(product(dup({ comment: '' }, { comment: 'keep me' })), u => removeProgress(u, 'rib-1', 'r1', 's1'));
    expect(history.filter(e => e.sprintId === 's1' && e.releaseId === 'r1')).toMatchObject([{ percentComplete: null, comment: 'keep me' }]);
  });

  it('finds the pair wherever it sits in the history', () => {
    const later: ProgressEntry[] = [
      { sprintId: 's9', releaseId: 'r9', percentComplete: 70 },
      { sprintId: 's1', releaseId: 'r1', percentComplete: 10 },
      { sprintId: 's1', releaseId: 'r1', percentComplete: 30 },
    ];
    expect(after(product(later), u => updateProgress(u, 'rib-1', 'r1', 's1', 20)).map(e => e.percentComplete)).toEqual([70, 20]);
  });

  it('writes to a rib with no history at all', () => {
    const bare = product([]);
    delete (req(bare.themes[0]?.backboneItems[0]?.ribItems[0], 'rib') as Partial<RibItem>).progressHistory;
    expect(after(bare, u => updateProgress(u, 'rib-1', 'r1', 's1', 20))).toHaveLength(1);
  });

  it('leaves a history with no duplicates exactly as it was, bar the write', () => {
    const clean: ProgressEntry[] = [{ sprintId: 's1', releaseId: 'r1', percentComplete: 10 }, { sprintId: 's2', releaseId: 'r1', percentComplete: 40 }];
    expect(after(product(clean), u => updateProgress(u, 'rib-1', 'r1', 's2', 50)).map(e => e.percentComplete)).toEqual([10, 50]);
  });
});

describe('describeAllocationWarnings', () => {
  const sprints: Sprint[] = ['s1', 's2'].map((id, i) => ({ id, name: id, order: i + 1, endDate: null }));
  const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });
  const at = (sprintId: string, releaseId: string, percentComplete: number | null, comment = ''): ProgressEntry => ({ sprintId, releaseId, percentComplete, comment });
  const warn = (allocations: ReleaseAllocation[], history: ProgressEntry[], next: ReleaseAllocation[]) =>
    describeAllocationWarnings({ releaseAllocations: allocations, progressHistory: history }, next, sprints);

  it('says nothing when nothing changes for progress', () => {
    expect(warn([on('r1')], [at('s1', 'r1', 50)], [on('r1')])).toEqual([]);
    expect(warn([on('r1')], [], [])).toEqual([]);
  });

  it('names a removed release holding a record', () => {
    expect(warn([on('r1', 50), on('r2', 50)], [at('s1', 'r1', 20)], [on('r2', 50)]))
      .toEqual([{ kind: 'stops-counting', releaseId: 'r1' }]);
  });

  it('names a removed release holding only a comment', () => {
    expect(warn([on('r1', 50), on('r2', 50)], [at('s1', 'r1', null, 'note')], [on('r2', 50)]))
      .toEqual([{ kind: 'stops-counting', releaseId: 'r1' }]);
  });

  it('does not name a removed release for a record on another release', () => {
    expect(warn([on('r1', 50), on('r2', 50)], [at('s1', 'r2', 20)], [on('r2', 50)])).toEqual([]);
  });

  it('reads a rib with no history as having nothing to say', () => {
    const bare = { releaseAllocations: [on('r1')] } as RibItem;
    expect(describeAllocationWarnings(bare, [], sprints)).toEqual([]);
    expect(describeAllocationWarnings(bare, [on('r2')], sprints)).toEqual([]);
  });

  it('does not name a removed release with a 0, a null, or a record for a sprint that is gone', () => {
    expect(warn([on('r1', 50), on('r2', 50)], [at('s1', 'r1', 0), at('s2', 'r1', null), at('gone', 'r1', 50)], [on('r2', 50)])).toEqual([]);
  });

  it('names each release Unassign All would drop', () => {
    expect(warn([on('r1', 50), on('r2', 50)], [at('s1', 'r1', 20), at('s1', 'r2', 10)], []))
      .toEqual([{ kind: 'stops-counting', releaseId: 'r1' }, { kind: 'stops-counting', releaseId: 'r2' }]);
  });

  it('treats a row typed down to 0 as removed', () => {
    expect(warn([on('r1', 50), on('r2', 50)], [at('s1', 'r1', 20)], [on('r1', 0), on('r2', 50)]))
      .toEqual([{ kind: 'stops-counting', releaseId: 'r1' }]);
  });

  it('says nothing about the source of a move: the records carry', () => {
    expect(warn([on('r1')], [at('s1', 'r1', 20)], [on('r2')])).toEqual([]);
  });

  it('names a kept release whose records exceed its new percentage', () => {
    expect(warn([on('r1')], [at('s1', 'r1', 80)], [on('r1', 50)]))
      .toEqual([{ kind: 'capped', releaseId: 'r1', recorded: 80, counted: 50 }]);
  });

  it('does not name a kept release at or below its percentage', () => {
    expect(warn([on('r1')], [at('s1', 'r1', 50)], [on('r1', 50)])).toEqual([]);
  });

  it('names a move\'s target when the carried records exceed its percentage', () => {
    expect(warn([on('r1')], [at('s1', 'r1', 80)], [on('r2', 50)]))
      .toEqual([{ kind: 'capped', releaseId: 'r2', recorded: 80, counted: 50 }]);
  });

  it('names a move\'s target when its own old records count again above the percentage', () => {
    expect(warn([on('r1')], [at('s1', 'r2', 80)], [on('r2', 50)]))
      .toEqual([{ kind: 'capped', releaseId: 'r2', recorded: 80, counted: 50 }]);
  });

  it('does not name a release merely added, which keeps no record of the rib', () => {
    expect(warn([on('r1', 50)], [at('s1', 'r2', 80)], [on('r1', 50), on('r2', 30)])).toEqual([]);
  });
});

describe('calculateNextSprintEndDate', () => {
  it('adds cadence weeks to the last end date', () => {
    expect(calculateNextSprintEndDate('2026-01-01', 2)).toBe('2026-01-15');
  });

  it('handles single week cadence', () => {
    expect(calculateNextSprintEndDate('2026-02-01', 1)).toBe('2026-02-08');
  });

  // W4: this runs inside an updateProduct updater, which React evaluates during
  // render — a RangeError from toISOString took the whole app down on "Add sprint".
  it('returns null, not a RangeError, when the last end date cannot be read', () => {
    expect(calculateNextSprintEndDate('2026-01-01T09:00', 2)).toBeNull();
    expect(calculateNextSprintEndDate('not a date', 2)).toBeNull();
    expect(calculateNextSprintEndDate('2026-01-01', 1e15)).toBeNull();
  });

  it('handles month boundary', () => {
    expect(calculateNextSprintEndDate('2026-01-28', 1)).toBe('2026-02-04');
  });

  it('returns null when lastEndDate is falsy', () => {
    expect(calculateNextSprintEndDate(null, 2)).toBeNull();
    expect(calculateNextSprintEndDate('', 2)).toBeNull();
  });
});
