// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { getProjectTotals, getReleasePoints, getSprintSummary, getUnknownReleaseTotals } from '../lib/calculations';
import { bringRecordsHere, clearRibProgress, removeRowRecords } from '../lib/progressMutations';
import { bringHereTarget, completion, progressAsOf } from '../lib/progressRule';
import { getReconciliationRows, getStrandedRows } from '../lib/reconciliation';
import { isRibLocked } from '../lib/ribHelpers';
import type { Product, ProgressEntry, ReleaseAllocation, RibItem, Size, Sprint } from '../types';

/**
 * Seeded properties of the rule. ⚠️ The first line of the identity holds for any
 * shared allocation arithmetic, so these are not a test of the rule by themselves;
 * the hand-computed goldens in progressWalkthrough.test.ts are. What these add is
 * reach: every awkward shape at once. The over-count is summed per rib and the
 * release figures per allocation, so the identity's second line compares two
 * separately computed sums.
 *
 * Sums are compared with a tolerance: equal formulas differ in floating point.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RELEASES = ['r0', 'r1', 'r2', 'r3'];

/** Inert records, splits, skipped sprints, duplicate rows, reduced and over-allocation, out-of-order histories, null percentages, parked ribs. */
function randomProject(seed: number, { inert = true } = {}): Product {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
  const n = (max: number) => Math.floor(r() * (max + 1));

  const sprints: Sprint[] = Array.from({ length: 1 + n(6) }, (_, i) => ({ id: `s${i}`, name: `s${i}`, order: i + 1, endDate: null }));
  if (r() < 0.4) sprints.reverse();
  const sprintIds = sprints.map(s => s.id);

  const rib = (k: number): RibItem => {
    const allocations: ReleaseAllocation[] = Array.from({ length: n(3) }, () => ({
      releaseId: inert ? pick([...RELEASES, 'gone']) : pick(RELEASES),
      percentage: pick([0, 10, 25, 50, 60, 100]),
    }));
    if (inert && r() < 0.05) delete (allocations[0] as Partial<ReleaseAllocation> | undefined)?.percentage;
    const history: ProgressEntry[] = Array.from({ length: n(9) }, () => ({
      sprintId: pick(inert ? [...sprintIds, 'unknown'] : sprintIds),
      releaseId: inert ? pick([...RELEASES, 'r0', 'gone']) : pick(allocations.length > 0 ? allocations.map(a => a.releaseId) : ['r0']),
      percentComplete: pick([null, 0, 10, 20, 40, 60, 100, 33.3]),
    }));
    // Over-allocated with work done on both sides, the shape `V` exists for. Random
    // draws almost never reach it.
    if (r() < 0.25) {
      allocations.splice(0, allocations.length, { releaseId: 'r0', percentage: 60 }, { releaseId: 'r1', percentage: 60 });
      history.push({ sprintId: pick(sprintIds), releaseId: 'r0', percentComplete: 60 }, { sprintId: pick(sprintIds), releaseId: 'r1', percentComplete: 50 });
    }
    return {
      id: `k${k}`, name: 'R', description: '', order: k, size: pick(['S', 'M', 'L'] as const) as Size,
      category: pick(['core', 'non-core'] as const), releaseAllocations: allocations, progressHistory: history, notes: '',
    };
  };

  let k = 0;
  return {
    id: `p${seed}`, name: 'P', description: '', createdAt: '', schemaVersion: 2,
    sizeMapping: [{ label: 'S', points: 3 }, { label: 'M', points: 5 }, { label: 'L', points: 8 }],
    sprints,
    releases: RELEASES.map((id, i) => ({ id, name: id, order: i })),
    themes: [{ id: 't', name: 'T', order: 1, backboneItems: [{ id: 'b', name: 'B', order: 1, ribItems: Array.from({ length: n(7) }, () => rib(k++)) }] }],
  };
}

const SEEDS = 600;
const everyProject = (visit: (p: Product, seed: number) => void) => {
  for (let seed = 1; seed <= SEEDS; seed++) visit(randomProject(seed), seed);
};

describe('the identity (I1)', () => {
  it('holds for every project and every sprint, over the totals table', () => {
    let checked = 0;
    let withOverCount = 0;
    let withUnknown = 0;
    everyProject(p => {
      for (const s of p.sprints) {
        const t = getProjectTotals(p, s.id);
        const unknown = getUnknownReleaseTotals(p, s.id);
        const releases = p.releases.map(r => getReleasePoints(p, r.id, s.id));
        const allocated = releases.reduce((sum, r) => sum + r.allocated, unknown?.allocated ?? 0);
        const completed = releases.reduce((sum, r) => sum + r.completed, unknown?.completed ?? 0);
        const { total: U } = t.unallocated;
        const { total: O } = t.overAllocated;
        const V = t.overCount;
        expect(allocated + U - O).toBeCloseTo(t.total, 8);
        expect(completed - V).toBeCloseTo(t.completed, 8);
        expect((allocated - completed) + U - (O - V)).toBeCloseTo(t.total - t.completed, 8);
        checked++;
        if (V > 0) withOverCount++;
        if (unknown) withUnknown++;
      }
    });
    // The awkward shapes must actually occur, or the property says little.
    expect(checked).toBeGreaterThan(1500);
    expect(withOverCount).toBeGreaterThan(100);
    expect(withUnknown).toBeGreaterThan(100);
  });

  it('the row builder\'s lines add the releases up to its total', () => {
    everyProject(p => {
      const rows = getReconciliationRows(p);
      const total = rows.find(r => r.kind === 'total');
      const lines = rows.filter(r => r.kind !== 'total');
      const releases = p.releases.map(r => getReleasePoints(p, r.id));
      const remaining = releases.reduce((sum, r) => sum + r.allocated - r.completed, 0);
      const points = releases.reduce((sum, r) => sum + r.allocated, 0);
      expect(lines.reduce((sum, r) => sum + r.points, points)).toBeCloseTo(total?.points ?? NaN, 8);
      expect(lines.reduce((sum, r) => sum + r.remaining, remaining)).toBeCloseTo(total?.remaining ?? NaN, 8);
    });
  });
});

describe('remaining', () => {
  it('is never negative, and no figure is NaN', () => {
    everyProject(p => {
      for (const s of p.sprints) {
        const t = getProjectTotals(p, s.id);
        expect(t.total - t.completed).toBeGreaterThanOrEqual(-1e-9);
        expect(t.overCount).toBeGreaterThanOrEqual(-1e-9);
        expect(Number.isFinite(t.completed)).toBe(true);
        expect(Number.isFinite(t.unallocated.total)).toBe(true);
        expect(Number.isFinite(t.overAllocated.total)).toBe(true);
      }
    });
  });
});

describe('inert records', () => {
  /** A copy of `p` with a record for each kind of inert: a release the rib left, an unknown sprint, a shadowed duplicate. */
  function withInert(p: Product): Product {
    const copy: Product = JSON.parse(JSON.stringify(p));
    for (const rib of copy.themes.flatMap(t => t.backboneItems).flatMap(b => b.ribItems)) {
      const current = new Set(rib.releaseAllocations.map(a => a.releaseId));
      const left = RELEASES.find(id => !current.has(id));
      const first = copy.sprints[0]?.id ?? 'none';
      if (left) rib.progressHistory.push({ sprintId: first, releaseId: left, percentComplete: 77 });
      rib.progressHistory.push({ sprintId: 'unknown', releaseId: rib.releaseAllocations[0]?.releaseId ?? 'r0', percentComplete: 55 });
      for (const e of [...rib.progressHistory]) {
        if (current.has(e.releaseId) && e.sprintId !== 'unknown') rib.progressHistory.push({ ...e, percentComplete: 99 });
      }
    }
    return copy;
  }

  it('change no number', () => {
    let compared = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const p = randomProject(seed, { inert: false });
      const q = withInert(p);
      for (const s of p.sprints) {
        expect(getProjectTotals(q, s.id)).toEqual(getProjectTotals(p, s.id));
        expect(getSprintSummary(q, s.id)).toEqual(getSprintSummary(p, s.id));
        for (const r of RELEASES) expect(getReleasePoints(q, r, s.id)).toEqual(getReleasePoints(p, r, s.id));
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(1500);
  });
});

describe('the actions', () => {
  const ribsOf = (p: Product) => p.themes.flatMap(t => t.backboneItems).flatMap(b => b.ribItems);
  const ribOf = (p: Product, id: string) => ribsOf(p).find(rib => rib.id === id) as RibItem;
  const notes = (p: Product) => ribsOf(p).flatMap(rib => rib.progressHistory).flatMap(e => (e.comment ? [e.comment] : []));

  /** Every third entry carries a note of its own, so a lost one cannot hide behind a twin. */
  function withNotes(p: Product): Product {
    const copy: Product = JSON.parse(JSON.stringify(p));
    let k = 0;
    for (const rib of ribsOf(copy)) {
      rib.progressHistory = rib.progressHistory.map(e => (k++ % 3 === 0 ? { ...e, comment: `note ${k}` } : e));
    }
    return copy;
  }

  const everyAnnotatedProject = (visit: (p: Product) => void) => everyProject(p => visit(withNotes(p)));

  it('Remove on every row changes no figure and no lock, and empties the list', () => {
    let rows = 0;
    everyAnnotatedProject(p => {
      let next = p;
      for (const row of getStrandedRows(p)) {
        next = removeRowRecords(next, row.ribId, row.releaseId);
        rows++;
      }
      expect(getStrandedRows(next)).toEqual([]);
      for (const rib of ribsOf(p)) expect(isRibLocked(ribOf(next, rib.id), p.sprints)).toBe(isRibLocked(rib, p.sprints));
      for (const s of p.sprints) {
        expect(getProjectTotals(next, s.id)).toEqual(getProjectTotals(p, s.id));
        for (const r of RELEASES) expect(getReleasePoints(next, r, s.id)).toEqual(getReleasePoints(p, r, s.id));
      }
    });
    expect(rows).toBeGreaterThan(500);
  });

  it('Remove loses no note', () => {
    everyAnnotatedProject(p => {
      const next = getStrandedRows(p).reduce((product, row) => removeRowRecords(product, row.ribId, row.releaseId), p);
      expect(notes(next).sort()).toEqual(notes(p).sort());
    });
  });

  it('Bring here holds the formula at every sprint, written or not, and the row leaves', () => {
    let rows = 0;
    everyAnnotatedProject(p => {
      const releaseIds = new Set(p.releases.map(r => r.id));
      for (const row of getStrandedRows(p)) {
        if (!row.bringHereTo) continue;
        const before = ribOf(p, row.ribId);
        const target = bringHereTarget(before, row.releaseId, releaseIds);
        expect(target).not.toBeNull();
        const next = bringRecordsHere(p, row.ribId, row.releaseId);
        const after = ribOf(next, row.ribId);
        for (const s of p.sprints) {
          const expected = Math.min(100, progressAsOf(before, row.releaseId, s.id, p.sprints) + progressAsOf(before, target?.releaseId ?? '', s.id, p.sprints));
          expect(progressAsOf(after, target?.releaseId ?? '', s.id, p.sprints)).toBeCloseTo(expected, 8);
        }
        expect(getStrandedRows(next).filter(r => r.ribId === row.ribId && r.releaseId === row.releaseId)).toEqual([]);
        rows++;
      }
    });
    expect(rows).toBeGreaterThan(100);
  });

  it('Bring here cuts no note: each one survives whole, on its own or inside a join', () => {
    everyAnnotatedProject(p => {
      for (const row of getStrandedRows(p)) {
        if (!row.bringHereTo) continue;
        const after = bringRecordsHere(p, row.ribId, row.releaseId);
        const kept = notes(after).join('|');
        // Only a shadowed entry's note can go, and only when an earlier one holds its place.
        const shadowless = new Set(ribOf(p, row.ribId).progressHistory.flatMap(e => {
          const first = ribOf(p, row.ribId).progressHistory.find(x => x.sprintId === e.sprintId && x.releaseId === e.releaseId && x.comment);
          return e.comment && first === e ? [e.comment] : [];
        }));
        for (const note of shadowless) expect(kept).toContain(note);
      }
    });
  });

  it('Clear progress leaves nothing counting, on any rib, and loses no note', () => {
    everyAnnotatedProject(p => {
      const next = ribsOf(p).reduce((product, rib) => clearRibProgress(product, rib.id), p);
      expect(getProjectTotals(next).completed).toBe(0);
      for (const rib of ribsOf(next)) {
        expect(rib.progressHistory.every(e => e.percentComplete === null)).toBe(true);
        for (const s of p.sprints) expect(completion(rib, s.id, p.sprints)).toBe(0);
      }
      expect(notes(next).sort()).toEqual(notes(p).sort());
    });
  });
});
