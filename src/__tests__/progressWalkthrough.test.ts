// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { moveRibs2D } from '../components/storymap/mapMutations';
import { computeLayout } from '../components/storymap/useMapLayout';
import { buildAiSnapshot } from '../lib/aiSnapshot';
import { getProgressOverTime, getProjectPercentComplete, getProjectTotals, getReleasePercentComplete, getReleasePoints, getSprintSummary, getThemeStats } from '../lib/calculations';
import { buildForecasterExport, checkForecasterExport } from '../lib/exportForForecaster';
import { updateProgress } from '../lib/progressMutations';
import { getCurrentPct, getDelta, getSprintPct } from '../lib/progressViewHelpers';
import { getStrandedRows } from '../lib/reconciliation';
import { isRibLocked } from '../lib/ribHelpers';
import { validateProduct } from '../lib/validateProduct';
import type { Product, ProgressEntry, ReleaseAllocation, RibItem } from '../types';
import {
  applyUpdate, completionSeries, dragRib, entry, makeProduct, makeRib, ribOf, SPRINTS, typeProgress, walkthrough,
} from './fixtures/progressIntegrity';
import { req } from './testHelpers';

/**
 * ⚠️ THE FIGURES IN THESE TESTS ARE HAND-COMPUTED, in §9 of the campaign brief, and
 * they are the check that is independent of the rule. The identity below is not:
 * it holds for any shared per-allocation quantity. "No allocation cap" passes every
 * §9 row and the identity, so the cap and sprint order have goldens of their own.
 */

const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });
const RELEASES = ['R1', 'R2', 'R3'];

interface Row { c1: number; c2: number; remaining: number; allocated: number[]; u: number; o: number }

function expectRow(product: Product, want: Row) {
  const s2 = getProjectTotals(product, 'S2');
  expect(getProjectTotals(product, 'S1').completed).toBeCloseTo(want.c1);
  expect(s2.completed).toBeCloseTo(want.c2);
  expect(s2.total - s2.completed).toBeCloseTo(want.remaining);
  expect(s2.total).toBe(120);
  RELEASES.forEach((id, i) => expect(getReleasePoints(product, id, 'S2').allocated).toBeCloseTo(want.allocated[i] ?? NaN));
  expect(s2.unallocated.total).toBeCloseTo(want.u);
  expect(s2.overAllocated.total).toBeCloseTo(want.o);
}

function expectIdentity(product: Product, sprintId: string) {
  const t = getProjectTotals(product, sprintId);
  const releases = product.releases.map(r => getReleasePoints(product, r.id, sprintId));
  const allocated = releases.reduce((sum, r) => sum + r.allocated, 0);
  const completed = releases.reduce((sum, r) => sum + r.completed, 0);
  expect(allocated + t.unallocated.total - t.overAllocated.total).toBeCloseTo(t.total);
  expect(completed - t.overCount).toBeCloseTo(t.completed);
  expect((allocated - completed) + t.unallocated.total - (t.overAllocated.total - t.overCount)).toBeCloseTo(t.total - t.completed);
}

describe('§9: the walkthrough, through the real writers', () => {
  it.each<[number, Row]>([
    [1, { c1: 18, c2: 18, remaining: 102, allocated: [60, 32, 0], u: 28, o: 0 }],
    [2, { c1: 18, c2: 18, remaining: 102, allocated: [20, 32, 40], u: 28, o: 0 }],
    [3, { c1: 18, c2: 28, remaining: 92, allocated: [20, 32, 40], u: 28, o: 0 }],
    [4, { c1: 12, c2: 22, remaining: 98, allocated: [20, 20, 40], u: 40, o: 0 }],
    [5, { c1: 18, c2: 28, remaining: 92, allocated: [20, 40, 40], u: 20, o: 0 }],
    [6, { c1: 10, c2: 20, remaining: 100, allocated: [0, 40, 40], u: 40, o: 0 }],
    [7, { c1: 10, c2: 20, remaining: 100, allocated: [0, 40, 46], u: 40, o: 6 }],
    [8, { c1: 10, c2: 34, remaining: 86, allocated: [0, 40, 46], u: 40, o: 6 }],
  ])('row %i', (row, want) => {
    const product = walkthrough(row);
    expectRow(product, want);
    expectIdentity(product, 'S1');
    expectIdentity(product, 'S2');
  });

  it('row 2: the drag carried a\'s record, which is the only proof of carry the rule leaves', () => {
    const product = walkthrough(2);
    expect(ribOf(product, 'a').progressHistory.map(e => [e.sprintId, e.releaseId, e.percentComplete])).toEqual([['S1', 'R3', 10]]);
    expect(getReleasePoints(product, 'R3', 'S1').completed).toBeCloseTo(4);
    expect(getStrandedRows(product)).toEqual([]);
  });

  it('row 3: points this sprint are +10, and the rows say why', () => {
    const product = walkthrough(3);
    const [s1, s2] = product.sprints;
    const summary = req(getSprintSummary(product, 'S2'), 'summary');
    expect(summary.pointsThisSprint).toBe(10);
    expect([summary.itemsUpdated, summary.itemsTotal]).toEqual([2, 3]);

    const delta = (id: string, release: string) => getDelta(ribOf(product, id), release, s2 ?? null, s1 ?? null, 'S2', product.sprints);
    expect(delta('a', 'R3')).toBe(15);
    expect(delta('b', 'R2')).toBe(10);
    expect(delta('b', 'R1')).toBeNull();
    expect(delta('c', 'R2')).toBeNull();
  });

  it('splits points this sprint by category, and has no percentage to divide by for an empty one', () => {
    const product = walkthrough(3);
    const nonCoreRib = ribOf(product, 'b');
    nonCoreRib.category = 'non-core';
    const summary = req(getSprintSummary({ ...product }, 'S2'), 'summary');
    // a +6 is core; b +4 is non-core.
    expect(summary.core.pointsThisSprint).toBe(6);
    expect(summary.nonCore.pointsThisSprint).toBe(4);
    const allCore = req(getSprintSummary(walkthrough(3), 'S2'), 'summary');
    expect(allCore.nonCore).toEqual({ totalPoints: 0, completedPoints: 0, pointsThisSprint: 0, percentComplete: 0 });
  });

  it('row 4: parking c keeps +10, because its earlier points leave S1 too, and c unlocks and is listed', () => {
    const product = walkthrough(4);
    const summary = req(getSprintSummary(product, 'S2'), 'summary');
    expect(summary.pointsThisSprint).toBe(10);
    expect([summary.itemsUpdated, summary.itemsTotal]).toEqual([2, 2]);
    expect(isRibLocked(ribOf(product, 'c'), product.sprints)).toBe(false);
    expect(ribOf(product, 'c').progressHistory).toHaveLength(1);
    expect(getStrandedRows(product).map(r => [r.ribId, r.releaseId, r.wouldCount])).toEqual([['c', 'R2', 30]]);
  });

  it('row 5: c comes back at 100%, its record counts again, and the list empties', () => {
    const product = walkthrough(5);
    expect(ribOf(product, 'c').releaseAllocations).toMatchObject([{ releaseId: 'R2', percentage: 100 }]);
    expect(getStrandedRows(product)).toEqual([]);
  });

  it('row 6: removing R1 in the dialog strands b\'s record', () => {
    expect(getStrandedRows(walkthrough(6)).map(r => [r.ribId, r.releaseId, r.wouldCount])).toEqual([['b', 'R1', 20]]);
  });

  it('row 7: over-allocation has nothing done on it yet', () => {
    const t = getProjectTotals(walkthrough(7), 'S2');
    expect(t.overCount).toBeCloseTo(0);
    expect(86 + t.unallocated.total - t.overAllocated.total).toBeCloseTo(120);
  });

  it('row 8: the over-count is 4 and the identity spells out', () => {
    const product = walkthrough(8);
    const t = getProjectTotals(product, 'S2');
    expect(t.overCount).toBeCloseTo(4);
    expect(getReleasePoints(product, 'R2', 'S2').completed).toBeCloseTo(22);
    expect(getReleasePoints(product, 'R3', 'S2').completed).toBeCloseTo(16);
    expect(48 + t.unallocated.total - (t.overAllocated.total - t.overCount)).toBeCloseTo(86);
  });
});

describe('§9: carry cases, through the real writers', () => {
  const product = (ribs: RibItem[]) => makeProduct(ribs);
  const series = (p: Product, id: string) => completionSeries(ribOf(p, id));
  const released = (p: Product) => getStrandedRows(p).map(r => r.releaseId);

  it('M1: X\'s records go to Y, Y\'s inert records go to X, and back is byte-identical', () => {
    const start = product([makeRib('r', [on('X')], [entry('S2', 'X', 20), entry('S3', 'X', 30), entry('S1', 'Y', 10)])]);
    const there = dragRib(start, 'r', 'X', 'Y');
    expect(ribOf(there, 'r').progressHistory).toEqual([entry('S2', 'Y', 20), entry('S3', 'Y', 30), entry('S1', 'X', 10)]);
    expect(series(there, 'r')).toEqual(series(start, 'r'));
    const back = dragRib(there, 'r', 'Y', 'X');
    expect(JSON.stringify(ribOf(back, 'r').progressHistory)).toBe(JSON.stringify(ribOf(start, 'r').progressHistory));
  });

  it('M2: with nothing on X, Y\'s records count again, and the second drag brings them home', () => {
    const start = product([makeRib('r', [on('X')], [entry('S1', 'Y', 30)])]);
    expect(series(start, 'r')).toEqual([0, 0, 0]);
    expect(released(start)).toEqual(['Y']);
    const there = dragRib(start, 'r', 'X', 'Y');
    expect(series(there, 'r')).toEqual([30, 30, 30]);
    expect(released(there)).toEqual([]);
    const back = dragRib(there, 'r', 'Y', 'X');
    expect(ribOf(back, 'r').progressHistory).toEqual([entry('S1', 'X', 30)]);
    expect(series(back, 'r')).toEqual([30, 30, 30]);
  });

  it('M3: a split rib\'s card dropped on its other lane is refused, history untouched', () => {
    const history = [entry('S1', 'R1', 10)];
    const start = product([makeRib('r', [on('R1', 50), on('R2', 50)], history)]);
    const next = dragRib(start, 'r', 'R1', 'R2');
    expect(ribOf(next, 'r').progressHistory).toEqual(history);
    expect(ribOf(next, 'r').releaseAllocations).toEqual(ribOf(start, 'r').releaseAllocations);
  });

  it('M4: a parked rib sent elsewhere leaves its record inert, and listed', () => {
    const next = dragRib(product([makeRib('r', [], [entry('S1', 'R1', 30)])]), 'r', null, 'R3');
    expect(ribOf(next, 'r').releaseAllocations).toMatchObject([{ releaseId: 'R3', percentage: 100 }]);
    expect(series(next, 'r')).toEqual([0, 0, 0]);
    expect(released(next)).toEqual(['R1']);
  });

  it.each([[1], [0]])('M5/M9: %i typed with a stray 10 reads the same there and back, and is never 11', typed => {
    const start = product([makeRib('r', [on('R3')], [entry('S1', 'R3', typed), entry('S1', 'R2', 10)])]);
    const want = [typed, typed, typed];
    expect(series(start, 'r')).toEqual(want);
    const there = dragRib(start, 'r', 'R3', 'R2');
    expect(series(there, 'r')).toEqual(want);
    expect(getStrandedRows(there)).toHaveLength(1);
    const back = dragRib(there, 'r', 'R2', 'R3');
    expect(series(back, 'r')).toEqual(want);
    expect(getStrandedRows(back)).toHaveLength(1);
    expect(JSON.stringify(ribOf(back, 'r').progressHistory)).toBe(JSON.stringify(ribOf(start, 'r').progressHistory));
  });

  it('M6: one card of a split rib to Unassigned drops both, and R1 alone comes back', () => {
    const start = product([makeRib('r', [on('R1', 50), on('R2', 50)], [entry('S1', 'R1', 20), entry('S1', 'R2', 30)])]);
    const parked = dragRib(start, 'r', 'R1', null);
    expect(ribOf(parked, 'r').releaseAllocations).toEqual([]);
    expect(series(parked, 'r')).toEqual([0, 0, 0]);
    expect(released(parked)).toEqual(['R1', 'R2']);
    const back = dragRib(parked, 'r', null, 'R1');
    expect(ribOf(back, 'r').releaseAllocations).toMatchObject([{ releaseId: 'R1', percentage: 100 }]);
    expect(series(back, 'r')).toEqual([20, 20, 20]);
    expect(released(back)).toEqual(['R2']);
  });

  it('M7: a true downward entry is refused, as it always was, with no hint', () => {
    const p = product([makeRib('r', [on('X')], [entry('S1', 'X', 10), entry('S2', 'X', 0)])]);
    const data = buildForecasterExport(p);
    expect(data.sprints.map(s => s.doneValue)).toEqual([4, -4, 0]);
    const issues = checkForecasterExport(p, data);
    expect(issues.some(i => i.includes('negative velocity'))).toBe(true);
    expect(issues.some(i => i.includes('Needs Attention'))).toBe(false);
  });

  it('M8: a stray that hid a fall is now refused, and the hint says where to look', () => {
    const p = product([
      makeRib('a', [on('R1')], [entry('S1', 'R1', 50), entry('S2', 'R1', 40)]),
      makeRib('e', [on('R2')], [entry('S2', 'R1', 20)]),
    ]);
    const data = buildForecasterExport(p);
    expect(data.sprints.map(s => s.doneValue)).toEqual([20, -4, 0]);
    const issues = checkForecasterExport(p, data);
    expect(issues.some(i => i.includes('negative velocity'))).toBe(true);
    expect(issues).toContain('Some ribs have progress that is not counting. See Insights, Needs Attention.');
  });

  it('multi-select carries through moveRibs2D', () => {
    const start = product([makeRib('r', [on('X')], [entry('S1', 'X', 10)])]);
    const next = applyUpdate(start, update =>
      moveRibs2D(update, [{ ribId: 'r', fromThemeId: 't', fromBackboneId: 'b', fromReleaseId: 'X' }], { themeId: 't', backboneId: 'b', releaseId: 'Y', insertIndex: null }));
    expect(ribOf(next, 'r').progressHistory).toEqual([entry('S1', 'Y', 10)]);
    expect(series(next, 'r')).toEqual([10, 10, 10]);
  });
});

describe('§1.4: the characterisation probes, read as goldens', () => {
  const single = (allocations: ReleaseAllocation[], history: ProgressEntry[]) => makeProduct([makeRib('r', allocations, history)]);

  it.each([[0, 0, 40], [1, 0.4, 39.6]])('P1: %i%% with a stray 10 under another release', (typed, completed, remaining) => {
    const p = single([on('R3')], [entry('S1', 'R2', 10), entry('S1', 'R3', typed)]);
    const rib = ribOf(p, 'r');
    const summary = req(getSprintSummary(p, 'S1'), 'summary');
    expect(summary.completedPoints).toBe(completed);
    expect(summary.remainingPoints).toBe(remaining);
    expect(getReleasePoints(p, 'R3', 'S1').completed).toBeCloseTo(completed);
    expect(getProjectPercentComplete(p)).toBeCloseTo(typed);
    expect(getReleasePercentComplete(p, 'R3')).toBeCloseTo(typed);
    expect(getSprintPct(rib, 'R3', 'S1', p.sprints)).toBe(typed);
    expect(getSprintPct(rib, null, 'S1', p.sprints)).toBe(typed);
    expect(isRibLocked(rib, p.sprints)).toBe(typed > 0);
  });

  it('P2: the header and the row agree on one sprint\'s change', () => {
    const p = single([on('R3')], [entry('S1', 'R3', 20), entry('S2', 'R3', 30), entry('S2', 'R2', 10)]);
    expect(req(getSprintSummary(p, 'S2'), 'summary').pointsThisSprint).toBe(4);
    expect(getDelta(ribOf(p, 'r'), 'R3', SPRINTS[1] ?? null, SPRINTS[0] ?? null, 'S2', SPRINTS)).toBe(10);
  });

  it('P3: a split rib\'s latest walks back on each release', () => {
    const p = single([on('R1', 50), on('R2', 50)], [entry('S1', 'R1', 50), entry('S2', 'R2', 20)]);
    expect(getProjectPercentComplete(p)).toBe(70);
    expect(getReleasePercentComplete(p, 'R1')).toBe(100);
    expect(getReleasePercentComplete(p, 'R2')).toBe(40);
  });

  it('P4: the row change after a skipped sprint is the true change', () => {
    const p = single([on('R1')], [entry('S1', 'R1', 30), entry('S3', 'R1', 40)]);
    const rib = ribOf(p, 'r');
    expect(getDelta(rib, 'R1', SPRINTS[2] ?? null, SPRINTS[1] ?? null, 'S3', SPRINTS)).toBe(10);
    expect(getDelta(rib, null, SPRINTS[2] ?? null, SPRINTS[1] ?? null, 'S3', SPRINTS)).toBe(10);
    expect(req(getSprintSummary(p, 'S3'), 'summary').pointsThisSprint).toBe(4);
  });

  it('P5: one lock: progress in an earlier sprint locks even if the latest reads 0', () => {
    const p = single([on('R1')], [entry('S1', 'R1', 10), entry('S2', 'R1', 0)]);
    expect(getProjectPercentComplete(p)).toBe(0);
    expect(isRibLocked(ribOf(p, 'r'), p.sprints)).toBe(true);
  });

  it('P6: the header and the release figure both stop at the allocation', () => {
    const p = single([on('R1', 50), on('R2', 50)], [entry('S1', 'R1', 80)]);
    expect(req(getSprintSummary(p, 'S1'), 'summary').completedPoints).toBe(20);
    expect(getReleasePoints(p, 'R1', 'S1').completed).toBe(20);
    expect(getReleasePoints(p, 'R2', 'S1').completed).toBe(0);
  });

  it('P6, the cap alone: nothing in §9 records above an allocation, so this golden is what holds it', () => {
    const p = makeProduct([makeRib('r', [on('R1', 20)], [entry('S1', 'R1', 80)])]);
    expect(getProjectTotals(p, 'S1').completed).toBeCloseTo(8);
    expect(getReleasePoints(p, 'R1', 'S1').completed).toBeCloseTo(8);
    expect(getCurrentPct(ribOf(p, 'r'), 'R1', 'S1', p.sprints)).toBe(20);
  });

  it('P7: a parked rib counts nothing', () => {
    const p = single([], [entry('S1', 'R1', 50)]);
    expect(getProjectPercentComplete(p)).toBe(0);
    expect(req(getSprintSummary(p, 'S1'), 'summary').completedPoints).toBe(0);
  });
});

describe('sprint order, which no §9 row reaches', () => {
  // S2 before S1 in both arrays, as a back-filled sprint or an import leaves them.
  const backFilled = (): Product => ({
    ...makeProduct([makeRib('r', [on('R1')], [entry('S2', 'R1', 50), entry('S1', 'R1', 20)])]),
    sprints: [SPRINTS[1], SPRINTS[0]].filter(s => s !== undefined),
  });

  it('"latest" is the last in sprint order', () => {
    const p = backFilled();
    expect(getProjectTotals(p).completed).toBeCloseTo(20);
    expect(getProjectPercentComplete(p)).toBeCloseTo(50);
    expect(getReleasePercentComplete(p, 'R1')).toBeCloseTo(50);
  });

  it('the chart runs in sprint order, and the previous sprint is found by it', () => {
    const p = backFilled();
    expect(getProgressOverTime(p).map(d => d.sprintId)).toEqual(['S1', 'S2']);
    expect(req(getSprintSummary(p, 'S2'), 'summary').pointsThisSprint).toBe(12);
  });

  it('the export runs in sprint order', () => {
    expect(buildForecasterExport(backFilled()).sprints.map(s => s.doneValue)).toEqual([8, 12]);
  });
});

describe('§8: his tests', () => {
  /** Progress under R1 on rib `r`, a split rib alongside, then a real move to R3. */
  const moved = (): Product => {
    const start = makeProduct([
      makeRib('r', [on('R1')], [entry('S1', 'R1', 10)]),
      makeRib('split', [on('R1', 50), on('R2', 50)], [entry('S1', 'R1', 20), entry('S1', 'R2', 10)], 'M'),
    ]);
    return dragRib(start, 'r', 'R1', 'R3');
  };

  it.each([[0, 0], [1, 1]])('(a), (b): %i%% after a real move reads %i%%, in every grouping', (typed, reads) => {
    const p = typeProgress(moved(), 'r', 'S1', 'R3', typed);
    const rib = ribOf(p, 'r');
    expect(rib.progressHistory).toHaveLength(1);
    expect(getSprintPct(rib, 'R3', 'S1', p.sprints)).toBe(reads);
    expect(getSprintPct(rib, null, 'S1', p.sprints)).toBe(reads);
    expect(getCurrentPct(rib, 'R3', 'S1', p.sprints)).toBe(reads);
    expect(getCurrentPct(rib, null, 'S1', p.sprints)).toBe(reads);
    expect(isRibLocked(rib, p.sprints)).toBe(typed > 0);
  });

  it('(c): progress, move, 0%: Release, Backbone, Theme and Insights agree, with a split rib beside it', () => {
    const p = typeProgress(moved(), 'r', 'S1', 'R3', 0);
    const completed = p.releases.reduce((sum, r) => sum + getReleasePoints(p, r.id, 'S1').completed, 0);
    const total = getProjectTotals(p, 'S1');
    // Split: (20% + 10%) of 20 points. The moved rib: 0.
    expect(total.completed).toBeCloseTo(6);
    expect(completed).toBeCloseTo(total.completed);
    const theme = req(p.themes[0], 'theme');
    expect(getThemeStats(theme, p.sizeMapping, p.sprints).percentComplete).toBe(Math.round(6 / 60 * 100));
    expect(getProjectPercentComplete(p)).toBeCloseTo(10);
  });

  it('(e): re-import keeps every inert record and every total', () => {
    const p = makeProduct([
      makeRib('left', [on('R2')], [entry('S1', 'R1', 30), entry('S2', 'R2', 10)]),
      makeRib('parked', [], [entry('S1', 'R2', 20)]),
    ]);
    const back = validateProduct(JSON.parse(JSON.stringify(p)));
    expect(ribOf(back, 'left').progressHistory).toEqual(ribOf(p, 'left').progressHistory);
    expect(ribOf(back, 'parked').progressHistory).toEqual(ribOf(p, 'parked').progressHistory);
    expect(getStrandedRows(back)).toEqual(getStrandedRows(p));
    for (const s of p.sprints) {
      expect(getProjectTotals(back, s.id)).toEqual(getProjectTotals(p, s.id));
      for (const r of p.releases) expect(getReleasePoints(back, r.id, s.id)).toEqual(getReleasePoints(p, r.id, s.id));
    }
  });

  it('(e): the validator still drops an unknown sprint or a deleted release, and normalises an absent value', () => {
    const absent = { sprintId: 'S1', releaseId: 'R1' } as ProgressEntry;
    const p = makeProduct([makeRib('r', [on('R1')], [absent, entry('gone', 'R1', 10), entry('S1', 'gone', 10)])]);
    const back = validateProduct(JSON.parse(JSON.stringify(p)));
    expect(ribOf(back, 'r').progressHistory).toEqual([{ sprintId: 'S1', releaseId: 'R1', percentComplete: null }]);
  });
});

describe('every figure survives what import lets through', () => {
  it('one allocation with no percentage counts as 0, and leaves the other ribs\' figures alone', () => {
    const p = makeProduct([
      makeRib('bad', [{ releaseId: 'R1' } as ReleaseAllocation], [entry('S1', 'R1', 30)]),
      makeRib('good', [on('R2')], [entry('S1', 'R2', 50)], 'M'),
    ]);
    const t = getProjectTotals(p, 'S1');
    expect(t.completed).toBe(10);
    expect(t.unallocated.total).toBe(40);
    expect(req(getSprintSummary(p, 'S1'), 'summary').remainingPoints).toBe(50);
    expect(getProgressOverTime(p).map(d => d.completedPoints)).toEqual([10, 10, 10]);
    const issues = checkForecasterExport(p, buildForecasterExport(p));
    expect(issues.filter(i => i.includes('not a number'))).toEqual([]);
  });

  it('an allocation to a release that no longer exists still adds up, and counts its progress', () => {
    const p = makeProduct([makeRib('r', [on('GONE')], [entry('S1', 'GONE', 30)]), makeRib('s', [on('R1')], [], 'M')]);
    const t = getProjectTotals(p, 'S1');
    expect(t.total).toBe(60);
    expect(t.completed).toBeCloseTo(12);
    expect(t.unallocated.total).toBe(0);
    expect(getReleasePoints(p, 'GONE', 'S1').allocated).toBe(40);
    expect(getStrandedRows(p)).toEqual([]);
  });

  it('a duplicate allocation row counts once, in every reader', () => {
    const p = makeProduct([makeRib('r', [on('R1', 50), on('R1', 50)], [entry('S1', 'R1', 40)])]);
    const t = getProjectTotals(p, 'S1');
    expect(getReleasePoints(p, 'R1', 'S1').allocated).toBe(20);
    expect(t.unallocated.total).toBe(20);
    expect(t.completed).toBe(16);
  });
});

describe('a duplicate allocation row, in the readers beyond the figures', () => {
  const p = makeProduct([makeRib('r', [on('R1', 50), on('R1', 50)], [entry('S1', 'R1', 40)])]);

  it('the map draws one card', () => {
    expect(computeLayout(p).cells.filter(c => c.id === 'r')).toHaveLength(1);
  });

  it('the AI snapshot reports one release, which is what the move guard reads', () => {
    expect(buildAiSnapshot(p).themes[0]?.backboneItems[0]?.ribItems[0]?.releaseIds).toEqual(['R1']);
  });
});

describe('editing a progress record', () => {
  const dup = () => makeProduct([makeRib('r', [on('R1')], [
    entry('S1', 'R1', 10), entry('S1', 'R1', 30, 'shadowed note'), entry('S2', 'R1', 40),
  ])]);

  it('a write keeps one entry for the pair, so a delete cannot resurface a shadowed one', () => {
    const p = applyUpdate(dup(), update => updateProgress(update, 'r', 'R1', 'S1', 20));
    const history = ribOf(p, 'r').progressHistory;
    expect(history.filter(e => e.sprintId === 'S1')).toHaveLength(1);
    expect(history.find(e => e.sprintId === 'S1')?.percentComplete).toBe(20);
    expect(history.find(e => e.sprintId === 'S2')?.percentComplete).toBe(40);
  });
});
