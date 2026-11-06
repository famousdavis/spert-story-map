// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { moveRib2D, moveRibs2D } from '../components/storymap/mapMutations';
import { commitRibDrag } from '../components/storymap/mapDragHelpers';
import { computeLayout } from '../components/storymap/useMapLayout';
import { applyCardDrop } from '../hooks/useReleaseDrag';
import { applyAiOp } from '../lib/aiOps';
import { getPointsForRelease, getProjectPercentComplete, getReleasePoints, getRibItemPercentCompleteAsOf, getTotalProjectPoints } from '../lib/calculations';
import { moveRibInProduct } from '../lib/productTransforms';
import { saveRibAllocations, updateProgress } from '../lib/progressMutations';
import { getSprintPct } from '../lib/progressViewHelpers';
import { isRibLocked } from '../lib/ribHelpers';
import type { Product, ReleaseAllocation } from '../types';
import { applyUpdate, completionSeries, entry, makeProduct, makeRib, projectCompleted, ribOf, SPRINTS } from './fixtures/progressIntegrity';
import { asRecord } from './testHelpers';

/**
 * Carry through the real writers. The figures come from three places, and each
 * is there for a reason:
 *
 *  - history, which is what the writer changes;
 *  - `getReleasePoints`, Rule 2, which reads current allocations only, so it is
 *    the app figure that can tell carry from no carry at this release;
 *  - `completionSeries`, the §5 oracle in the fixture.
 *
 * ⚠️ Rule 1 cannot tell them apart: it sums every release in the history, moved
 * or not. An assertion on it alone passes with carry reverted.
 */

type Writer = (product: Product, ribId: string, from: string | null, to: string | null) => Product;

const mapSingle: Writer = (product, ribId, from, to) => applyUpdate(product, update =>
  moveRib2D(update, ribId, { themeId: 't', backboneId: 'b', releaseId: from }, { themeId: 't', backboneId: 'b', releaseId: to, insertIndex: null }));

const mapMultiSelect: Writer = (product, ribId, from, to) => applyUpdate(product, update =>
  moveRibs2D(update, [{ ribId, fromThemeId: 't', fromBackboneId: 'b', fromReleaseId: from }], { themeId: 't', backboneId: 'b', releaseId: to, insertIndex: null }));

const planningDrop: Writer = (product, ribId, from, to) =>
  applyCardDrop(product, { ribId, fromCol: from ?? 'unassigned', targetCol: to ?? 'unassigned', newOrder: [ribId] });

/** The dialog's move: the source row goes, a row for the target arrives at the same percentage. */
const modalSave: Writer = (product, ribId, from, to) => {
  const saved = ribOf(product, ribId).releaseAllocations.map(a => (a.releaseId === from ? { ...a, releaseId: to as string } : a));
  return saveRibAllocations(product, ribId, saved);
};

const dragWriters: [string, Writer][] = [['map, single', mapSingle], ['map, multi-select', mapMultiSelect], ['Release Planning drop', planningDrop]];
const moveWriters: [string, Writer][] = [...dragWriters, ['dialog Save', modalSave]];

const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });
const pointsDone = (product: Product, releaseId: string, sprintId = 'S1') => getReleasePoints(product, releaseId, sprintId).completed;

describe.each(moveWriters)('moves, through %s', (_, move) => {
  it('M1: the rib\'s records and the old records trade releases, and dragging back restores them', () => {
    const start = makeProduct([makeRib('r', [on('X')], [entry('S2', 'X', 20), entry('S3', 'X', 30), entry('S1', 'Y', 10)])]);

    const there = move(start, 'r', 'X', 'Y');
    expect(ribOf(there, 'r').progressHistory).toEqual([entry('S2', 'Y', 20), entry('S3', 'Y', 30), entry('S1', 'X', 10)]);
    expect(completionSeries(ribOf(there, 'r'))).toEqual([0, 20, 30]);
    expect(pointsDone(there, 'Y', 'S3')).toBe(12);

    const back = move(there, 'r', 'Y', 'X');
    expect(JSON.stringify(ribOf(back, 'r').progressHistory)).toBe(JSON.stringify(ribOf(start, 'r').progressHistory));
  });

  it('M2: with nothing recorded, the target\'s old records count again, and the second drag is the recovery', () => {
    const start = makeProduct([makeRib('r', [on('X')], [entry('S1', 'Y', 30)])]);

    const there = move(start, 'r', 'X', 'Y');
    expect(ribOf(there, 'r').progressHistory).toBe(ribOf(start, 'r').progressHistory);
    expect(completionSeries(ribOf(there, 'r'))).toEqual([30, 30, 30]);
    expect(pointsDone(there, 'Y')).toBe(12);

    const back = move(there, 'r', 'Y', 'X');
    expect(ribOf(back, 'r').progressHistory).toEqual([entry('S1', 'X', 30)]);
    expect(completionSeries(ribOf(back, 'r'))).toEqual([30, 30, 30]);
  });

  it('M5: 1 typed with a stray 10 on the target reads 1 throughout, never 11', () => {
    const start = makeProduct([makeRib('r', [on('R3')], [entry('S1', 'R2', 10), entry('S1', 'R3', 1)])]);

    const there = move(start, 'r', 'R3', 'R2');
    expect(completionSeries(ribOf(there, 'r'))).toEqual([1, 1, 1]);
    expect(pointsDone(there, 'R2')).toBeCloseTo(0.4);

    const back = move(there, 'r', 'R2', 'R3');
    expect(completionSeries(ribOf(back, 'r'))).toEqual([1, 1, 1]);
    expect(JSON.stringify(ribOf(back, 'r').progressHistory)).toBe(JSON.stringify(ribOf(start, 'r').progressHistory));
  });

  it('M9: 0 typed with a stray 10 on the target reads 0 throughout, byte-identical after', () => {
    const start = makeProduct([makeRib('r', [on('R3')], [entry('S1', 'R2', 10), entry('S1', 'R3', 0)])]);

    const there = move(start, 'r', 'R3', 'R2');
    expect(completionSeries(ribOf(there, 'r'))).toEqual([0, 0, 0]);
    expect(pointsDone(there, 'R2')).toBe(0);

    const back = move(there, 'r', 'R2', 'R3');
    expect(completionSeries(ribOf(back, 'r'))).toEqual([0, 0, 0]);
    expect(JSON.stringify(ribOf(back, 'r').progressHistory)).toBe(JSON.stringify(ribOf(start, 'r').progressHistory));
  });

  it('a split rib keeps its other release\'s records and figures', () => {
    const start = makeProduct([makeRib('r', [on('X', 50), on('W', 50)], [entry('S1', 'X', 20), entry('S1', 'W', 30), entry('S1', 'Y', 5)])]);
    const there = move(start, 'r', 'X', 'Y');
    expect(ribOf(there, 'r').progressHistory).toEqual([entry('S1', 'Y', 20), entry('S1', 'W', 30), entry('S1', 'X', 5)]);
    expect(completionSeries(ribOf(there, 'r'))).toEqual([50, 50, 50]);
  });

  it('does not throw on, or add a key to, a rib with no history', () => {
    const rib = makeRib('r', [on('X')], []);
    delete asRecord(rib).progressHistory;
    const moved = ribOf(move(makeProduct([rib]), 'r', 'X', 'Y'), 'r');
    expect(moved.releaseAllocations.map(a => a.releaseId)).toEqual(['Y']);
    expect('progressHistory' in moved).toBe(false);
  });
});

describe.each(dragWriters)('drags, through %s', (_, drag) => {
  it('M3: dropping a split rib\'s card on its other release is refused, and history is untouched', () => {
    const start = makeProduct([makeRib('r', [on('R1', 50), on('R2', 50)], [entry('S1', 'R1', 20), entry('S1', 'R2', 10)])]);
    const next = drag(start, 'r', 'R1', 'R2');
    expect(ribOf(next, 'r').progressHistory).toBe(ribOf(start, 'r').progressHistory);
    expect(ribOf(next, 'r').releaseAllocations).toBe(ribOf(start, 'r').releaseAllocations);
  });

  it('M4: a parked rib sent elsewhere leaves its record inert', () => {
    const start = makeProduct([makeRib('r', [], [entry('S1', 'R1', 40)])]);
    const next = drag(start, 'r', null, 'R3');
    expect(ribOf(next, 'r').releaseAllocations).toEqual([{ releaseId: 'R3', percentage: 100, memo: '' }]);
    expect(ribOf(next, 'r').progressHistory).toBe(ribOf(start, 'r').progressHistory);
    expect(completionSeries(ribOf(next, 'r'))).toEqual([0, 0, 0]);
    expect(pointsDone(next, 'R3')).toBe(0);
  });

  it('M6: dropping one card of a split rib parks all of it, and returning to one release counts that release only', () => {
    const start = makeProduct([makeRib('r', [on('R1', 50), on('R2', 50)], [entry('S1', 'R1', 20), entry('S1', 'R2', 10)])]);

    const parked = drag(start, 'r', 'R1', null);
    expect(ribOf(parked, 'r').releaseAllocations).toEqual([]);
    expect(ribOf(parked, 'r').progressHistory).toBe(ribOf(start, 'r').progressHistory);
    expect(completionSeries(ribOf(parked, 'r'))).toEqual([0, 0, 0]);

    const returned = drag(parked, 'r', null, 'R1');
    expect(ribOf(returned, 'r').releaseAllocations).toEqual([{ releaseId: 'R1', percentage: 100, memo: '' }]);
    expect(ribOf(returned, 'r').progressHistory).toBe(ribOf(start, 'r').progressHistory);
    expect(completionSeries(ribOf(returned, 'r'))).toEqual([20, 20, 20]);
  });

  it('a stale source, no longer on the rib, promotes nothing', () => {
    const start = makeProduct([makeRib('r', [on('Z')], [entry('S1', 'Z', 40), entry('S1', 'X', 25)])]);
    const next = drag(start, 'r', 'X', 'Y');
    expect(ribOf(next, 'r').progressHistory).toBe(ribOf(start, 'r').progressHistory);
  });

  it('parking and restoring to the same release gets the records back by key', () => {
    const start = makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R1', 30)])]);
    const restored = drag(drag(start, 'r', 'R1', null), 'r', null, 'R1');
    expect(ribOf(restored, 'r').progressHistory).toBe(ribOf(start, 'r').progressHistory);
    expect(completionSeries(ribOf(restored, 'r'))).toEqual([30, 30, 30]);
  });
});

describe('the reported defect, after a real move (§8)', () => {
  const typedAfterMove = (percent: number) => {
    let product = makeProduct([makeRib('r', [on('R2')], [])]);
    product = applyUpdate(product, update => updateProgress(update, 'r', 'R2', 'S1', 10));
    product = mapSingle(product, 'r', 'R2', 'R3');
    product = applyUpdate(product, update => updateProgress(update, 'r', 'R3', 'S1', percent));
    return ribOf(product, 'r');
  };

  it('(a) 10% then 0% in one sprint: every grouping shows 0 and the rib unlocks', () => {
    const rib = typedAfterMove(0);
    expect(rib.progressHistory).toHaveLength(1);
    expect(getSprintPct(rib, 'R3', 'S1')).toBe(0);
    expect(getSprintPct(rib, null, 'S1')).toBe(0);
    expect(getRibItemPercentCompleteAsOf(rib, 'S1', SPRINTS)).toBe(0);
    expect(isRibLocked(rib)).toBe(false);
  });

  it('(b) 10% then 1% in one sprint: 1%, not 11%', () => {
    const rib = typedAfterMove(1);
    expect(rib.progressHistory).toHaveLength(1);
    expect(getSprintPct(rib, 'R3', 'S1')).toBe(1);
    expect(getSprintPct(rib, null, 'S1')).toBe(1);
    expect(getRibItemPercentCompleteAsOf(rib, 'S1', SPRINTS)).toBe(1);
  });
});

describe('§9, row 2, through moveRib2D', () => {
  const walkthrough = () => makeProduct([
    makeRib('a', [on('R1')], [entry('S1', 'R1', 10)]),
    makeRib('b', [on('R1', 50), on('R2', 50)], [entry('S1', 'R1', 20)]),
    makeRib('c', [on('R2', 60)], [entry('S1', 'R2', 30)], 'M'),
    makeRib('d', [], [], 'M'),
  ]);

  it('carries a to R3, which is what the release figures can see', () => {
    const next = mapSingle(walkthrough(), 'a', 'R1', 'R3');
    // These two fail without carry. Every figure below them passes without it.
    expect(ribOf(next, 'a').progressHistory).toEqual([entry('S1', 'R3', 10)]);
    expect(pointsDone(next, 'R3')).toBe(4);

    expect(getTotalProjectPoints(next)).toBe(120);
    expect(projectCompleted(next, 'S1')).toBe(18);
    expect(projectCompleted(next, 'S2')).toBe(18);
    expect(['R1', 'R2', 'R3'].map(id => getPointsForRelease(next, id))).toEqual([20, 32, 40]);
  });
});

describe('§7: carry renames keys and nothing else', () => {
  it('leaves Rule 1 where it was, and raises Rule 2 for the moved rib', () => {
    const start = makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R1', 10), entry('S2', 'R1', 30)])]);
    const next = mapSingle(start, 'r', 'R1', 'R3');
    expect(getProjectPercentComplete(next, 'S2')).toBe(getProjectPercentComplete(start, 'S2'));
    expect(pointsDone(start, 'R1', 'S2')).toBe(12);
    expect(pointsDone(next, 'R3', 'S2')).toBe(12);
  });
});

describe('multi-select', () => {
  it('handles each rib by its own state in one update', () => {
    const start = makeProduct([
      makeRib('revives', [on('X')], [entry('S1', 'Y', 30)]),
      makeRib('swaps', [on('X')], [entry('S1', 'X', 20), entry('S1', 'Y', 5)]),
      makeRib('parked', [], [entry('S1', 'X', 40)]),
      makeRib('split', [on('X', 50), on('Y', 50)], [entry('S1', 'X', 10), entry('S1', 'Y', 15)]),
    ]);
    const entries = ([['revives', 'X'], ['swaps', 'X'], ['parked', null], ['split', 'X']] as const)
      .map(([ribId, fromReleaseId]) => ({ ribId, fromThemeId: 't', fromBackboneId: 'b', fromReleaseId }));

    const next = applyUpdate(start, update => moveRibs2D(update, entries, { themeId: 't', backboneId: 'b', releaseId: 'Y', insertIndex: null }));

    expect(completionSeries(ribOf(next, 'revives'))).toEqual([30, 30, 30]);
    expect(ribOf(next, 'swaps').progressHistory).toEqual([entry('S1', 'Y', 20), entry('S1', 'X', 5)]);
    expect(completionSeries(ribOf(next, 'swaps'))).toEqual([20, 20, 20]);
    expect(ribOf(next, 'parked').progressHistory).toBe(ribOf(start, 'parked').progressHistory);
    expect(completionSeries(ribOf(next, 'parked'))).toEqual([0, 0, 0]);
    expect(ribOf(next, 'split')).toBe(ribOf(start, 'split'));
  });

  it('records follow the allocation the commit moves, for a split rib in a selection', () => {
    // commitRibDrag finds a selected rib by id, so it takes the rib's FIRST cell
    // whichever card was grabbed: a separate, older fault. What matters here is that
    // the records go wherever the allocation goes, so the figures hold regardless.
    const start = makeProduct([
      makeRib('split', [on('R1', 50), on('R2', 50)], [entry('S1', 'R1', 20), entry('S1', 'R2', 30)]),
      makeRib('other', [on('R2')], [entry('S1', 'R2', 10)]),
    ]);
    const state = {
      dragType: 'rib', ribId: 'split', themeId: 't', backboneId: 'b', releaseId: 'R2',
      targetReleaseId: 'R3', targetBackboneId: 'b', targetThemeId: 't', insertIndex: null,
      selectedIds: new Set(['split', 'other']),
    } as unknown as Parameters<typeof commitRibDrag>[0];

    const next = applyUpdate(start, update => commitRibDrag(state, update, computeLayout(start).cells));

    expect(ribOf(next, 'split').releaseAllocations.map(a => a.releaseId)).toEqual(['R2', 'R3']);
    expect(ribOf(next, 'split').progressHistory).toEqual([entry('S1', 'R3', 20), entry('S1', 'R2', 30)]);
    expect(completionSeries(ribOf(next, 'split'))).toEqual([50, 50, 50]);
    expect(ribOf(next, 'other').progressHistory).toEqual([entry('S1', 'R3', 10)]);
  });
});

describe('applyCardDrop', () => {
  const twoRibs = (order: Record<string, string[]>) => makeProduct([
    makeRib('r', [on('X')], [entry('S1', 'X', 10)]),
    makeRib('q', [on('Y')], []),
  ], order);

  it('reorders within a column and touches nothing else', () => {
    const start = twoRibs({ X: ['r'] });
    const next = applyCardDrop(start, { ribId: 'r', fromCol: 'X', targetCol: 'X', newOrder: ['r'] });
    expect(ribOf(next, 'r')).toBe(ribOf(start, 'r'));
    expect(next.releaseCardOrder).toEqual({ X: ['r'] });
  });

  it('takes the card out of the source column and puts it in the target', () => {
    const next = applyCardDrop(twoRibs({ X: ['r'], Y: ['q'] }), { ribId: 'r', fromCol: 'X', targetCol: 'Y', newOrder: ['q', 'r'] });
    expect(next.releaseCardOrder).toEqual({ X: [], Y: ['q', 'r'] });
  });

  it('handles the Unassigned column as a drop, keyed by name in the card order', () => {
    const start = twoRibs({ X: ['r'] });
    const next = applyCardDrop(start, { ribId: 'r', fromCol: 'X', targetCol: 'unassigned', newOrder: ['r'] });
    expect(ribOf(next, 'r').releaseAllocations).toEqual([]);
    expect(ribOf(next, 'r').progressHistory).toBe(ribOf(start, 'r').progressHistory);
    expect(next.releaseCardOrder).toEqual({ X: [], unassigned: ['r'] });
  });

  it('keeps today\'s card order on a refused move', () => {
    const start = makeProduct([makeRib('r', [on('R1', 50), on('R2', 50)], [])], { R1: ['r'], R2: ['r'] });
    const next = applyCardDrop(start, { ribId: 'r', fromCol: 'R1', targetCol: 'R2', newOrder: ['r'] });
    expect(next.releaseCardOrder).toEqual({ R1: [], R2: ['r'] });
  });

  it('copes with a product that has no card order yet', () => {
    const start: Product = { ...twoRibs({}), releaseCardOrder: undefined };
    expect(applyCardDrop(start, { ribId: 'r', fromCol: 'X', targetCol: 'Y', newOrder: ['r'] }).releaseCardOrder).toEqual({ Y: ['r'] });
  });
});

describe('the AI', () => {
  // The lock refuses a rib holding any positive record, so these are what can reach carry at this release.
  const unlocked = () => makeProduct([makeRib('r', [on('X')], [entry('S1', 'X', null, 'vendor is late'), entry('S2', 'X', 0)])]);

  it('move_rib carries zero and comment-only records with the rib', () => {
    const next = applyAiOp(unlocked(), 'move_rib', { ribId: 'r', targetReleaseId: 'Y' });
    expect(ribOf(next, 'r').releaseAllocations).toEqual([on('Y')]);
    expect(ribOf(next, 'r').progressHistory).toEqual([entry('S1', 'Y', null, 'vendor is late'), entry('S2', 'Y', 0)]);
  });

  it('bulk_move_ribs carries too, with one changelog entry for the batch', () => {
    const start = unlocked();
    const before = (start._changeLog ?? []).length;
    const next = applyAiOp(start, 'bulk_move_ribs', { moves: [{ ribId: 'r', targetReleaseId: 'Y' }] });
    expect(ribOf(next, 'r').progressHistory.map(e => e.releaseId)).toEqual(['Y', 'Y']);
    expect((next._changeLog ?? []).length).toBe(before + 1);
  });

  it('a replay is idempotent: same product, no second changelog entry', () => {
    const once = moveRibInProduct(unlocked(), 'r', { targetReleaseId: 'Y' });
    expect(moveRibInProduct(once, 'r', { targetReleaseId: 'Y' })).toBe(once);
  });

  it('carries nothing for a rib coming from Unassigned', () => {
    const start = makeProduct([makeRib('r', [], [entry('S1', 'X', null, 'parked note')])]);
    const next = moveRibInProduct(start, 'r', { targetReleaseId: 'Y' });
    expect(ribOf(next, 'r').releaseAllocations).toEqual([on('Y')]);
    expect(ribOf(next, 'r').progressHistory).toBe(ribOf(start, 'r').progressHistory);
  });

  it('still refuses a locked rib, history untouched', () => {
    const start = makeProduct([makeRib('r', [on('X')], [entry('S1', 'X', 10)])]);
    expect(moveRibInProduct(start, 'r', { targetReleaseId: 'Y' })).toBe(start);
  });

  it('does not throw on, or add a key to, a rib with no history: this runs in the drain path', () => {
    const rib = makeRib('r', [on('X')], []);
    delete asRecord(rib).progressHistory;
    const moved = ribOf(applyAiOp(makeProduct([rib]), 'move_rib', { ribId: 'r', targetReleaseId: 'Y' }), 'r');
    expect(moved.releaseAllocations).toEqual([on('Y')]);
    expect('progressHistory' in moved).toBe(false);
  });
});
