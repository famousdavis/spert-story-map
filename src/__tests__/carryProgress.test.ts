// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import {
  applyRibTransfer,
  carryProgress,
  describeAllocationMove,
  detectAllocationMove,
  saveRibAllocations,
  withCarriedProgress,
} from '../lib/progressMutations';
import type { ProgressEntry, ReleaseAllocation, RibItem, Sprint } from '../types';
import { completionSeries, entry, makeProduct, makeRib, ribOf, SPRINTS } from './fixtures/progressIntegrity';
import { asRecord } from './testHelpers';

const alloc = (releaseId: string, percentage: number, memo?: string): ReleaseAllocation =>
  (memo === undefined ? { releaseId, percentage } : { releaseId, percentage, memo });

describe('carryProgress', () => {
  it('trades the keys when both releases hold positive records', () => {
    const history = [entry('S2', 'X', 20), entry('S3', 'X', 30), entry('S1', 'Y', 10)];
    expect(carryProgress(history, 'X', 'Y')).toEqual([entry('S2', 'Y', 20), entry('S3', 'Y', 30), entry('S1', 'X', 10)]);
  });

  it('moves the records onto a target that has none', () => {
    expect(carryProgress([entry('S1', 'X', 10)], 'X', 'Y')).toEqual([entry('S1', 'Y', 10)]);
  });

  it('keeps comments, updatedAt and array positions with their entries', () => {
    const history: ProgressEntry[] = [
      { sprintId: 'S1', releaseId: 'W', percentComplete: 5 },
      { sprintId: 'S1', releaseId: 'X', percentComplete: 10, comment: 'note', updatedAt: '2026-01-02' },
      { sprintId: 'S2', releaseId: 'Y', percentComplete: 7, comment: 'old', updatedAt: '2025-12-01' },
    ];
    expect(carryProgress(history, 'X', 'Y')).toEqual([
      { sprintId: 'S1', releaseId: 'W', percentComplete: 5 },
      { sprintId: 'S1', releaseId: 'Y', percentComplete: 10, comment: 'note', updatedAt: '2026-01-02' },
      { sprintId: 'S2', releaseId: 'X', percentComplete: 7, comment: 'old', updatedAt: '2025-12-01' },
    ]);
  });

  it('does not mutate the array or its entries', () => {
    const first = entry('S1', 'X', 10);
    const history = [first];
    carryProgress(history, 'X', 'Y');
    expect(history).toEqual([entry('S1', 'X', 10)]);
    expect(history[0]).toBe(first);
  });

  describe('nothing recorded on the source, positive records on the target', () => {
    it('leaves history alone, so the target\'s records count again', () => {
      const history = [entry('S1', 'Y', 30)];
      expect(carryProgress(history, 'X', 'Y')).toBe(history);
    });

    it('treats a comment-only entry as nothing recorded', () => {
      const history = [entry('S1', 'X', null, 'blocked'), entry('S1', 'Y', 30)];
      expect(carryProgress(history, 'X', 'Y')).toBe(history);
    });

    it('treats an absent percentage as nothing recorded', () => {
      const history = [{ sprintId: 'S1', releaseId: 'X' } as ProgressEntry, entry('S1', 'Y', 30)];
      expect(carryProgress(history, 'X', 'Y')).toBe(history);
    });
  });

  describe('a real 0 is a record', () => {
    it('swaps, so the old records stay inert and the rib stays at 0', () => {
      const history = [entry('S1', 'R2', 10), entry('S1', 'R3', 0)];
      expect(carryProgress(history, 'R3', 'R2')).toEqual([entry('S1', 'R3', 10), entry('S1', 'R2', 0)]);
    });

    it('is restored byte for byte by dragging back', () => {
      const history = [entry('S1', 'R2', 10), entry('S1', 'R3', 0)];
      expect(carryProgress(carryProgress(history, 'R3', 'R2'), 'R2', 'R3')).toEqual(history);
    });

    it('swaps when the source holds a real 0 in a different sprint from the target\'s record', () => {
      const history = [entry('S1', 'R2', 10), entry('S2', 'R3', 0)];
      expect(carryProgress(history, 'R3', 'R2')).toEqual([entry('S1', 'R3', 10), entry('S2', 'R2', 0)]);
    });
  });

  it('swaps when the target holds only a real 0: that is not positive', () => {
    const history = [entry('S1', 'Y', 0)];
    expect(carryProgress(history, 'X', 'Y')).toEqual([entry('S1', 'X', 0)]);
  });

  describe('returns the same array when nothing needs renaming', () => {
    it.each([
      ['no source', null, 'Y'],
      ['no target', 'X', null],
      ['same release', 'X', 'X'],
      ['neither release in the history', 'P', 'Q'],
    ] as const)('%s', (_, from, to) => {
      const history = [entry('S1', 'X', 10), entry('S1', 'W', 20)];
      expect(carryProgress(history, from, to)).toBe(history);
    });

    it('accepts an absent history and returns it as is', () => {
      expect(carryProgress(undefined, 'X', 'Y')).toBeUndefined();
    });
  });

  it('never matches a null source against a legacy entry with no release', () => {
    const legacy = { sprintId: 'S1', releaseId: null, percentComplete: 15 } as unknown as ProgressEntry;
    const history = [legacy];
    expect(carryProgress(history, null, 'Y')).toBe(history);
  });

  it('never matches a null target against a legacy entry with no release', () => {
    const legacy = { sprintId: 'S1', releaseId: null, percentComplete: 15 } as unknown as ProgressEntry;
    const history = [legacy, entry('S1', 'X', 10)];
    expect(carryProgress(history, 'X', null)).toBe(history);
  });
});

describe('withCarriedProgress', () => {
  it('returns a new rib holding the carried records', () => {
    const rib = makeRib('r', [], [entry('S1', 'X', 10)]);
    const carried = withCarriedProgress(rib, 'X', 'Y');
    expect(carried.progressHistory).toEqual([entry('S1', 'Y', 10)]);
    expect(rib.progressHistory).toEqual([entry('S1', 'X', 10)]);
  });

  it('returns the same rib when nothing changes', () => {
    const rib = makeRib('r', [], [entry('S1', 'Y', 30)]);
    expect(withCarriedProgress(rib, 'X', 'Y')).toBe(rib);
  });

  it('does not give a rib with no history key one', () => {
    const rib = makeRib('r', [], []);
    delete asRecord(rib).progressHistory;
    expect('progressHistory' in withCarriedProgress(rib, 'X', 'Y')).toBe(false);
  });
});

describe('applyRibTransfer', () => {
  it('moves the allocation and the records together', () => {
    const rib = makeRib('r', [alloc('X', 60, 'keep')], [entry('S1', 'X', 10)]);
    const moved = applyRibTransfer(rib, 'X', 'Y');
    expect(moved.releaseAllocations).toEqual([{ releaseId: 'Y', percentage: 60, memo: 'keep' }]);
    expect(moved.progressHistory).toEqual([entry('S1', 'Y', 10)]);
  });

  it('returns the same rib when the transfer is refused', () => {
    const rib = makeRib('r', [alloc('X', 50), alloc('Y', 50)], [entry('S1', 'X', 10), entry('S1', 'Y', 20)]);
    expect(applyRibTransfer(rib, 'X', 'Y')).toBe(rib);
  });

  it('keeps the records where they are on a drop', () => {
    const history = [entry('S1', 'X', 10)];
    const dropped = applyRibTransfer(makeRib('r', [alloc('X', 100)], history), 'X', null);
    expect(dropped.releaseAllocations).toEqual([]);
    expect(dropped.progressHistory).toBe(history);
  });

  it('carries nothing from Unassigned', () => {
    const history = [entry('S1', 'X', 40)];
    const placed = applyRibTransfer(makeRib('r', [], history), null, 'Y');
    expect(placed.releaseAllocations).toEqual([{ releaseId: 'Y', percentage: 100, memo: '' }]);
    expect(placed.progressHistory).toBe(history);
  });

  it('does not carry when `from` is no longer on the rib', () => {
    // A cloud echo or AI op can move the rib mid-drag. The swap would promote
    // X's inert 25 and the rib would read 65.
    const history = [entry('S1', 'Z', 40), entry('S1', 'X', 25)];
    const moved = applyRibTransfer(makeRib('r', [alloc('Z', 100)], history), 'X', 'Y');
    expect(moved.progressHistory).toBe(history);
  });

  it('does not throw on a drop when the rib has no allocation list', () => {
    const rib = makeRib('r', [], []);
    delete asRecord(rib).releaseAllocations;
    expect(applyRibTransfer(rib, 'X', null).releaseAllocations).toEqual([]);
  });
});

describe('detectAllocationMove', () => {
  it('is a move at any percentage', () => {
    expect(detectAllocationMove([alloc('X', 60)], [alloc('Y', 100)])).toEqual({ from: 'X', to: 'Y' });
  });

  it('finds the move on a split rib, with the other release kept', () => {
    expect(detectAllocationMove([alloc('X', 50), alloc('W', 50)], [alloc('W', 50), alloc('Y', 50)])).toEqual({ from: 'X', to: 'Y' });
  });

  it.each([
    ['nothing changed', [alloc('X', 100)], [alloc('X', 100)]],
    ['only a percentage changed', [alloc('X', 100)], [alloc('X', 60)]],
    ['one added, none removed', [alloc('X', 100)], [alloc('X', 100), alloc('Y', 30)]],
    ['one removed, none added', [alloc('X', 50), alloc('W', 50)], [alloc('W', 50)]],
    ['two removed, one added', [alloc('X', 50), alloc('W', 50)], [alloc('Y', 100)]],
    ['one removed, two added', [alloc('X', 100)], [alloc('Y', 50), alloc('Z', 50)]],
    ['everything removed', [alloc('X', 100)], []],
    ['allocating an unassigned rib', [], [alloc('Y', 100)]],
  ])('is not a move: %s', (_, current, next) => {
    expect(detectAllocationMove(current, next)).toBeNull();
  });

  it('compares distinct releases, so a duplicate row is one release', () => {
    expect(detectAllocationMove([alloc('X', 40), alloc('X', 60)], [alloc('Y', 100)])).toEqual({ from: 'X', to: 'Y' });
  });

  describe('a 0% row is absent on both sides', () => {
    it('in the next list: a release typed down to 0 is removed', () => {
      expect(detectAllocationMove([alloc('X', 100)], [alloc('X', 0), alloc('Y', 100)])).toEqual({ from: 'X', to: 'Y' });
    });

    it('in the next list: a release added at 0 is not added', () => {
      expect(detectAllocationMove([alloc('X', 100)], [alloc('Y', 0)])).toBeNull();
    });

    it('in the current list: a stored 0% row does not stop a real move being seen', () => {
      expect(detectAllocationMove([alloc('R1', 0), alloc('R2', 100)], [alloc('R3', 100)])).toEqual({ from: 'R2', to: 'R3' });
    });

    it('in the current list: a stored 0% row is not a source, so its records stay inert', () => {
      expect(detectAllocationMove([alloc('R1', 0)], [alloc('R3', 100)])).toBeNull();
    });
  });
});

describe('describeAllocationMove', () => {
  const on = (history: ProgressEntry[]) => ({ releaseAllocations: [alloc('X', 100)], progressHistory: history });

  it('says progress moves when the source holds positive records', () => {
    expect(describeAllocationMove(on([entry('S1', 'X', 10)]), [alloc('Y', 100)])).toEqual({ toReleaseId: 'Y', effect: 'carries' });
  });

  it('says progress moves when both sides hold positive records', () => {
    expect(describeAllocationMove(on([entry('S1', 'X', 10), entry('S1', 'Y', 30)]), [alloc('Y', 100)]))
      .toEqual({ toReleaseId: 'Y', effect: 'carries' });
  });

  it('says old progress counts again when the rib has nothing recorded', () => {
    expect(describeAllocationMove(on([entry('S1', 'Y', 30)]), [alloc('Y', 100)])).toEqual({ toReleaseId: 'Y', effect: 'counts-again' });
  });

  it('says nothing when a typed 0 keeps the old records out', () => {
    expect(describeAllocationMove(on([entry('S1', 'X', 0), entry('S1', 'Y', 30)]), [alloc('Y', 100)])).toBeNull();
  });

  it('says nothing when there is no progress on either side', () => {
    expect(describeAllocationMove(on([]), [alloc('Y', 100)])).toBeNull();
  });

  it('says nothing when it is not a move', () => {
    expect(describeAllocationMove(on([entry('S1', 'X', 10)]), [])).toBeNull();
  });

  it('does not throw on an absent history', () => {
    const rib = { releaseAllocations: [alloc('X', 100)] } as Pick<RibItem, 'releaseAllocations' | 'progressHistory'>;
    expect(describeAllocationMove(rib, [alloc('Y', 100)])).toBeNull();
  });
});

describe('saveRibAllocations', () => {
  it('stores the saved list on a move, with what was typed in the same Save', () => {
    const product = makeProduct([makeRib('r', [alloc('X', 100, 'old memo')], [entry('S1', 'X', 10)])]);
    const saved = [alloc('Y', 60, 'typed')];
    const rib = ribOf(saveRibAllocations(product, 'r', saved), 'r');
    expect(rib.releaseAllocations).toBe(saved);
    expect(rib.progressHistory).toEqual([entry('S1', 'Y', 10)]);
  });

  it.each([
    ['Remove and Save', [alloc('R1', 50), alloc('R2', 50)], [alloc('R2', 50)]],
    ['Unassign All', [alloc('R1', 100)], []],
    ['adding a release', [alloc('R1', 100)], [alloc('R1', 100), alloc('R2', 30)]],
    ['two out, one in', [alloc('R1', 50), alloc('R2', 50)], [alloc('R3', 100)]],
  ])('leaves history untouched and stores the list: %s', (_, current, saved) => {
    const history = [entry('S1', 'R1', 20)];
    const rib = ribOf(saveRibAllocations(makeProduct([makeRib('r', current, history)]), 'r', saved), 'r');
    expect(rib.releaseAllocations).toBe(saved);
    expect(rib.progressHistory).toBe(history);
  });

  it('leaves other ribs alone', () => {
    const other = makeRib('q', [alloc('X', 100)], [entry('S1', 'X', 5)]);
    const next = saveRibAllocations(makeProduct([makeRib('r', [alloc('X', 100)], []), other]), 'r', [alloc('Y', 100)]);
    expect(ribOf(next, 'q')).toBe(other);
  });

  it('does not throw, or add a key, on an absent history', () => {
    const rib = makeRib('r', [alloc('X', 100)], []);
    delete asRecord(rib).progressHistory;
    const saved = ribOf(saveRibAllocations(makeProduct([rib]), 'r', [alloc('Y', 100)]), 'r');
    expect(saved.releaseAllocations).toEqual([alloc('Y', 100)]);
    expect('progressHistory' in saved).toBe(false);
  });

  it('does not throw on a rib with no allocation list', () => {
    const rib = makeRib('r', [], []);
    delete asRecord(rib).releaseAllocations;
    expect(ribOf(saveRibAllocations(makeProduct([rib]), 'r', [alloc('Y', 100)]), 'r').releaseAllocations).toEqual([alloc('Y', 100)]);
  });
});

// ─── Seeded properties ──────────────────────────────────────────────

/**
 * High bits: the low bits of this generator alternate, which once produced a
 * probe where a whole branch read zero on the control as well.
 */
function seededRandom(seed: number) {
  let state = seed;
  return (n: number) => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
    return (state >>> 16) % n;
  };
}

const PROPERTY_SPRINTS: Sprint[] = [...SPRINTS, { id: 'S4', name: 'S4', order: 4, endDate: null }];

type Rnd = (n: number) => number;

function randomPercent(rnd: Rnd): number | null {
  const kind = rnd(6);
  if (kind === 0) return null;
  return kind === 1 ? 0 : rnd(11) * 10;
}

/** One release's entries. `forced`, when given, is every entry's percentage and rules out a shadowed duplicate. */
function randomEntries(rnd: Rnd, releaseId: string, forced?: 0 | null): ProgressEntry[] {
  const entries: ProgressEntry[] = [];
  for (const sprintId of ['S1', 'S2', 'S3', 'S4', 'UNKNOWN-SPRINT']) {
    if (rnd(3) === 0) continue;
    const percentComplete = forced === undefined ? randomPercent(rnd) : forced;
    entries.push({ sprintId, releaseId, percentComplete, comment: rnd(4) === 0 ? `c${rnd(9)}` : '', updatedAt: `u${rnd(99)}` });
    if (forced === undefined && rnd(8) === 0) entries.push({ sprintId, releaseId, percentComplete: rnd(5) * 10, comment: 'shadowed' });
  }
  return entries;
}

function shuffled<T>(rnd: Rnd, list: T[]): T[] {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    const a = result[i];
    const b = result[j];
    if (a !== undefined && b !== undefined) { result[i] = b; result[j] = a; }
  }
  return result;
}

function randomHistory(rnd: Rnd): ProgressEntry[] {
  // Left to chance, a source with nothing recorded is rare (about 1 rib in 65),
  // and it is the branch where a move changes what the rib reads. One rib in four
  // is steered there, half to a source of comments only, half to real zeros.
  const sourceKind = rnd(8);
  const forcedSource = sourceKind === 0 ? null : sourceKind === 1 ? 0 : undefined;
  const history = [...randomEntries(rnd, 'X', forcedSource), ...randomEntries(rnd, 'Y'), ...randomEntries(rnd, 'W')];
  if (rnd(5) === 0) history.push({ sprintId: 'S1', percentComplete: 15 } as ProgressEntry); // legacy: no releaseId
  return shuffled(rnd, history);
}

function randomAllocations(rnd: Rnd): ReleaseAllocation[] {
  switch (rnd(5)) {
    case 0: return [alloc('X', 100, 'm')];
    case 1: return [alloc('X', 60)];
    case 2: return [alloc('X', 50), alloc('W', 50)];
    case 3: return [alloc('X', 70), alloc('W', 60)]; // over-allocated
    default: return [alloc('X', 40), alloc('X', 90), alloc('W', 30)]; // duplicate row
  }
}

const bySprint = (history: ProgressEntry[]) =>
  history.map(e => JSON.stringify([e.sprintId, e.percentComplete, e.comment, e.updatedAt])).sort();
const onRelease = (history: ProgressEntry[], releaseId: string | undefined) => history.filter(e => e.releaseId === releaseId);
const holds = (history: ProgressEntry[], releaseId: string, test: (p: number | null | undefined) => boolean) =>
  history.some(e => e.releaseId === releaseId && test(e.percentComplete));

describe('carry properties, seeded', () => {
  const rnd = seededRandom(20261105);
  const ribs: RibItem[] = Array.from({ length: 6000 }, (_, i) => makeRib(`r${i}`, randomAllocations(rnd), randomHistory(rnd)));

  const nothingRecorded = (h: ProgressEntry[]) => !holds(h, 'X', p => p !== null && p !== undefined);
  const leftAlone = (rib: RibItem) => holds(rib.progressHistory, 'Y', p => (p ?? 0) > 0) && nothingRecorded(rib.progressHistory);
  const swapped = ribs.filter(r => !leftAlone(r));
  const countAgain = ribs.filter(leftAlone);
  const typedZero = swapped.filter(r => holds(r.progressHistory, 'X', p => p === 0) && !holds(r.progressHistory, 'X', p => (p ?? 0) > 0) && holds(r.progressHistory, 'Y', p => (p ?? 0) > 0));

  // ⚠️ A property over an empty population passes. These fail if the generator stops producing a branch.
  it('reaches every branch', () => {
    expect(swapped.length).toBeGreaterThan(3000);
    expect(countAgain.length).toBeGreaterThan(300);
    expect(typedZero.length).toBeGreaterThan(300);
  });

  it('loses, adds and alters no entry', () => {
    for (const rib of ribs) {
      expect(bySprint(applyRibTransfer(rib, 'X', 'Y').progressHistory)).toEqual(bySprint(rib.progressHistory));
    }
  });

  it('touches no other release and no legacy entry', () => {
    for (const rib of ribs) {
      const moved = applyRibTransfer(rib, 'X', 'Y').progressHistory;
      expect(onRelease(moved, 'W')).toEqual(onRelease(rib.progressHistory, 'W'));
      expect(onRelease(moved, undefined)).toEqual(onRelease(rib.progressHistory, undefined));
    }
  });

  it('a swap leaves completion unchanged at every sprint', () => {
    for (const rib of swapped) {
      expect(completionSeries(applyRibTransfer(rib, 'X', 'Y'), PROPERTY_SPRINTS)).toEqual(completionSeries(rib, PROPERTY_SPRINTS));
    }
  });

  it('there and back is byte-identical on the swap branch', () => {
    for (const rib of swapped) {
      const back = applyRibTransfer(applyRibTransfer(rib, 'X', 'Y'), 'Y', 'X');
      expect(JSON.stringify(back.progressHistory)).toBe(JSON.stringify(rib.progressHistory));
    }
  });

  it('a typed 0 stays 0, there and back', () => {
    for (const rib of typedZero) {
      const there = applyRibTransfer(rib, 'X', 'Y');
      expect(completionSeries(there, PROPERTY_SPRINTS)).toEqual(completionSeries(rib, PROPERTY_SPRINTS));
      expect(JSON.stringify(applyRibTransfer(there, 'Y', 'X').progressHistory)).toBe(JSON.stringify(rib.progressHistory));
    }
  });

  it('with nothing recorded on the source, the target\'s records count', () => {
    for (const rib of countAgain) {
      const moved = applyRibTransfer(rib, 'X', 'Y');
      expect(moved.progressHistory).toBe(rib.progressHistory);
      // Y takes over X's row at X's percentage, so what counts is Y's own records under that row.
      const asIfAlreadyOnY = { ...rib, releaseAllocations: moved.releaseAllocations };
      expect(completionSeries(moved, PROPERTY_SPRINTS)).toEqual(completionSeries(asIfAlreadyOnY, PROPERTY_SPRINTS));
      expect(moved.releaseAllocations.some(a => a.releaseId === 'Y')).toBe(true);
    }
  });

  it('that branch is the two-drag recovery: dragging back brings the records along', () => {
    for (const rib of countAgain) {
      const back = applyRibTransfer(applyRibTransfer(rib, 'X', 'Y'), 'Y', 'X').progressHistory;
      expect(onRelease(back, 'X').map(e => e.percentComplete)).toEqual(onRelease(rib.progressHistory, 'Y').map(e => e.percentComplete));
    }
  });
});
