// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// All computed values - pure functions, no side effects
import type { Product, RibItem, SizeMapping, Sprint, Theme, Backbone, ProgressSource, ProgressEntry } from '../types';
import { forEachRib, reduceRibs } from './ribHelpers';

// ⚠️ The two indexes below exist because a project document is not bounded in
// COUNT — only in bytes (1 MiB) — and a linear lookup inside a per-rib or
// per-sprint loop turned that into ribs × rows or sprints² × ribs. A cloud
// document built for it froze the Progress and Insights tabs outright (W4).
// Both are keyed by array identity and hold the ROWS, not copies of their
// fields: product state is replaced rather than mutated, so a changed list is a
// new array, and a field edited in place is still read live.

/** label → size row, first match winning, exactly as `Array#find` did. */
const sizeIndexCache = new WeakMap<SizeMapping[], Map<string, SizeMapping>>();
function sizeIndex(sizeMapping: SizeMapping[]): Map<string, SizeMapping> {
  let index = sizeIndexCache.get(sizeMapping);
  if (!index) {
    index = new Map();
    for (const m of sizeMapping) if (!index.has(m.label)) index.set(m.label, m);
    sizeIndexCache.set(sizeMapping, index);
  }
  return index;
}

/** id → sprint, last duplicate winning, exactly as the `Record` it replaces did. */
const sprintIndexCache = new WeakMap<Sprint[], Map<string, Sprint>>();
function sprintIndex(sprints: Sprint[]): Map<string, Sprint> {
  let index = sprintIndexCache.get(sprints);
  if (!index) {
    index = new Map();
    for (const s of sprints) index.set(s.id, s);
    sprintIndexCache.set(sprints, index);
  }
  return index;
}

/**
 * A rib's progress history by `releaseId`, in history order, keyed by every
 * value as the strict-equality filters it replaces saw them (legacy entries
 * group under `undefined`). Views ask per (rib, release) — the Progress table
 * once per allocation — and each ask used to scan the whole history, so one rib
 * with thousands of allocations and entries froze the table. Callers must not
 * mutate the groups.
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

export function getRibItemPoints(ribItem: Pick<RibItem, 'size'>, sizeMapping: SizeMapping[]): number {
  if (!ribItem.size) return 0;
  const mapping = sizeIndex(sizeMapping).get(ribItem.size);
  return mapping ? mapping.points : 0;
}

export function getAllRibItems(product: Product) {
  const items: (RibItem & { themeName: string; themeId: string; backboneName: string; backboneId: string })[] = [];
  forEachRib(product, (rib, { theme, backbone }) => {
    items.push({ ...rib, themeName: theme.name, themeId: theme.id, backboneName: backbone.name, backboneId: backbone.id });
  });
  return items;
}

/**
 * A rib as getAllRibItems returns it — the rib plus its theme/backbone context.
 * Derived rather than restated so consumers cannot drift from the producer.
 */
export type EnrichedRib = ReturnType<typeof getAllRibItems>[number];

export function getTotalProjectPoints(product: Product): number {
  return reduceRibs(product, (total, rib) => total + getRibItemPoints(rib, product.sizeMapping), 0);
}

export function getPointsForRelease(product: Product, releaseId: string): number {
  return releaseTotals(product, null).get(releaseId)?.allocated ?? 0;
}

export function getCoreNonCorePoints(product: Product) {
  return reduceRibs(product, (acc, rib) => {
    const pts = getRibItemPoints(rib, product.sizeMapping);
    if (rib.category === 'non-core') acc.nonCore += pts;
    else acc.core += pts;
    return acc;
  }, { core: 0, nonCore: 0 });
}

// --- Per-release progress helpers ---

// Get a single release's progress for a specific sprint
export function getRibReleaseProgressForSprint(ribItem: ProgressSource, releaseId: string, sprintId: string): number | null {
  const entry = historyByRelease(ribItem.progressHistory).get(releaseId)?.find(p => p.sprintId === sprintId);
  return entry?.percentComplete ?? null;
}

// Get a single release's progress "as of" a given sprint (walk-back)
export function getRibReleaseProgressAsOf(ribItem: ProgressSource, releaseId: string, sprintId: string, sprints: Sprint[]): number {
  if (!ribItem.progressHistory || ribItem.progressHistory.length === 0) return 0;
  if (!sprintId || !sprints) return getRibReleaseProgress(ribItem, releaseId);
  return releaseProgressAsOf(ribItem.progressHistory, releaseId, sprintId, sprints);
}

/**
 * The walk-back itself, over a history that may already be narrowed to one
 * release (getRibItemPercentCompleteAsOf groups first). Narrowing changes
 * nothing: every read below is filtered by `releaseId` anyway.
 */
function releaseProgressAsOf(history: ProgressEntry[], releaseId: string, sprintId: string, sprints: Sprint[]): number {
  const index = sprintIndex(sprints);
  const targetOrder = index.get(sprintId)?.order;
  if (targetOrder === undefined) return getRibReleaseProgress({ progressHistory: history }, releaseId);

  let best = null;
  let bestOrder = -1;
  for (const entry of history) {
    if (entry.releaseId !== releaseId) continue;
    // Skip undefined as well as null. validateProduct now normalises absent to
    // null on import, but a product imported before that fix can still hold an
    // undefined here — and `best.percentComplete!` used to return it verbatim,
    // so this function returned undefined (NaN downstream) where its sibling
    // getRibReleaseProgress returned 0. The two now agree.
    if (entry.percentComplete === null || entry.percentComplete === undefined) continue;
    const order = index.get(entry.sprintId)?.order;
    if (order !== undefined && order <= targetOrder && order > bestOrder) {
      best = entry;
      bestOrder = order;
    }
  }

  // The guard above keeps only non-null entries, so `?? 0` is the no-match case
  // rather than a fallback for a real entry — same shape as getRibReleaseProgress.
  return best?.percentComplete ?? 0;
}

// Get the latest progress for a single release (last entry by array position)
export function getRibReleaseProgress(ribItem: ProgressSource, releaseId: string): number {
  if (!ribItem.progressHistory || ribItem.progressHistory.length === 0) return 0;
  const entries = (historyByRelease(ribItem.progressHistory).get(releaseId) ?? []).filter(
    p => p.percentComplete !== null
  );
  const last = entries[entries.length - 1];
  // The filter above keeps only non-null percentComplete, so `?? 0` is the
  // empty-list case rather than a fallback for a real entry.
  return last?.percentComplete ?? 0;
}

// --- Overall rib % (sum of per-release entries) ---

// Sum per-release entries for the latest sprint to get overall rib %
export function getRibItemPercentComplete(ribItem: ProgressSource): number {
  if (!ribItem.progressHistory || ribItem.progressHistory.length === 0) return 0;
  const realEntries = ribItem.progressHistory.filter(e => e.percentComplete !== null);
  if (realEntries.length === 0) return 0;
  const lastEntry = realEntries[realEntries.length - 1];
  if (!lastEntry) return 0; // unreachable: realEntries.length was checked above
  // `?? 0` is unreachable: the sprint below is lastEntry's own, so its filtered
  // set contains at least that entry and the callee cannot return null here.
  return getRibItemPercentCompleteForSprint(ribItem, lastEntry.sprintId) ?? 0;
}

// Sum all per-release entries for a given sprint
export function getRibItemPercentCompleteForSprint(ribItem: ProgressSource, sprintId: string): number | null {
  if (!ribItem.progressHistory) return null;
  const entries = ribItem.progressHistory.filter(
    p => p.sprintId === sprintId && p.percentComplete !== null
  );
  if (entries.length === 0) return null;
  return Math.min(100, entries.reduce((sum, e) => sum + (e.percentComplete ?? 0), 0));
}

// Get overall progress "as of" a given sprint — sum per-release walk-backs
// sprintId accepts null — the guard below already treats it as "no sprint".
export function getRibItemPercentCompleteAsOf(ribItem: ProgressSource, sprintId: string | null, sprints: Sprint[]): number {
  if (!ribItem.progressHistory || ribItem.progressHistory.length === 0) return 0;
  if (!sprintId || !sprints) return getRibItemPercentComplete(ribItem);

  // One walk per release group (first-appearance order, as the Set it replaces
  // had; falsy ids skipped, as its `filter(Boolean)` did) — instead of one walk
  // of the WHOLE history per release, which was quadratic in a long history.
  let total = 0;
  let releases = 0;
  for (const [releaseId, entries] of historyByRelease(ribItem.progressHistory)) {
    if (!releaseId) continue;
    releases++;
    total += releaseProgressAsOf(entries, releaseId as string, sprintId, sprints);
  }

  if (releases === 0) {
    return _legacyPercentCompleteAsOf(ribItem, sprintId, sprints);
  }
  return Math.min(100, total);
}

// Fallback for any un-migrated entries (shouldn't happen after migration, but safe)
function _legacyPercentCompleteAsOf(ribItem: ProgressSource, sprintId: string, sprints: Sprint[]): number {
  const index = sprintIndex(sprints);
  const targetOrder = index.get(sprintId)?.order;
  if (targetOrder === undefined) return getRibItemPercentComplete(ribItem);

  let best = null;
  let bestOrder = -1;
  // Its only caller guards this, but the guard does not survive the call.
  for (const entry of ribItem.progressHistory ?? []) {
    if (entry.percentComplete === null) continue;
    const order = index.get(entry.sprintId)?.order;
    if (order !== undefined && order <= targetOrder && order > bestOrder) {
      best = entry;
      bestOrder = order;
    }
  }
  return best ? best.percentComplete! : 0;
}

// --- Release-level calculations ---

/**
 * A release's allocated points, and how many of them are done: as of `sprintId`
 * (walking back through earlier sprints), or the latest recorded progress when
 * no sprint is given.
 *
 * The ONE statement of how per-release progress counts against an allocation.
 * A progress entry records the share of the WHOLE rib finished under that
 * release (the Progress tab caps it at the allocation), so it completes the
 * release's portion on reaching the allocation percentage and counts nothing
 * beyond it. `getReleasePercentComplete`, `getReleaseProgressOverTime` and the
 * Forecaster export all read this, so the percentage the Progress tab shows
 * and the remaining work the export sends cannot disagree.
 *
 * `sprintId` accepts null as well as undefined — the progress view represents
 * "no sprint selected" as null, and the branch below is a truthy check that
 * already treated the two identically.
 */
export function getReleasePoints(product: Product, releaseId: string, sprintId?: string | null): { allocated: number; completed: number } {
  const t = releaseTotals(product, sprintId).get(releaseId);
  return { allocated: t?.allocated ?? 0, completed: t?.completed ?? 0 };
}

interface ReleaseTotals { allocated: number; completed: number; core: number; nonCore: number }

/**
 * Every release's totals in ONE pass over the ribs, cached per product object
 * and sprint. The per-release functions used to be a full pass over every rib
 * each, and the views call them once per release — releases × ribs, which a
 * document holding thousands of both turned into a multi-second freeze of
 * Release Planning and Progress (W4). Each release still receives the same
 * additions in the same rib order, so every total is bit-identical; and, as the
 * `Array#find` it replaces did, only a rib's FIRST allocation to a release counts.
 * Keyed by product identity: product state is replaced on every change.
 */
const releaseTotalsCache = new WeakMap<Product, Map<string, Map<string, ReleaseTotals>>>();

function releaseTotals(product: Product, sprintId: string | null | undefined): Map<string, ReleaseTotals> {
  const key = sprintId ? `s:${sprintId}` : '';
  let bySprint = releaseTotalsCache.get(product);
  if (!bySprint) {
    bySprint = new Map();
    releaseTotalsCache.set(product, bySprint);
  }
  let table = bySprint.get(key);
  if (!table) {
    table = buildReleaseTotals(product, sprintId || null);
    bySprint.set(key, table);
  }
  return table;
}

function buildReleaseTotals(product: Product, sprintId: string | null): Map<string, ReleaseTotals> {
  const table = new Map<string, ReleaseTotals>();
  forEachRib(product, rib => {
    if (rib.releaseAllocations.length === 0) return;
    const ribPoints = getRibItemPoints(rib, product.sizeMapping);
    const groups = historyByRelease(rib.progressHistory);
    const seen = new Set<string>();
    for (const alloc of rib.releaseAllocations) {
      if (seen.has(alloc.releaseId)) continue;
      seen.add(alloc.releaseId);
      const progressHistory = groups.get(alloc.releaseId) ?? [];
      const releaseProgress = sprintId && product.sprints
        ? releaseProgressAsOf(progressHistory, alloc.releaseId, sprintId, product.sprints)
        : getRibReleaseProgress({ progressHistory }, alloc.releaseId);
      const allocatedPoints = ribPoints * (alloc.percentage / 100);
      const releasePortionComplete = alloc.percentage > 0
        ? Math.min(releaseProgress, alloc.percentage) / alloc.percentage
        : 0;
      let t = table.get(alloc.releaseId);
      if (!t) {
        t = { allocated: 0, completed: 0, core: 0, nonCore: 0 };
        table.set(alloc.releaseId, t);
      }
      t.allocated += allocatedPoints;
      t.completed += allocatedPoints * releasePortionComplete;
      if (rib.category === 'non-core') t.nonCore += allocatedPoints;
      else t.core += allocatedPoints;
    }
  });
  return table;
}

export function getReleasePercentComplete(product: Product, releaseId: string, sprintId?: string | null): number {
  const { allocated, completed } = getReleasePoints(product, releaseId, sprintId);
  return allocated > 0 ? (completed / allocated) * 100 : 0;
}

export function getProjectPercentComplete(product: Product, sprintId?: string): number {
  const { totalPoints, completedPoints } = reduceRibs(product, (acc, rib) => {
    const pts = getRibItemPoints(rib, product.sizeMapping);
    acc.totalPoints += pts;
    const pct = sprintId
      ? getRibItemPercentCompleteAsOf(rib, sprintId, product.sprints)
      : getRibItemPercentComplete(rib);
    acc.completedPoints += pts * (pct / 100);
    return acc;
  }, { totalPoints: 0, completedPoints: 0 });

  return totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;
}

export function getCoreNonCorePointsForRelease(product: Product, releaseId: string) {
  const t = releaseTotals(product, null).get(releaseId);
  return { core: t?.core ?? 0, nonCore: t?.nonCore ?? 0 };
}

export function getAllocationTotal(ribItem: RibItem): number {
  return ribItem.releaseAllocations.reduce((sum, a) => sum + a.percentage, 0);
}

export function getSizingDistribution(product: Product): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const m of product.sizeMapping) dist[m.label] = 0;
  dist['Unsized'] = 0;

  forEachRib(product, (rib) => {
    const key = rib.size && dist[rib.size] !== undefined ? rib.size : 'Unsized';
    dist[key] = (dist[key] ?? 0) + 1;
  });
  return dist;
}

export function computeItemStats(ribItems: RibItem[], sizeMapping: SizeMapping[]) {
  let totalItems = 0;
  let totalPoints = 0;
  let completedPoints = 0;
  let remainingPoints = 0;
  let unsized = 0;
  for (const rib of ribItems) {
    totalItems++;
    const pts = getRibItemPoints(rib, sizeMapping);
    totalPoints += pts;
    const pctComplete = getRibItemPercentComplete(rib);
    completedPoints += Math.round(pts * pctComplete / 100);
    remainingPoints += Math.round(pts * (100 - pctComplete) / 100);
    if (!rib.size) unsized++;
  }
  const percentComplete = totalPoints > 0 ? Math.round(completedPoints / totalPoints * 100) : 0;
  return { totalItems, totalPoints, unsized, remainingPoints, percentComplete };
}

export function getThemeStats(theme: Theme, sizeMapping: SizeMapping[]) {
  const allRibs = theme.backboneItems.flatMap(b => b.ribItems);
  return computeItemStats(allRibs, sizeMapping);
}

export function getBackboneStats(backbone: Backbone, sizeMapping: SizeMapping[]) {
  return computeItemStats(backbone.ribItems, sizeMapping);
}

/**
 * Most sprints an over-time chart plots — the most recent ones. Every point sums
 * every rib, so a chart is sprints × ribs, and nothing caps either count at the
 * write site: a document holding thousands of both froze Progress and Insights.
 * 500 is nearly ten years of weekly sprints (the import validator stops at 200);
 * a project past it is charted over its latest 500. Data is untouched.
 */
export const MAX_CHART_SPRINTS = 500;

function chartSprints(sprints: Sprint[]): Sprint[] {
  return sprints.length > MAX_CHART_SPRINTS ? sprints.slice(-MAX_CHART_SPRINTS) : sprints;
}

export function getProgressOverTime(product: Product) {
  if (!product.sprints.length) return [];

  return chartSprints(product.sprints).map(sprint => {
    const { totalPoints, completedPoints } = reduceRibs(product, (acc, rib) => {
      const pts = getRibItemPoints(rib, product.sizeMapping);
      acc.totalPoints += pts;
      const pct = getRibItemPercentCompleteAsOf(rib, sprint.id, product.sprints);
      acc.completedPoints += pts * (pct / 100);
      return acc;
    }, { totalPoints: 0, completedPoints: 0 });

    return {
      sprintName: sprint.name,
      sprintId: sprint.id,
      totalPoints,
      completedPoints: Math.round(completedPoints * 10) / 10,
      percentComplete: totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 1000) / 10 : 0,
    };
  });
}

// `sprintId` accepts null — the progress view represents "no sprint selected"
// that way, and the lookup below already returns null for an id it cannot find.
export function getSprintSummary(product: Product, sprintId: string | null) {
  const sprints = product.sprints;
  const sprint = sprints.find(s => s.id === sprintId);
  if (!sprint) return null;

  const prevSprint = sprints.find(s => s.order === sprint.order - 1);

  const acc = reduceRibs(product, (a, rib) => {
    if (rib.releaseAllocations.length === 0) return a;
    const pts = getRibItemPoints(rib, product.sizeMapping);
    a.totalPoints += pts;
    a.itemsTotal++;

    // sprint.id, not sprintId — same value (the lookup matched on it), but
    // already narrowed to string by the `if (!sprint) return null` above.
    const pctAsOf = getRibItemPercentCompleteAsOf(rib, sprint.id, sprints);
    const completed = pts * (pctAsOf / 100);
    a.completedPointsAsOf += completed;

    let prevCompleted = 0;
    if (prevSprint) {
      const pctPrev = getRibItemPercentCompleteAsOf(rib, prevSprint.id, sprints);
      prevCompleted = pts * (pctPrev / 100);
      a.completedPointsPrev += prevCompleted;
    }

    if (rib.category === 'non-core') {
      a.nonCoreTotalPts += pts;
      a.nonCoreCompletedPts += completed;
      a.nonCoreCompletedPrev += prevCompleted;
    } else {
      a.coreTotalPts += pts;
      a.coreCompletedPts += completed;
      a.coreCompletedPrev += prevCompleted;
    }

    const hasEntry = rib.progressHistory?.some(
      p => p.sprintId === sprintId && p.percentComplete !== null
    );
    if (hasEntry) a.itemsUpdated++;
    return a;
  }, {
    totalPoints: 0, completedPointsAsOf: 0, completedPointsPrev: 0,
    itemsUpdated: 0, itemsTotal: 0,
    coreTotalPts: 0, coreCompletedPts: 0, coreCompletedPrev: 0,
    nonCoreTotalPts: 0, nonCoreCompletedPts: 0, nonCoreCompletedPrev: 0,
  });

  const round1 = (v: number) => Math.round(v * 10) / 10;
  const pct = (completed: number, total: number) => total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

  return {
    sprintName: sprint.name,
    endDate: sprint.endDate,
    totalPoints: acc.totalPoints,
    completedPoints: round1(acc.completedPointsAsOf),
    remainingPoints: round1(acc.totalPoints - acc.completedPointsAsOf),
    pointsThisSprint: round1(acc.completedPointsAsOf - acc.completedPointsPrev),
    percentComplete: pct(acc.completedPointsAsOf, acc.totalPoints),
    itemsUpdated: acc.itemsUpdated,
    itemsTotal: acc.itemsTotal,
    core: {
      totalPoints: acc.coreTotalPts,
      completedPoints: round1(acc.coreCompletedPts),
      pointsThisSprint: round1(acc.coreCompletedPts - acc.coreCompletedPrev),
      percentComplete: pct(acc.coreCompletedPts, acc.coreTotalPts),
    },
    nonCore: {
      totalPoints: acc.nonCoreTotalPts,
      completedPoints: round1(acc.nonCoreCompletedPts),
      pointsThisSprint: round1(acc.nonCoreCompletedPts - acc.nonCoreCompletedPrev),
      percentComplete: pct(acc.nonCoreCompletedPts, acc.nonCoreTotalPts),
    },
  };
}

export function getReleaseProgressOverTime(product: Product, releaseId: string) {
  if (!product.sprints.length) return [];

  return chartSprints(product.sprints).map(sprint => {
    const { allocated, completed } = getReleasePoints(product, releaseId, sprint.id);
    return {
      sprintName: sprint.name,
      totalPoints: Math.round(allocated * 10) / 10,
      completedPoints: Math.round(completed * 10) / 10,
    };
  });
}
