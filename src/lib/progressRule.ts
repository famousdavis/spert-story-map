// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ProgressEntry, ProgressSource, ReleaseAllocation, Sprint } from '../types';

/**
 * The one statement of how progress counts. Every figure the app shows derives
 * from the functions here; the rest of the app adds points, it never decides
 * what counts.
 *
 * Imports types only, because `ribHelpers` needs the rule and `calculations`
 * imports `ribHelpers`.
 *
 * ⚠️ NOTHING HERE WRITES. A record that does not count stays where it is. Stored
 * data changes only through a user's own action.
 *
 * ⚠️ THE COUNTS ARE UNBOUNDED, so every lookup below is indexed (pattern #65(d)).
 * A project document is limited in bytes, not in sprints, allocations or history
 * rows, and a per-rib or per-allocation scan froze the app once already. The
 * indexes are keyed by array identity and hold the ROWS, not copies of their
 * fields: product state is replaced rather than mutated, so a changed list is a
 * new array, and a field edited in place is still read live.
 */

/** A rib as the rule reads it. Both lists are optional because hand-edited and imported ribs can lack them. */
export type RuleRib = ProgressSource & { releaseAllocations?: ReleaseAllocation[] };

const NO_SPRINTS: Sprint[] = [];

// ─── Sprint order ───────────────────────────────────────────────────

interface SprintOrder { ordered: Sprint[]; rank: Map<string, number> }

const sprintOrderCache = new WeakMap<Sprint[], SprintOrder>();

/**
 * Sprints ascending by `order`; a tie goes to the later array position, which is
 * what a stable sort leaves. `rank` maps an id to its place, a duplicate id
 * resolving to its last place. Never read a sprint list by bare array position:
 * back-filling and imports leave arrays out of order.
 */
function sprintOrder(sprints: Sprint[] | undefined): SprintOrder {
  const list = sprints ?? NO_SPRINTS;
  let order = sprintOrderCache.get(list);
  if (!order) {
    const ordered = [...list].sort((a, b) => a.order - b.order);
    const rank = new Map<string, number>();
    ordered.forEach((s, i) => rank.set(s.id, i));
    order = { ordered, rank };
    sprintOrderCache.set(list, order);
  }
  return order;
}

/** Every sprint in sprint order. Callers must not mutate the array. */
export function orderedSprints(sprints: Sprint[] | undefined): Sprint[] {
  return sprintOrder(sprints).ordered;
}

/** The last sprint in sprint order, or null when there are none. */
export function latestSprintId(sprints: Sprint[] | undefined): string | null {
  const { ordered } = sprintOrder(sprints);
  return ordered[ordered.length - 1]?.id ?? null;
}

/** The sprint before `sprintId` in sprint order, or null for the first or an unknown sprint. */
export function previousSprint(sprints: Sprint[] | undefined, sprintId: string | null): Sprint | null {
  if (!sprintId) return null;
  const { ordered, rank } = sprintOrder(sprints);
  const place = rank.get(sprintId);
  return place === undefined ? null : ordered[place - 1] ?? null;
}

/** "No sprint given" means the latest. An id the product does not hold stays as it is, and counts nothing. */
export function resolveSprintId(sprints: Sprint[] | undefined, sprintId: string | null | undefined): string | null {
  return sprintId || latestSprintId(sprints);
}

// ─── Current allocations ────────────────────────────────────────────

interface AllocationIndex { list: ReleaseAllocation[]; byRelease: Map<string, ReleaseAllocation> }

const allocationCache = new WeakMap<ReleaseAllocation[], AllocationIndex>();

/** Import accepts an allocation with no percentage. One such row must not turn every total into NaN. */
function finitePercentage(allocation: ReleaseAllocation): number {
  const percentage = Number(allocation.percentage);
  return Number.isFinite(percentage) ? percentage : 0;
}

function allocationIndex(rib: RuleRib): AllocationIndex | null {
  const rows = rib.releaseAllocations;
  if (!rows) return null;
  let index = allocationCache.get(rows);
  if (!index) {
    const byRelease = new Map<string, ReleaseAllocation>();
    for (const row of rows) {
      if (byRelease.has(row.releaseId)) continue;
      const percentage = finitePercentage(row);
      byRelease.set(row.releaseId, percentage === row.percentage ? row : { ...row, percentage });
    }
    index = { list: [...byRelease.values()], byRelease };
    allocationCache.set(rows, index);
  }
  return index;
}

/** A rib's allocations: the first row per distinct release, each with a real number. Callers must not mutate the list. */
export function currentAllocations(rib: RuleRib): ReleaseAllocation[] {
  return allocationIndex(rib)?.list ?? [];
}

/** The rib's current allocation to one release, in constant time: the Progress table asks once per row. */
export function allocationTo(rib: RuleRib, releaseId: string): ReleaseAllocation | null {
  return allocationIndex(rib)?.byRelease.get(releaseId) ?? null;
}

// ─── Effective entries ──────────────────────────────────────────────

/**
 * A rib's progress history by `releaseId`, in history order, keyed by every
 * value as the strict-equality filters it replaced saw them (legacy entries
 * group under `undefined`). Callers must not mutate the groups.
 */
const historyGroupsCache = new WeakMap<ProgressEntry[], Map<unknown, ProgressEntry[]>>();
export function historyByRelease(history: ProgressEntry[] | undefined): Map<unknown, ProgressEntry[]> {
  if (!history) return new Map();
  let groups = historyGroupsCache.get(history);
  if (!groups) {
    groups = new Map();
    for (const p of history) {
      const group = groups.get(p.releaseId);
      if (group) group.push(p);
      else groups.set(p.releaseId, [p]);
    }
    historyGroupsCache.set(history, groups);
  }
  return groups;
}

/** One release's records as the rule sees them. */
interface ReleaseSeries {
  /** Sprint id → the first entry with that pair, whose sprint exists. */
  effective: Map<string, ProgressEntry>;
  /** Effective entries holding a value, in sprint order, with their sprint ranks alongside. */
  valued: ProgressEntry[];
  ranks: number[];
}

/** A typed 0 is a value. Only an absent or null percentage is not. */
export const hasValue = (entry: ProgressEntry) => entry.percentComplete !== null && entry.percentComplete !== undefined;

function buildSeries(entries: ProgressEntry[], rank: Map<string, number>): ReleaseSeries {
  const effective = new Map<string, ProgressEntry>();
  for (const entry of entries) {
    if (rank.has(entry.sprintId) && !effective.has(entry.sprintId)) effective.set(entry.sprintId, entry);
  }
  const placed: [number, ProgressEntry][] = [];
  for (const [sprintId, entry] of effective) {
    const place = rank.get(sprintId);
    if (place !== undefined && hasValue(entry)) placed.push([place, entry]);
  }
  placed.sort((a, b) => a[0] - b[0]);
  return { effective, valued: placed.map(p => p[1]), ranks: placed.map(p => p[0]) };
}

/** Keyed on (history, sprints): the same history reads differently against a different sprint list. */
const seriesCache = new WeakMap<ProgressEntry[], WeakMap<Sprint[], Map<unknown, ReleaseSeries>>>();

function seriesByRelease(history: ProgressEntry[] | undefined, sprints: Sprint[] | undefined): Map<unknown, ReleaseSeries> {
  if (!history) return new Map();
  const list = sprints ?? NO_SPRINTS;
  let bySprints = seriesCache.get(history);
  if (!bySprints) {
    bySprints = new WeakMap();
    seriesCache.set(history, bySprints);
  }
  let series = bySprints.get(list);
  if (!series) {
    series = new Map();
    const { rank } = sprintOrder(list);
    for (const [releaseId, entries] of historyByRelease(history)) series.set(releaseId, buildSeries(entries, rank));
    bySprints.set(list, series);
  }
  return series;
}

/** The first entry for (release, sprint), whose sprint exists. */
export function effectiveEntry(rib: ProgressSource, releaseId: string, sprintId: string, sprints: Sprint[] | undefined): ProgressEntry | null {
  return seriesByRelease(rib.progressHistory, sprints).get(releaseId)?.effective.get(sprintId) ?? null;
}

/** The value recorded for exactly this sprint, or null when there is none. */
export function effectiveValue(rib: ProgressSource, releaseId: string, sprintId: string, sprints: Sprint[] | undefined): number | null {
  return effectiveEntry(rib, releaseId, sprintId, sprints)?.percentComplete ?? null;
}

// ─── The rule ───────────────────────────────────────────────────────

/** The effective value at the latest sprint at or before `sprintId`; 0 if none, and 0 for a sprint the product does not hold. */
export function progressAsOf(rib: ProgressSource, releaseId: string, sprintId: string | null, sprints: Sprint[] | undefined): number {
  if (!sprintId) return 0;
  const target = sprintOrder(sprints).rank.get(sprintId);
  if (target === undefined) return 0;
  const series = seriesByRelease(rib.progressHistory, sprints).get(releaseId);
  if (!series) return 0;
  let low = 0;
  let high = series.ranks.length - 1;
  let found: ProgressEntry | undefined;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((series.ranks[middle] ?? Infinity) <= target) {
      found = series.valued[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found?.percentComplete ?? 0;
}

/** What one allocation counts: its progress, up to the allocation. */
export function share(rib: ProgressSource, allocation: ReleaseAllocation, sprintId: string | null, sprints: Sprint[] | undefined): number {
  return Math.min(progressAsOf(rib, allocation.releaseId, sprintId, sprints), allocation.percentage);
}

/** Σ `share` over current allocations, before the cap. Over 100 only on an over-allocated rib. */
export function sharesTotal(rib: RuleRib, sprintId: string | null, sprints: Sprint[] | undefined): number {
  let total = 0;
  for (const allocation of currentAllocations(rib)) total += share(rib, allocation, sprintId, sprints);
  return total;
}

/** The rib's percentage complete: its shares, capped at 100. A rib with no allocations is at 0. */
export function completion(rib: RuleRib, sprintId: string | null, sprints: Sprint[] | undefined): number {
  return Math.min(100, sharesTotal(rib, sprintId, sprints));
}

/** The sprint rank of a series' last entry above 0, or -1. Bounded by the series, never by the sprint list. */
function lastPositiveRank({ valued, ranks }: ReleaseSeries): number {
  for (let i = valued.length - 1; i >= 0; i--) {
    if ((valued[i]?.percentComplete ?? 0) > 0) return ranks[i] ?? -1;
  }
  return -1;
}

/**
 * The sprint that locks a rib: the latest, in sprint order, holding an effective
 * entry above 0 on a current allocation. Null when nothing locks it. A later
 * record under a release the rib left names nothing.
 */
export function lockingSprintId(rib: RuleRib, sprints: Sprint[] | undefined): string | null {
  const series = seriesByRelease(rib.progressHistory, sprints);
  const latest = currentAllocations(rib).reduce((best, allocation) => {
    const found = series.get(allocation.releaseId);
    return found ? Math.max(best, lastPositiveRank(found)) : best;
  }, -1);
  return sprintOrder(sprints).ordered[latest]?.id ?? null;
}

/**
 * Locked: an effective entry above 0 on a current allocation, in any sprint. So
 * an earlier sprint's progress locks even if the latest reads 0, and a record
 * left under another release locks nothing. Read off `lockingSprintId`, so the
 * lock and the sprint that explains it cannot disagree.
 */
export function hasCountingProgress(rib: RuleRib, sprints: Sprint[] | undefined): boolean {
  return lockingSprintId(rib, sprints) !== null;
}

// ─── Stranded records ───────────────────────────────────────────────

/**
 * The records one row of Needs Attention stands for: the entries on a release,
 * with a known sprint, that do not count. On a release the rib has left that is
 * all of them. On a current allocation it is only the entries behind an effective
 * one. A 0 or a null beside the positive ones is one of the row's records.
 *
 * ⚠️ BY IDENTITY, NEVER BY (sprint, release). A row can be a shadowed duplicate
 * on a current allocation, and its pair is the pair of the entry that counts: a
 * filter on the pair takes the counting entry with it. The list and both actions
 * share this one statement so they cannot disagree about what a row is.
 */
export function rowRecords(rib: RuleRib, releaseId: string, sprints: Sprint[] | undefined): ProgressEntry[] {
  const { rank } = sprintOrder(sprints);
  const onRib = allocationTo(rib, releaseId) !== null;
  const effective = seriesByRelease(rib.progressHistory, sprints).get(releaseId)?.effective;
  return (historyByRelease(rib.progressHistory).get(releaseId) ?? []).filter(entry =>
    rank.has(entry.sprintId) && !(onRib && effective?.get(entry.sprintId) === entry),
  );
}

/**
 * Where "Bring here" would put a row's records, or null when it is not offered.
 * Offered only when the rib has exactly one current allocation, above 0, on a
 * release that exists and is not the row's own. A 0% allocation would lock the rib
 * with nothing counting, a deleted release loses the records on re-import, and a
 * release combined with itself would add a series to itself.
 */
export function bringHereTarget(rib: RuleRib, releaseId: string, releaseIds: Set<string>): ReleaseAllocation | null {
  const allocations = currentAllocations(rib);
  const only = allocations.length === 1 ? allocations[0] : undefined;
  if (!only || only.percentage <= 0 || only.releaseId === releaseId || !releaseIds.has(only.releaseId)) return null;
  return only;
}

/** One release's stranded records on one rib. */
export interface StrandedSeries {
  releaseId: string;
  /** The sprints holding them, in sprint order. */
  sprintIds: string[];
  /** What the release's records would count if the rib were on it. Lower than the records when the series ends lower. */
  wouldCount: number;
}

/**
 * Records that hold a value above 0, name a sprint and a release that exist, and
 * do not count: a release the rib left, or a duplicate shadowed by an earlier
 * entry. Legacy entries with no release and entries for an unknown sprint are
 * inert too, but there is no release or sprint to show them against.
 */
export function strandedSeries(rib: RuleRib, releaseIds: Set<string>, sprints: Sprint[] | undefined): StrandedSeries[] {
  const { rank } = sprintOrder(sprints);
  const latest = latestSprintId(sprints);
  const found: StrandedSeries[] = [];
  for (const releaseId of historyByRelease(rib.progressHistory).keys()) {
    if (typeof releaseId !== 'string' || !releaseIds.has(releaseId)) continue;
    const stranded = rowRecords(rib, releaseId, sprints).filter(entry => (entry.percentComplete ?? 0) > 0);
    if (stranded.length === 0) continue;
    // Sorted, not filtered from the sprint list: a per-sprint scan here runs once a row.
    const sprintIds = [...new Set(stranded.map(entry => entry.sprintId))].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    found.push({ releaseId, sprintIds, wouldCount: progressAsOf(rib, releaseId, latest, sprints) });
  }
  return found;
}
