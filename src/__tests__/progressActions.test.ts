// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { getProjectTotals } from '../lib/calculations';
import { buildForecasterExport, checkForecasterExport } from '../lib/exportForForecaster';
import { bringRecordsHere, clearRibProgress, previewBringHere, removeRowRecords, ribHasProgress } from '../lib/progressMutations';
import { progressAsOf } from '../lib/progressRule';
import { getStrandedRows } from '../lib/reconciliation';
import { isRibLocked } from '../lib/ribHelpers';
import type { Product, ProgressEntry, ReleaseAllocation } from '../types';
import {
  completionSeries, dragRib, entry, makeProduct, makeRib, projectCompleted, ribOf, walkthrough,
} from './fixtures/progressIntegrity';

/**
 * Needs Attention's actions and Clear progress, through the real writers. Every
 * figure here is hand-computed from §5 before it was run, because `completionSeries`
 * IS the rule: the literal on the right of each assertion is the independent check.
 *
 * Each case asserts the same four things, the history, the figures, the list and the
 * lock, so a change that keeps one and breaks another is seen.
 */

const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });
const OLD = '2026-01-01T00:00:00.000Z';
const NOW = '2026-11-06T12:00:00.000Z';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { vi.useRealTimers(); });

const rib = (history: ProgressEntry[], allocations: ReleaseAllocation[] = [on('R1')]) => makeProduct([makeRib('r', allocations, history)]);

/** [sprint, release, percent, comment] per entry, so an assertion reads like the brief's history column. */
const history = (p: Product) => ribOf(p, 'r').progressHistory.map(e => [e.sprintId, e.releaseId, e.percentComplete, e.comment ?? '']);
const series = (p: Product) => completionSeries(ribOf(p, 'r'), p.sprints);
const listed = (p: Product) => getStrandedRows(p).filter(row => row.ribId === 'r').map(row => `${row.releaseId}:${row.sprintNames.join('+')}`);
const locked = (p: Product) => isRibLocked(ribOf(p, 'r'), p.sprints);

describe('a shadowed duplicate on a current allocation', () => {
  const duplicate = () => rib([entry('S1', 'R1', 10), entry('S1', 'R1', 30)]);

  it('is listed, with the entry that counts in place', () => {
    const p = duplicate();
    expect(series(p)).toEqual([10, 10, 10]);
    expect(listed(p)).toEqual(['R1:S1']);
    expect(locked(p)).toBe(true);
  });

  it('Bring here does nothing: a release does not combine with itself', () => {
    const p = duplicate();
    expect(bringRecordsHere(p, 'r', 'R1')).toBe(p);
  });

  it('Remove takes the duplicate and leaves the entry that counts', () => {
    const next = removeRowRecords(duplicate(), 'r', 'R1');
    expect(history(next)).toEqual([['S1', 'R1', 10, '']]);
    expect(series(next)).toEqual([10, 10, 10]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
  });

  it('Remove goes by identity, so an identical twin is still only the twin', () => {
    const counting = { ...entry('S1', 'R1', 10), updatedAt: OLD };
    const twin = { ...entry('S1', 'R1', 10), updatedAt: OLD };
    const next = removeRowRecords(rib([counting, twin]), 'r', 'R1');
    expect(ribOf(next, 'r').progressHistory).toEqual([counting]);
    expect(ribOf(next, 'r').progressHistory[0]).toBe(counting);
  });

  it('Remove leaves every other sprint on that release alone', () => {
    const next = removeRowRecords(rib([entry('S1', 'R1', 10), entry('S2', 'R1', 40), entry('S2', 'R1', 90)]), 'r', 'R1');
    expect(history(next)).toEqual([['S1', 'R1', 10, ''], ['S2', 'R1', 40, '']]);
    expect(series(next)).toEqual([10, 40, 40]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
  });

  it('Remove nulls a duplicate with a comment and the entry that counts stays', () => {
    const next = removeRowRecords(rib([entry('S1', 'R1', 10), entry('S1', 'R1', 30, 'kept')]), 'r', 'R1');
    expect(history(next)).toEqual([['S1', 'R1', 10, ''], ['S1', 'R1', null, 'kept']]);
    expect(series(next)).toEqual([10, 10, 10]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
  });

  it('Remove on a split rib leaves the other release and the effective entry', () => {
    const p = rib([entry('S1', 'R1', 10), entry('S1', 'R1', 30), entry('S1', 'R2', 20)], [on('R1', 50), on('R2', 50)]);
    expect(series(p)).toEqual([30, 30, 30]);
    const next = removeRowRecords(p, 'r', 'R1');
    expect(history(next)).toEqual([['S1', 'R1', 10, ''], ['S1', 'R2', 20, '']]);
    expect(series(next)).toEqual([30, 30, 30]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
  });

  it('a positive shadow behind a comment-only first entry goes, and the note stays', () => {
    const next = removeRowRecords(rib([entry('S1', 'R1', null, 'note'), entry('S1', 'R1', 30)]), 'r', 'R1');
    expect(history(next)).toEqual([['S1', 'R1', null, 'note']]);
    expect(series(next)).toEqual([0, 0, 0]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(false);
  });
});

describe('Bring here, the formula', () => {
  it('reads by sprint order, whatever the array order', () => {
    const p = rib([entry('S3', 'R1', 30), entry('S2', 'R2', 20), entry('S1', 'R1', 10), entry('S1', 'R2', 5)]);
    expect(series(p)).toEqual([10, 10, 30]);
    const next = bringRecordsHere(p, 'r', 'R2');
    // S1: 5 + 10. S2: 20 + 10 walked back. S3: 20 walked back + 30.
    expect(history(next)).toEqual([['S1', 'R1', 15, ''], ['S2', 'R1', 30, ''], ['S3', 'R1', 50, '']]);
    expect(series(next)).toEqual([15, 30, 50]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
  });

  it('walks back past nulls, and a comment moves with its sprint', () => {
    const p = rib([entry('S1', 'R2', null, 'n1'), entry('S2', 'R2', 20), entry('S1', 'R1', 10), entry('S3', 'R1', null, 'n3')]);
    const next = bringRecordsHere(p, 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R1', 10, 'n1'], ['S2', 'R1', 30, ''], ['S3', 'R1', null, 'n3']]);
    expect(series(next)).toEqual([10, 30, 30]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
  });

  it('takes the first entry on each side, as a write would, and keeps a comment from behind it', () => {
    const p = rib([entry('S1', 'R2', 10), entry('S1', 'R2', 30, 'behind'), entry('S1', 'R1', 5), entry('S1', 'R1', 7)]);
    const next = bringRecordsHere(p, 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R1', 15, 'behind']]);
    expect(series(next)).toEqual([15, 15, 15]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
  });

  it('carries a fall in, and the export can then refuse', () => {
    const p = rib([entry('S1', 'R2', 30), entry('S2', 'R2', 10), entry('S1', 'R1', 5)]);
    const refused = (x: Product) => checkForecasterExport(x, buildForecasterExport(x));
    expect(refused(p)).toEqual([]);
    const next = bringRecordsHere(p, 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R1', 35, ''], ['S2', 'R1', 15, '']]);
    expect(series(next)).toEqual([35, 15, 15]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
    // 40 points: 35% is 14, 15% is 6, so S2 moves -8.
    expect(refused(next)).toHaveLength(1);
    expect(refused(next)[0]).toContain('-8 points');
  });

  it('stores above a smaller allocation, which counts up to it', () => {
    const p = rib([entry('S1', 'R1', 40), entry('S1', 'R2', 30)], [on('R1', 60)]);
    const next = bringRecordsHere(p, 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R1', 70, '']]);
    expect(series(next)).toEqual([60, 60, 60]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
  });

  it('adds what the other side has reached when a sprint is on one side only', () => {
    const p = rib([entry('S1', 'R2', 30), entry('S2', 'R1', 10), entry('S3', 'R2', 35)]);
    const next = bringRecordsHere(p, 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R1', 30, ''], ['S2', 'R1', 40, ''], ['S3', 'R1', 45, '']]);
    expect(series(next)).toEqual([30, 40, 45]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
  });

  it('stops at 100', () => {
    const next = bringRecordsHere(rib([entry('S1', 'R1', 70), entry('S1', 'R2', 60)]), 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R1', 100, '']]);
    expect(series(next)).toEqual([100, 100, 100]);
  });

  it('adds to a typed 0, which is a value', () => {
    const next = bringRecordsHere(rib([entry('S1', 'R2', 10), entry('S2', 'R1', 0)]), 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R1', 10, ''], ['S2', 'R1', 10, '']]);
    expect(series(next)).toEqual([10, 10, 10]);
  });

  it('brings a series that ended at 0, which reads 0 and locks on its earlier sprint', () => {
    const next = bringRecordsHere(rib([entry('S1', 'R2', 30), entry('S2', 'R2', 0)]), 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R1', 30, ''], ['S2', 'R1', 0, '']]);
    expect(series(next)).toEqual([30, 0, 0]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
  });

  it('keeps a sprint with only comments null, joining them', () => {
    const next = bringRecordsHere(rib([entry('S1', 'R2', 30), entry('S2', 'R2', null, 'row'), entry('S2', 'R1', null, 'current')]), 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R1', 30, ''], ['S2', 'R1', null, 'current\n\nrow']]);
    expect(series(next)).toEqual([30, 30, 30]);
  });

  it('leaves an entry for an unknown sprint where it is', () => {
    const next = bringRecordsHere(rib([entry('GONE', 'R2', 40), entry('S1', 'R2', 30), entry('GONE', 'R1', 15)]), 'r', 'R2');
    expect(history(next)).toEqual([['GONE', 'R2', 40, ''], ['GONE', 'R1', 15, ''], ['S1', 'R1', 30, '']]);
    expect(series(next)).toEqual([30, 30, 30]);
    expect(listed(next)).toEqual([]);
  });

  it('gives the same result in either order, on a rib with two rows', () => {
    const p = rib([entry('S1', 'R2', 30), entry('S1', 'R3', 20), entry('S1', 'R1', 5)]);
    const oneWay = bringRecordsHere(bringRecordsHere(p, 'r', 'R2'), 'r', 'R3');
    const otherWay = bringRecordsHere(bringRecordsHere(p, 'r', 'R3'), 'r', 'R2');
    expect(history(oneWay)).toEqual([['S1', 'R1', 55, '']]);
    expect(history(otherWay)).toEqual([['S1', 'R1', 55, '']]);
    expect(listed(oneWay)).toEqual([]);
  });

  it('reads 11 on the reported case, by request', () => {
    const next = bringRecordsHere(rib([entry('S1', 'R3', 1), entry('S1', 'R2', 10)], [on('R3')]), 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R3', 11, '']]);
    expect(series(next)).toEqual([11, 11, 11]);
    expect(listed(next)).toEqual([]);
  });

  it('a duplicate on the current release goes when a row is brought onto its sprint, and its comment stays', () => {
    const next = bringRecordsHere(rib([entry('S1', 'R1', 5), entry('S1', 'R1', 7, 'kept'), entry('S1', 'R2', 10)]), 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R1', 15, 'kept']]);
    expect(listed(next)).toEqual([]);
  });
});

describe('Bring here is refused', () => {
  it.each<[string, Product]>([
    ['a parked rib', rib([entry('S1', 'R2', 30)], [])],
    ['a split rib', rib([entry('S1', 'R2', 30), entry('S1', 'R1', 5)], [on('R1', 50), on('R3', 50)])],
    ['a 0% allocation, which would lock the rib with nothing counting', rib([entry('S1', 'R2', 30)], [on('R1', 0)])],
    ['an allocation to a release that is gone, which a re-import would drop', rib([entry('S1', 'R2', 30)], [on('GONE')])],
    ['a rib holding nothing on the row', rib([entry('S1', 'R1', 30)])],
    ['a row holding no value above 0', rib([entry('S1', 'R2', 0), entry('S2', 'R2', null, 'n')])],
  ])('on %s, returning the same product', (_, p) => {
    expect(bringRecordsHere(p, 'r', 'R2')).toBe(p);
  });

  it('on a rib that does not exist', () => {
    const p = rib([entry('S1', 'R2', 30)]);
    expect(bringRecordsHere(p, 'nope', 'R2')).toBe(p);
  });

  it('a second click does nothing, because the row has gone', () => {
    const once = bringRecordsHere(rib([entry('S1', 'R2', 30), entry('S1', 'R1', 5)]), 'r', 'R2');
    expect(bringRecordsHere(once, 'r', 'R2')).toBe(once);
  });

  it('is decided from the product it is given, not the row on screen', () => {
    const stale = rib([entry('S1', 'R2', 30)]);
    const nowSplit = dragRib(stale, 'r', 'R1', null);
    expect(bringRecordsHere(nowSplit, 'r', 'R2')).toBe(nowSplit);
  });
});

describe('Bring here and comments: nothing cuts one', () => {
  const text = (length: number, letter: string) => letter.repeat(length);
  const withComments = (current: number, row: number) =>
    rib([entry('S1', 'R1', 10, text(current, 'a')), entry('S1', 'R2', 30, text(row, 'b'))]);

  it('joins with a blank line, the current release first', () => {
    const next = bringRecordsHere(withComments(3, 3), 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R1', 40, 'aaa\n\nbbb']]);
  });

  it('joins at exactly 2,000', () => {
    const next = bringRecordsHere(withComments(999, 999), 'r', 'R2');
    expect(ribOf(next, 'r').progressHistory).toHaveLength(1);
    expect(ribOf(next, 'r').progressHistory[0]?.comment).toHaveLength(2000);
  });

  it.each([
    ['one character over', 1000, 999],
    ['both long', 1500, 1500],
    ['the current comment at the cap', 2000, 300],
    ['the current comment one short of the cap', 1999, 300],
    ['the current comment already over the cap', 2500, 10],
  ])('%s: both comments survive whole, and the row still leaves the list', (_, current, row) => {
    const next = bringRecordsHere(withComments(current, row), 'r', 'R2');
    expect(history(next)).toEqual([['S1', 'R2', null, text(row, 'b')], ['S1', 'R1', 40, text(current, 'a')]]);
    expect(series(next)).toEqual([40, 40, 40]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(true);
  });

  it('moves a row comment with no current comment, and keeps a current comment with no row comment', () => {
    const moved = bringRecordsHere(rib([entry('S1', 'R1', 10), entry('S1', 'R2', 30, 'row')]), 'r', 'R2');
    expect(history(moved)).toEqual([['S1', 'R1', 40, 'row']]);
    const kept = bringRecordsHere(rib([entry('S1', 'R1', 10, 'current'), entry('S1', 'R2', 30)]), 'r', 'R2');
    expect(history(kept)).toEqual([['S1', 'R1', 40, 'current']]);
  });

  it('leaves a comment-only row entry that does not fit exactly as it was', () => {
    const note = { ...entry('S2', 'R2', null, text(300, 'b')), updatedAt: OLD };
    const next = bringRecordsHere(rib([entry('S1', 'R2', 30), note, entry('S2', 'R1', null, text(2000, 'a'))]), 'r', 'R2');
    expect(ribOf(next, 'r').progressHistory).toContain(note);
  });
});

describe('Bring here stamps only what changed', () => {
  it('leaves an entry alone when its value and comment hold', () => {
    const before = { ...entry('S1', 'R1', 5, 'note'), updatedAt: OLD };
    const next = bringRecordsHere(rib([before, entry('S2', 'R2', 30)]), 'r', 'R2');
    expect(ribOf(next, 'r').progressHistory).toEqual([before, { sprintId: 'S2', releaseId: 'R1', percentComplete: 35, comment: '', updatedAt: NOW }]);
    expect(ribOf(next, 'r').progressHistory[0]).toBe(before);
  });

  it('leaves alone an entry with no comment key at all', () => {
    const before: ProgressEntry = { sprintId: 'S1', releaseId: 'R1', percentComplete: 5, updatedAt: OLD };
    const next = bringRecordsHere(rib([before, entry('S2', 'R2', 30)]), 'r', 'R2');
    expect(ribOf(next, 'r').progressHistory[0]).toBe(before);
  });

  it('stamps an entry whose value changed', () => {
    const next = bringRecordsHere(rib([{ ...entry('S1', 'R1', 5), updatedAt: OLD }, entry('S1', 'R2', 30)]), 'r', 'R2');
    expect(ribOf(next, 'r').progressHistory[0]?.updatedAt).toBe(NOW);
  });

  it('stamps an entry whose comment changed', () => {
    const next = bringRecordsHere(rib([{ ...entry('S1', 'R1', 5), updatedAt: OLD }, entry('S1', 'R2', 0, 'note'), entry('S2', 'R2', 30)]), 'r', 'R2');
    expect(ribOf(next, 'r').progressHistory.find(e => e.sprintId === 'S1')).toMatchObject({ comment: 'note', updatedAt: NOW });
  });

  it('stamps a row comment left behind only if its percentage had to go', () => {
    const next = bringRecordsHere(rib([entry('S1', 'R1', 5, 'a'.repeat(2000)), { ...entry('S1', 'R2', 30, 'b'), updatedAt: OLD }]), 'r', 'R2');
    expect(ribOf(next, 'r').progressHistory.find(e => e.releaseId === 'R2')).toMatchObject({ percentComplete: null, comment: 'b', updatedAt: NOW });
  });

  it('touches no other rib and does not edit the product it was given', () => {
    const other = makeRib('other', [on('R1')], [entry('S1', 'R2', 30)]);
    const p = makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R2', 30)]), other]);
    const before = JSON.stringify(p);
    const next = bringRecordsHere(p, 'r', 'R2');
    expect(JSON.stringify(p)).toBe(before);
    expect(ribOf(next, 'other')).toBe(other);
  });
});

describe('previewBringHere is what the writer leaves', () => {
  it('reads the reported case as 11', () => {
    expect(previewBringHere(rib([entry('S1', 'R3', 1), entry('S1', 'R2', 10)], [on('R3')]), 'r', 'R2')).toEqual({ reads: 11, counted: 11 });
  });

  it('separates what the rib reads from what a smaller allocation counts', () => {
    expect(previewBringHere(rib([entry('S1', 'R1', 40), entry('S1', 'R2', 30)], [on('R1', 60)]), 'r', 'R2')).toEqual({ reads: 70, counted: 60 });
  });

  it('agrees with the rule on the written result', () => {
    const p = rib([entry('S1', 'R2', 30), entry('S2', 'R1', 10), entry('S3', 'R2', 35)]);
    const next = bringRecordsHere(p, 'r', 'R2');
    expect(previewBringHere(p, 'r', 'R2')?.reads).toBe(progressAsOf(ribOf(next, 'r'), 'R1', 'S3', next.sprints));
    expect(previewBringHere(p, 'r', 'R2')?.reads).toBe(45);
  });

  it('reads the latest sprint in sprint order, not the array', () => {
    const p = { ...rib([entry('S1', 'R1', 40), entry('S1', 'R2', 30), entry('S2', 'R2', 45)]), sprints: [...rib([]).sprints].reverse() };
    expect(previewBringHere(p, 'r', 'R2')?.reads).toBe(85);
  });

  it('is null when the action would do nothing', () => {
    const p = rib([entry('S1', 'R2', 30)], []);
    expect(previewBringHere(p, 'r', 'R2')).toBeNull();
    expect(previewBringHere(rib([entry('S1', 'R2', 30)]), 'nope', 'R2')).toBeNull();
  });

  it('is null on a rib with a release and nothing to bring, not a reading of what is there', () => {
    expect(previewBringHere(rib([entry('S1', 'R1', 30)]), 'r', 'R2')).toBeNull();
  });

  it('reads the rib it was asked about, among several', () => {
    const p = makeProduct([
      makeRib('r', [on('R1')], [entry('S1', 'R1', 5), entry('S1', 'R2', 10)]),
      makeRib('later', [on('R1')], [entry('S1', 'R1', 90)]),
    ]);
    expect(previewBringHere(p, 'r', 'R2')).toEqual({ reads: 15, counted: 15 });
  });
});

describe('§9 and the carry cases, through the actions', () => {
  it('row 6, Bring here on b from R1: history, figures, list, lock', () => {
    const p = walkthrough(6);
    expect([projectCompleted(p, 'S1'), projectCompleted(p, 'S2')]).toEqual([10, 20]);
    const next = bringRecordsHere(p, 'b', 'R1');
    expect(ribOf(next, 'b').progressHistory.map(e => [e.sprintId, e.releaseId, e.percentComplete])).toEqual([['S1', 'R2', 20], ['S2', 'R2', 30]]);
    // b is 40 points. 20% is 8 and 30% is 12, where 0 and 4 stood.
    expect([projectCompleted(next, 'S1'), projectCompleted(next, 'S2')]).toEqual([18, 28]);
    expect(getProjectTotals(next, 'S2').total - projectCompleted(next, 'S2')).toBe(92);
    expect(getStrandedRows(next)).toEqual([]);
    expect(isRibLocked(ribOf(next, 'b'), next.sprints)).toBe(true);
  });

  it('row 4, a parked rib: no Bring here, Remove reaches it', () => {
    const p = walkthrough(4);
    expect(bringRecordsHere(p, 'c', 'R2')).toBe(p);
    const next = removeRowRecords(p, 'c', 'R2');
    expect(ribOf(next, 'c').progressHistory).toEqual([]);
    expect(projectCompleted(next, 'S2')).toBe(22);
    expect(getStrandedRows(next)).toEqual([]);
    expect(isRibLocked(ribOf(next, 'c'), next.sprints)).toBe(false);
    // The record is gone for good: the table's row 5 reads 28 with it.
    expect(projectCompleted(dragRib(next, 'c', null, 'R2'), 'S2')).toBe(22);
  });

  it('M8: Bring here recovers the fall a stray was hiding, and Remove leaves it refused', () => {
    const p = makeProduct([
      makeRib('a', [on('R1')], [entry('S1', 'R1', 50), entry('S2', 'R1', 40)]),
      makeRib('e', [on('R3')], [entry('S2', 'R1', 20)]),
    ]);
    const done = (x: Product) => buildForecasterExport(x).sprints.map(s => s.doneValue);
    expect(done(p)).toEqual([20, -4, 0]);
    const brought = bringRecordsHere(p, 'e', 'R1');
    expect(done(brought)).toEqual([20, 4, 0]);
    expect(checkForecasterExport(brought, buildForecasterExport(brought))).toEqual([]);
    const removed = removeRowRecords(p, 'e', 'R1');
    expect(done(removed)).toEqual([20, -4, 0]);
    expect(checkForecasterExport(removed, buildForecasterExport(removed))).toHaveLength(1);
  });

  it('after Remove, dragging to the empty release carries a typed 0 and nothing returns', () => {
    const p = rib([entry('S1', 'R1', 0), entry('S1', 'R2', 10)]);
    const next = dragRib(removeRowRecords(p, 'r', 'R2'), 'r', 'R1', 'R2');
    expect(history(next)).toEqual([['S1', 'R2', 0, '']]);
    expect(series(next)).toEqual([0, 0, 0]);
  });
});

describe('Remove on a release the rib has left', () => {
  it('reaches a parked rib, one release at a time, and a comment survives', () => {
    const p = rib([entry('S1', 'R1', 30), entry('S2', 'R1', 40, 'note'), entry('S1', 'R2', 20)], []);
    expect(listed(p)).toEqual(['R1:S1+S2', 'R2:S1']);
    const first = removeRowRecords(p, 'r', 'R1');
    expect(history(first)).toEqual([['S2', 'R1', null, 'note'], ['S1', 'R2', 20, '']]);
    expect(listed(first)).toEqual(['R2:S1']);
    const second = removeRowRecords(first, 'r', 'R2');
    expect(history(second)).toEqual([['S2', 'R1', null, 'note']]);
    expect(listed(second)).toEqual([]);
    expect(series(second)).toEqual([0, 0, 0]);
    expect(locked(second)).toBe(false);
  });

  it('takes a 0 and a null beside the positive ones, because they are the row\'s records', () => {
    const next = removeRowRecords(rib([entry('S1', 'R2', 30), entry('S2', 'R2', 0), entry('S3', 'R2', null)]), 'r', 'R2');
    expect(history(next)).toEqual([]);
  });

  it('keeps a comment on a 0, and an entry that is already only a comment is not re-dated', () => {
    const note = { ...entry('S3', 'R2', null, 'only a note'), updatedAt: OLD };
    const next = removeRowRecords(rib([entry('S1', 'R2', 30), entry('S2', 'R2', 0, 'typed'), note]), 'r', 'R2');
    expect(history(next)).toEqual([['S2', 'R2', null, 'typed'], ['S3', 'R2', null, 'only a note']]);
    expect(ribOf(next, 'r').progressHistory[0]?.updatedAt).toBe(NOW);
    expect(ribOf(next, 'r').progressHistory[1]).toBe(note);
  });

  it('leaves an entry for an unknown sprint alone', () => {
    const next = removeRowRecords(rib([entry('GONE', 'R2', 40), entry('S1', 'R2', 30)]), 'r', 'R2');
    expect(history(next)).toEqual([['GONE', 'R2', 40, '']]);
  });

  it('does nothing without a positive record, so a second click writes nothing', () => {
    const once = removeRowRecords(rib([entry('S1', 'R2', 30, 'note')]), 'r', 'R2');
    expect(removeRowRecords(once, 'r', 'R2')).toBe(once);
    const none = rib([]);
    expect(removeRowRecords(none, 'nope', 'R2')).toBe(none);
  });

  it('does nothing on a rib with no history key', () => {
    const p = rib([]);
    delete (ribOf(p, 'r') as Partial<ReturnType<typeof ribOf>>).progressHistory;
    expect(removeRowRecords(p, 'r', 'R2')).toBe(p);
    expect(bringRecordsHere(p, 'r', 'R2')).toBe(p);
    expect(clearRibProgress(p, 'r')).toBe(p);
  });

  it('does not edit the product it was given', () => {
    const p = rib([entry('S1', 'R2', 30, 'note')], []);
    const before = JSON.stringify(p);
    removeRowRecords(p, 'r', 'R2');
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('clearRibProgress', () => {
  const legacy = { sprintId: 'S1', percentComplete: 15 } as ProgressEntry;
  const everyKind = () => rib([
    entry('S1', 'R1', 10), entry('S1', 'R1', 30, 'shadow note'), entry('S2', 'R1', 0), entry('S3', 'R1', null, 'comment only'),
    entry('S1', 'R2', 40, 'inert note'), entry('S2', 'R2', 50), entry('GONE', 'R1', 60), legacy, entry('S2', 'R3', null), entry('S3', 'R3', 0, 'typed zero note'),
  ]);

  it('clears every kind of record, keeps every comment, and unlocks', () => {
    const p = everyKind();
    expect(locked(p)).toBe(true);
    const next = clearRibProgress(p, 'r');
    expect(history(next)).toEqual([
      ['S1', 'R1', null, 'shadow note'], ['S3', 'R1', null, 'comment only'], ['S1', 'R2', null, 'inert note'], ['S3', 'R3', null, 'typed zero note'],
    ]);
    expect(series(next)).toEqual([0, 0, 0]);
    expect(listed(next)).toEqual([]);
    expect(locked(next)).toBe(false);
    expect(getProjectTotals(next).completed).toBe(0);
  });

  it('stamps the entries that changed, and not one that was already only a comment', () => {
    const note = { ...entry('S3', 'R1', null, 'only a note'), updatedAt: OLD };
    const next = clearRibProgress(rib([entry('S1', 'R1', 10, 'typed'), note]), 'r');
    expect(ribOf(next, 'r').progressHistory[0]).toMatchObject({ percentComplete: null, comment: 'typed', updatedAt: NOW });
    expect(ribOf(next, 'r').progressHistory[1]).toBe(note);
  });

  it('removes an empty null entry, which holds nothing', () => {
    expect(history(clearRibProgress(rib([entry('S1', 'R1', null)]), 'r'))).toEqual([]);
  });

  it('returns the same product when there is nothing to clear', () => {
    const cleared = clearRibProgress(everyKind(), 'r');
    expect(clearRibProgress(cleared, 'r')).toBe(cleared);
    const none = rib([]);
    expect(clearRibProgress(none, 'r')).toBe(none);
    expect(clearRibProgress(none, 'nope')).toBe(none);
  });

  it('touches no other rib and does not edit the product it was given', () => {
    const other = makeRib('other', [on('R1')], [entry('S1', 'R1', 30)]);
    const p = makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R1', 30)]), other]);
    const before = JSON.stringify(p);
    const next = clearRibProgress(p, 'r');
    expect(JSON.stringify(p)).toBe(before);
    expect(ribOf(next, 'other')).toBe(other);
  });
});

describe('ribHasProgress', () => {
  it('is true for any value, a typed 0 and an inert record included', () => {
    expect(ribHasProgress({ progressHistory: [entry('S1', 'R1', 30)] })).toBe(true);
    expect(ribHasProgress({ progressHistory: [entry('S1', 'R1', 0)] })).toBe(true);
    expect(ribHasProgress({ progressHistory: [entry('S1', 'R9', 30)] })).toBe(true);
  });

  it('is false for notes alone, an empty list and an absent one', () => {
    expect(ribHasProgress({ progressHistory: [entry('S1', 'R1', null, 'note')] })).toBe(false);
    expect(ribHasProgress({ progressHistory: [] })).toBe(false);
    expect(ribHasProgress({} as { progressHistory: ProgressEntry[] })).toBe(false);
  });
});
