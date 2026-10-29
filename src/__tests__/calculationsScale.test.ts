// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * W4 — the calculations a project view runs, made linear in a document's size.
 *
 * Nothing caps the NUMBER of sprints, releases, size rows or progress entries a
 * project document holds — only its bytes (1 MiB) — and several calculations
 * were quadratic or worse in those counts: a cloud document built for it froze
 * the Map, Progress and Insights tabs outright. The fixes index or batch the
 * lookups; they must not change a single result.
 *
 * ⚠️ TWO KINDS OF TEST, AND BOTH ARE NEEDED.
 *   1. EQUIVALENCE — the ORIGINAL implementations are kept below, verbatim in
 *      behaviour, as an oracle, and compared with `toBe` (Object.is) over a few
 *      hundred seeded random projects full of the awkward cases: duplicate ids
 *      and orders, unknown sprints, legacy entries with no releaseId, null and
 *      undefined percentages, duplicate size labels. A faster function that
 *      differs anywhere fails here.
 *   2. WORK BOUNDS — counted, not timed: a getter on the field each loop reads
 *      counts how often it is read. The old code read it (count × count) times;
 *      a timing assertion would be flaky, a read count is not.
 */

import { describe, it, expect } from 'vitest';
import * as C from '../lib/calculations';
import * as PV from '../lib/progressViewHelpers';
import { computeLayout, gapButtonAt, gapButtonFor, GAP_BUTTON_HEIGHT } from '../components/storymap/useMapLayout';
import type { Product, RibItem, Sprint, SizeMapping, ProgressEntry, ProgressSource } from '../types';

// ---------------------------------------------------------------------------
// The oracle: the pre-W4 implementations.
// ---------------------------------------------------------------------------
const O = {
  points(rib: Pick<RibItem, 'size'>, sm: SizeMapping[]): number {
    if (!rib.size) return 0;
    const m = sm.find(x => x.label === rib.size);
    return m ? m.points : 0;
  },
  forSprint(rib: ProgressSource, releaseId: string, sprintId: string): number | null {
    const e = rib.progressHistory?.find(p => p.sprintId === sprintId && p.releaseId === releaseId);
    return e?.percentComplete ?? null;
  },
  latest(rib: ProgressSource, releaseId: string): number {
    if (!rib.progressHistory || rib.progressHistory.length === 0) return 0;
    const es = rib.progressHistory.filter(p => p.releaseId === releaseId && p.percentComplete !== null);
    return es[es.length - 1]?.percentComplete ?? 0;
  },
  asOf(rib: ProgressSource, releaseId: string, sprintId: string, sprints: Sprint[]): number {
    if (!rib.progressHistory || rib.progressHistory.length === 0) return 0;
    if (!sprintId || !sprints) return O.latest(rib, releaseId);
    const order: Record<string, number> = {};
    for (const s of sprints) order[s.id] = s.order;
    const target = order[sprintId];
    if (target === undefined) return O.latest(rib, releaseId);
    let best: ProgressEntry | null = null;
    let bestOrder = -1;
    for (const e of rib.progressHistory) {
      if (e.releaseId !== releaseId) continue;
      if (e.percentComplete === null || e.percentComplete === undefined) continue;
      const o = order[e.sprintId];
      if (o !== undefined && o <= target && o > bestOrder) { best = e; bestOrder = o; }
    }
    return best?.percentComplete ?? 0;
  },
  itemForSprint(rib: ProgressSource, sprintId: string): number | null {
    if (!rib.progressHistory) return null;
    const es = rib.progressHistory.filter(p => p.sprintId === sprintId && p.percentComplete !== null);
    if (es.length === 0) return null;
    return Math.min(100, es.reduce((s, e) => s + (e.percentComplete ?? 0), 0));
  },
  item(rib: ProgressSource): number {
    if (!rib.progressHistory || rib.progressHistory.length === 0) return 0;
    const real = rib.progressHistory.filter(e => e.percentComplete !== null);
    const last = real[real.length - 1];
    if (!last) return 0;
    return O.itemForSprint(rib, last.sprintId) ?? 0;
  },
  legacyAsOf(rib: ProgressSource, sprintId: string, sprints: Sprint[]): number {
    const order: Record<string, number> = {};
    for (const s of sprints) order[s.id] = s.order;
    const target = order[sprintId];
    if (target === undefined) return O.item(rib);
    let best: ProgressEntry | null = null;
    let bestOrder = -1;
    for (const e of rib.progressHistory ?? []) {
      if (e.percentComplete === null) continue;
      const o = order[e.sprintId];
      if (o !== undefined && o <= target && o > bestOrder) { best = e; bestOrder = o; }
    }
    return best ? best.percentComplete! : 0;
  },
  itemAsOf(rib: ProgressSource, sprintId: string | null, sprints: Sprint[]): number {
    if (!rib.progressHistory || rib.progressHistory.length === 0) return 0;
    if (!sprintId || !sprints) return O.item(rib);
    const ids = [...new Set(rib.progressHistory.map(p => p.releaseId).filter(Boolean))];
    if (ids.length === 0) return O.legacyAsOf(rib, sprintId, sprints);
    let total = 0;
    for (const id of ids) total += O.asOf(rib, id, sprintId, sprints);
    return Math.min(100, total);
  },
  ribs(p: Product): RibItem[] {
    return p.themes.flatMap(t => t.backboneItems.flatMap(b => b.ribItems));
  },
  releasePoints(p: Product, releaseId: string, sprintId?: string | null) {
    const acc = { allocated: 0, completed: 0 };
    for (const rib of O.ribs(p)) {
      const alloc = rib.releaseAllocations.find(a => a.releaseId === releaseId);
      if (!alloc) continue;
      const pts = O.points(rib, p.sizeMapping) * (alloc.percentage / 100);
      acc.allocated += pts;
      const prog = sprintId ? O.asOf(rib, releaseId, sprintId, p.sprints) : O.latest(rib, releaseId);
      acc.completed += pts * (alloc.percentage > 0 ? Math.min(prog, alloc.percentage) / alloc.percentage : 0);
    }
    return acc;
  },
  coreNonCore(p: Product, releaseId: string) {
    const acc = { core: 0, nonCore: 0 };
    for (const rib of O.ribs(p)) {
      const alloc = rib.releaseAllocations.find(a => a.releaseId === releaseId);
      if (!alloc) continue;
      const pts = O.points(rib, p.sizeMapping) * (alloc.percentage / 100);
      if (rib.category === 'non-core') acc.nonCore += pts; else acc.core += pts;
    }
    return acc;
  },
  commentCount(rib: ProgressSource, releaseId: string) {
    return (rib.progressHistory ?? []).filter(p => p.releaseId === releaseId && p.comment).length;
  },
};

// ---------------------------------------------------------------------------
// Seeded random projects, heavy on the awkward cases.
// ---------------------------------------------------------------------------
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

function randomProduct(seed: number): Product {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const n = (max: number) => Math.floor(r() * (max + 1));
  const sprintIds = ['s0', 's1', 's2', 's3', 's4', 's5'];
  const releaseIds = ['r0', 'r1', 'r2', 'r3'];
  const sprints = Array.from({ length: n(8) }, () => ({ id: pick(sprintIds), name: 'S', order: n(6), endDate: null }));
  const sizeMapping = [{ label: 'S', points: 3 }, { label: 'M', points: 5 }, { label: 'M', points: 99 }, { label: 'L', points: 8 }];
  const rib = (k: number): RibItem => ({
    id: `k${seed}-${k}`, name: 'R', description: '', order: k,
    size: pick(['S', 'M', 'L', 'XL', null, ''] as const) as RibItem['size'],
    category: pick(['core', 'non-core'] as const),
    releaseAllocations: Array.from({ length: n(3) }, () => ({ releaseId: pick(releaseIds), percentage: pick([0, 25, 30, 50, 100]) })),
    progressHistory: Array.from({ length: n(9) }, () => {
      const e: ProgressEntry = { sprintId: pick([...sprintIds, 'unknown']), releaseId: pick([...releaseIds, '', undefined, undefined] as const) as string, percentComplete: pick([null, 0, 10, 40, 60, 100, 33.3]) };
      if (r() < 0.15) delete (e as Partial<ProgressEntry>).percentComplete;
      if (r() < 0.3) e.comment = 'c';
      return e;
    }),
  });
  let k = 0;
  return {
    id: `p${seed}`, name: 'P', description: '', createdAt: '', schemaVersion: 2,
    sizeMapping, sprints,
    releases: releaseIds.map((id, i) => ({ id, name: id, order: i })),
    themes: Array.from({ length: 1 + n(1) }, (_, t) => ({
      id: `t${t}`, name: 'T', order: t,
      backboneItems: Array.from({ length: 1 + n(1) }, (_, b) => ({ id: `t${t}b${b}`, name: 'B', order: b, ribItems: Array.from({ length: n(5) }, () => rib(k++)) })),
    })),
  };
}

describe('W4 calculations — identical results to the original implementations', () => {
  const sprintsToAsk = (p: Product) => [...new Set(p.sprints.map(s => s.id)), 'unknown', null];

  function checkRelease(p: Product, rib: RibItem, rel: string) {
    expect(C.getRibReleaseProgress(rib, rel)).toBe(O.latest(rib, rel));
    expect(PV.getCommentCount(rib, rel || 'r0')).toBe(O.commentCount(rib, rel || 'r0'));
    for (const s of sprintsToAsk(p)) {
      if (!s) continue;
      expect(C.getRibReleaseProgressForSprint(rib, rel, s)).toBe(O.forSprint(rib, rel, s));
      expect(C.getRibReleaseProgressAsOf(rib, rel, s, p.sprints)).toBe(O.asOf(rib, rel, s, p.sprints));
    }
  }

  it('per-rib progress, points and comment helpers agree on 300 random projects', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const p = randomProduct(seed);
      for (const rib of O.ribs(p)) {
        expect(C.getRibItemPoints(rib, p.sizeMapping)).toBe(O.points(rib, p.sizeMapping));
        for (const rel of ['r0', 'r1', 'r2', 'r3', '']) checkRelease(p, rib, rel);
        for (const s of sprintsToAsk(p)) {
          expect(C.getRibItemPercentCompleteAsOf(rib, s, p.sprints)).toBe(O.itemAsOf(rib, s, p.sprints));
        }
      }
    }
  });

  it('per-release totals agree, for every release and sprint, on 300 random projects', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const p = randomProduct(seed);
      for (const rel of ['r0', 'r1', 'r2', 'r3', 'none']) {
        expect(C.getPointsForRelease(p, rel)).toBe(O.releasePoints(p, rel).allocated);
        expect(C.getCoreNonCorePointsForRelease(p, rel)).toEqual(O.coreNonCore(p, rel));
        for (const s of [...sprintsToAsk(p), undefined]) {
          const got = C.getReleasePoints(p, rel, s);
          const want = O.releasePoints(p, rel, s);
          expect(got.allocated).toBe(want.allocated);
          expect(got.completed).toBe(want.completed);
        }
      }
    }
  });

  it('the over-time chart agrees point for point while under the span bound', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const p = randomProduct(seed);
      const want = p.sprints.map(s => {
        let total = 0;
        let done = 0;
        for (const rib of O.ribs(p)) {
          const pts = O.points(rib, p.sizeMapping);
          total += pts;
          done += pts * (O.itemAsOf(rib, s.id, p.sprints) / 100);
        }
        return { total, done: Math.round(done * 10) / 10 };
      });
      expect(C.getProgressOverTime(p).map(d => ({ total: d.totalPoints, done: d.completedPoints }))).toEqual(want);
    }
  });

  it('charts the latest MAX_CHART_SPRINTS sprints of a longer project', () => {
    const p = randomProduct(7);
    p.sprints = Array.from({ length: C.MAX_CHART_SPRINTS + 100 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, order: i, endDate: null }));
    const data = C.getProgressOverTime(p);
    expect(data).toHaveLength(C.MAX_CHART_SPRINTS);
    expect(data[0]?.sprintId).toBe('s100');
    expect(data[data.length - 1]?.sprintId).toBe(`s${C.MAX_CHART_SPRINTS + 99}`);
  });
});

// ---------------------------------------------------------------------------
// Work bounds — counted field reads.
// ---------------------------------------------------------------------------
function counted<T extends object>(obj: T, key: keyof T, counter: { n: number }): T {
  let value = obj[key];
  Object.defineProperty(obj, key, { get() { counter.n++; return value; }, set(v) { value = v; }, enumerable: true, configurable: true });
  return obj;
}

function flatProduct(ribItems: RibItem[], extra: Partial<Product> = {}): Product {
  return {
    id: 'p', name: 'P', description: '', createdAt: '', schemaVersion: 2,
    sizeMapping: [{ label: 'M', points: 5 }], releases: [{ id: 'r0', name: 'R', order: 1 }], sprints: [],
    themes: [{ id: 't', name: 'T', order: 1, backboneItems: [{ id: 'b', name: 'B', order: 1, ribItems }] }],
    ...extra,
  };
}
const plainRib = (k: number, extra: Partial<RibItem> = {}): RibItem => ({
  id: `k${k}`, name: 'R', description: '', order: k, size: 'M', category: 'core',
  releaseAllocations: [{ releaseId: 'r0', percentage: 100 }],
  progressHistory: [{ sprintId: 's0', releaseId: 'r0', percentComplete: 50 }], ...extra,
});

describe('W4 calculations — work grows with the data, not with its square', () => {
  it('the over-time chart reads each sprint order a bounded number of times per rib', () => {
    const reads = { n: 0 };
    const S = 300, N = 40;
    const sprints = Array.from({ length: S }, (_, i) => counted({ id: `s${i}`, name: '', order: i, endDate: null }, 'order', reads));
    C.getProgressOverTime(flatProduct(Array.from({ length: N }, (_, k) => plainRib(k)), { sprints }));
    // Before: the sprint-order table was rebuilt on every call — S × N × S reads.
    expect(reads.n).toBeLessThan(10 * S * N);
  });

  it('a whole-project total reads each size label once, not once per rib', () => {
    const reads = { n: 0 };
    const M = 50, N = 500;
    const sizeMapping = Array.from({ length: M }, (_, i) => counted({ label: `L${i}`, points: 1 }, 'label', reads));
    C.getTotalProjectPoints(flatProduct(Array.from({ length: N }, (_, k) => plainRib(k, { size: `L${M - 1}` as RibItem['size'] })), { sizeMapping }));
    // Building the index reads each label twice; the old scan read N × M.
    expect(reads.n).toBeLessThanOrEqual(2 * M);
  });

  it('per-release figures for every release cost one pass over the ribs', () => {
    const reads = { n: 0 };
    const R = 200;
    const releases = Array.from({ length: R }, (_, i) => ({ id: `r${i}`, name: '', order: i }));
    const ribs = Array.from({ length: R }, (_, k) => counted(plainRib(k, { releaseAllocations: [{ releaseId: `r${k}`, percentage: 100 }] }), 'releaseAllocations', reads));
    const p = flatProduct(ribs, { releases });
    for (const r of releases) { C.getReleasePercentComplete(p, r.id); C.getPointsForRelease(p, r.id); C.getCoreNonCorePointsForRelease(p, r.id); }
    // Before: three full passes per release — 3 × R × R reads.
    expect(reads.n).toBeLessThan(5 * R);
  });

  it('the Progress table reads a rib history once, not once per allocation', () => {
    const reads = { n: 0 };
    const A = 300;
    const history = Array.from({ length: A }, (_, i) => counted({ sprintId: 's0', releaseId: `r${i}`, percentComplete: 1, comment: 'c' } as ProgressEntry, 'releaseId', reads));
    const rib = plainRib(0, { releaseAllocations: history.map((_, i) => ({ releaseId: `r${i}`, percentage: 1 })), progressHistory: history });
    for (const a of rib.releaseAllocations) { PV.getCommentHistory(rib, a.releaseId, {}, {}); PV.getCommentCount(rib, a.releaseId); PV.getSprintPct(rib, a.releaseId, 's0'); }
    // A small constant per entry; the old filters read A × A.
    expect(reads.n).toBeLessThanOrEqual(4 * A);
  });
});

describe('W4 map layout — lanes × columns', () => {
  const wide = (R: number, Cn: number, reads?: { n: number }): Product => {
    const releases = Array.from({ length: R }, (_, i) => {
      const r = { id: `r${i}`, name: '', order: i };
      return reads ? counted(r, 'id', reads) : r;
    });
    return {
      id: 'p', name: 'P', description: '', createdAt: '', schemaVersion: 2, sizeMapping: [], sprints: [], releases,
      themes: [{ id: 't', name: 'T', order: 1, backboneItems: Array.from({ length: Cn }, (_, b) => ({ id: `b${b}`, name: '', order: b, ribItems: [] })) }],
    };
  };

  it('finds every slot\'s "+ Rib" button under the pointer, on a realistic map', () => {
    const layout = computeLayout(wide(30, 60), []);
    let found = 0;
    for (const lane of [...layout.releaseLanes, null]) {
      for (const col of layout.columns) {
        const gb = gapButtonFor(layout, lane, col);
        if (!gb) continue;
        expect(gapButtonAt(layout, gb.x + gb.width / 2, gb.y + GAP_BUTTON_HEIGHT / 2)).toEqual(gb);
        found++;
      }
    }
    expect(found).toBe((30 + 1) * 60);
    // Off the buttons — a lane label, the gap between columns — there is none.
    expect(gapButtonAt(layout, 10, layout.releaseLanes[0]!.y + 10)).toBeNull();
  });

  it('builds nothing per lane × column on a huge map, and still finds the button under the pointer', () => {
    const layout = computeLayout(wide(400, 400), []);
    expect(Object.keys(layout.ribCounts)).toHaveLength(0);
    expect(layout.releaseLanes).toHaveLength(400);
    expect(layout.columns).toHaveLength(400);
    const lane = layout.releaseLanes[200]!;
    const col = layout.columns[300]!;
    const gb = gapButtonAt(layout, col.x + 20, lane.y + 10);
    expect(gb?.releaseId).toBe(lane.releaseId);
    expect(gb?.backboneId).toBe(col.backboneId);
  });

  it('sizes the lanes without visiting every release × column', () => {
    const reads = { n: 0 };
    const R = 300;
    computeLayout(wide(R, 300, reads), []);
    // Before: each lane built a key from release.id for every column — R × C reads.
    expect(reads.n).toBeLessThan(20 * R);
  });
});
