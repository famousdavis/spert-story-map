// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// All computed values - pure functions, no side effects
import type { Product, RibItem, SizeMapping, Sprint, Theme, Backbone, ProgressSource } from '../types';
import { forEachRib, reduceRibs } from './ribHelpers';
import {
  completion, currentAllocations, effectiveValue, orderedSprints, previousSprint, progressAsOf,
  resolveSprintId, share, sharesTotal,
} from './progressRule';
import type { RuleRib } from './progressRule';

// Every figure below is points added up over the rule in progressRule.ts, which
// is the one statement of what counts. Nothing in this file decides that.

/** Points and percentages are shown to one decimal, always rounded from the unrounded value. */
export const round1 = (value: number) => Math.round(value * 10) / 10;

const percentOf = (part: number, whole: number) => whole > 0 ? round1((part / whole) * 100) : 0;

// ⚠️ This index exists because a project document is not bounded in COUNT, only
// in bytes (1 MiB), and a linear lookup inside a per-rib loop turned that into
// ribs × rows. It is keyed by array identity and holds the ROWS, not copies of
// their fields: product state is replaced rather than mutated, so a changed list
// is a new array, and a field edited in place is still read live.

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

/**
 * A rib's points, always as a number. `SizeMappingSection` writes the input's
 * text while a size is being typed, and that text can persist. Passed through
 * as text it concatenates: two sizes summed to "04020", and the export sent a
 * backlog in the thousands with nothing to refuse it.
 */
export function getRibItemPoints(ribItem: Pick<RibItem, 'size'>, sizeMapping: SizeMapping[]): number {
  if (!ribItem.size) return 0;
  const mapping = sizeIndex(sizeMapping).get(ribItem.size);
  const points = Number(mapping?.points);
  return Number.isFinite(points) ? points : 0;
}

/**
 * True when the rib contributes no size row to points: no size, or a label not in the size list.
 * A size whose row has 0 points is sized. Needs Attention, the project card, Structure, the Map's
 * theme and backbone panels and the Sizing tab count unsized items with this. Three places keep
 * their own copy of the rule: `getSizingDistribution` (the Insights chart), the AI snapshot and
 * `sizeRibInProduct`. The chart's differs for a label equal to an `Object.prototype` key, such as
 * `constructor`.
 */
export function isRibUnsized(rib: Pick<RibItem, 'size'>, sizeMapping: SizeMapping[]): boolean {
  return !rib.size || !sizeIndex(sizeMapping).has(rib.size);
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

/** The value recorded for exactly this sprint on this release, or null. */
export function getRibReleaseProgressForSprint(ribItem: ProgressSource, releaseId: string, sprintId: string, sprints: Sprint[]): number | null {
  return effectiveValue(ribItem, releaseId, sprintId, sprints);
}

/** A release's progress as of a sprint, uncapped; the latest sprint when none is given. */
export function getRibReleaseProgressAsOf(ribItem: ProgressSource, releaseId: string, sprintId: string | null, sprints: Sprint[]): number {
  return progressAsOf(ribItem, releaseId, resolveSprintId(sprints, sprintId), sprints);
}

/** A release's progress at the latest sprint, uncapped. */
export function getRibReleaseProgress(ribItem: ProgressSource, releaseId: string, sprints: Sprint[]): number {
  return getRibReleaseProgressAsOf(ribItem, releaseId, null, sprints);
}

// --- Overall rib % ---

/** The rib's `completion` at the latest sprint. */
export function getRibItemPercentComplete(ribItem: RuleRib, sprints: Sprint[]): number {
  return getRibItemPercentCompleteAsOf(ribItem, null, sprints);
}

/** The rib's `completion` at a sprint; the latest when none is given. */
export function getRibItemPercentCompleteAsOf(ribItem: RuleRib, sprintId: string | null, sprints: Sprint[]): number {
  return completion(ribItem, resolveSprintId(sprints, sprintId), sprints);
}

// --- Release-level calculations ---

/**
 * A release's allocated points, and how many of them are done: as of `sprintId`,
 * or the latest sprint when none is given (null and undefined both mean that;
 * the progress view represents "no sprint selected" as null).
 *
 * `getReleasePercentComplete`, `getReleaseProgressOverTime` and the Forecaster
 * export all read this, so the percentage the Progress tab shows and the
 * remaining work the export sends cannot disagree.
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
  // Null and the latest id are one key: they are one figure, and two keys would
  // be two passes.
  const asOf = resolveSprintId(product.sprints, sprintId);
  const key = asOf ?? '';
  let bySprint = releaseTotalsCache.get(product);
  if (!bySprint) {
    bySprint = new Map();
    releaseTotalsCache.set(product, bySprint);
  }
  let table = bySprint.get(key);
  if (!table) {
    table = buildReleaseTotals(product, asOf);
    bySprint.set(key, table);
  }
  return table;
}

function buildReleaseTotals(product: Product, sprintId: string | null): Map<string, ReleaseTotals> {
  const table = new Map<string, ReleaseTotals>();
  forEachRib(product, rib => {
    const ribPoints = getRibItemPoints(rib, product.sizeMapping);
    for (const alloc of currentAllocations(rib)) {
      const allocatedPoints = ribPoints * (alloc.percentage / 100);
      const releasePortionComplete = alloc.percentage > 0
        ? share(rib, alloc, sprintId, product.sprints) / alloc.percentage
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

/** What an allocation to a release the product no longer holds adds up to, or null when there is none. */
export function getUnknownReleaseTotals(product: Product, sprintId?: string | null): ReleaseTotals | null {
  const known = new Set(product.releases.map(r => r.id));
  let unknown: ReleaseTotals | null = null;
  for (const [releaseId, t] of releaseTotals(product, sprintId)) {
    if (known.has(releaseId)) continue;
    unknown ??= { allocated: 0, completed: 0, core: 0, nonCore: 0 };
    unknown.allocated += t.allocated;
    unknown.completed += t.completed;
    unknown.core += t.core;
    unknown.nonCore += t.nonCore;
  }
  return unknown;
}

// --- Project-level calculations ---

interface CategoryTotals { total: number; completed: number }
interface SplitPoints { total: number; core: number; nonCore: number }

export interface ProjectTotals extends CategoryTotals {
  core: CategoryTotals;
  nonCore: CategoryTotals;
  /** Points on no release: `U`. */
  unallocated: SplitPoints;
  /** Points allocated beyond 100%: `O`. */
  overAllocated: SplitPoints;
  /** Completed points the release figures count twice: `V`. */
  overCount: number;
  itemsUpdated: number;
  itemsTotal: number;
}

const noSplit = (): SplitPoints => ({ total: 0, core: 0, nonCore: 0 });

function addSplit(split: SplitPoints, category: RibItem['category'], points: number): void {
  split.total += points;
  if (category === 'non-core') split.nonCore += points;
  else split.core += points;
}

/**
 * Every project figure for one sprint in ONE pass over the ribs, cached per
 * product object and sprint, like `releaseTotals`. Each rib's own over-count comes
 * from its shares here rather than from the release table, so the second line of
 * the identity compares two independent sums.
 */
const projectTotalsCache = new WeakMap<Product, Map<string, ProjectTotals>>();

export function getProjectTotals(product: Product, sprintId?: string | null): ProjectTotals {
  const asOf = resolveSprintId(product.sprints, sprintId);
  const key = asOf ?? '';
  let bySprint = projectTotalsCache.get(product);
  if (!bySprint) {
    bySprint = new Map();
    projectTotalsCache.set(product, bySprint);
  }
  let totals = bySprint.get(key);
  if (!totals) {
    totals = buildProjectTotals(product, asOf);
    bySprint.set(key, totals);
  }
  return totals;
}

function buildProjectTotals(product: Product, sprintId: string | null): ProjectTotals {
  const totals: ProjectTotals = {
    total: 0, completed: 0,
    core: { total: 0, completed: 0 }, nonCore: { total: 0, completed: 0 },
    unallocated: noSplit(), overAllocated: noSplit(), overCount: 0,
    itemsUpdated: 0, itemsTotal: 0,
  };
  forEachRib(product, rib => {
    const points = getRibItemPoints(rib, product.sizeMapping);
    const pct = completion(rib, sprintId, product.sprints);
    const completed = points * (pct / 100);
    const category = rib.category === 'non-core' ? totals.nonCore : totals.core;
    totals.total += points;
    totals.completed += completed;
    category.total += points;
    category.completed += completed;
    totals.overCount += points * ((sharesTotal(rib, sprintId, product.sprints) - pct) / 100);

    const allocations = currentAllocations(rib);
    const allocated = allocations.reduce((sum, a) => sum + a.percentage, 0);
    addSplit(totals.unallocated, rib.category, points * (Math.max(0, 100 - allocated) / 100));
    addSplit(totals.overAllocated, rib.category, points * (Math.max(0, allocated - 100) / 100));

    if (allocations.length === 0) return;
    totals.itemsTotal++;
    if (sprintId && allocations.some(a => effectiveValue(rib, a.releaseId, sprintId, product.sprints) !== null)) {
      totals.itemsUpdated++;
    }
  });
  return totals;
}

export function getProjectPercentComplete(product: Product, sprintId?: string): number {
  const { total, completed } = getProjectTotals(product, sprintId);
  return total > 0 ? (completed / total) * 100 : 0;
}

export function getCoreNonCorePointsForRelease(product: Product, releaseId: string) {
  const t = releaseTotals(product, null).get(releaseId);
  return { core: t?.core ?? 0, nonCore: t?.nonCore ?? 0 };
}

export function getAllocationTotal(ribItem: Pick<RibItem, 'releaseAllocations'>): number {
  return currentAllocations(ribItem).reduce((sum, a) => sum + a.percentage, 0);
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

/**
 * Sums unrounded and rounds once. Rounding per rib is wrong by far more than a
 * rounding error: ten 5-point ribs at 10% each rounded up to 1 point, so they
 * read 20% done with all 50 points still remaining.
 */
export function computeItemStats(ribItems: RibItem[], sizeMapping: SizeMapping[], sprints: Sprint[]) {
  let totalItems = 0;
  let totalPoints = 0;
  let completedPoints = 0;
  let unsized = 0;
  for (const rib of ribItems) {
    totalItems++;
    const pts = getRibItemPoints(rib, sizeMapping);
    totalPoints += pts;
    completedPoints += pts * getRibItemPercentComplete(rib, sprints) / 100;
    if (isRibUnsized(rib, sizeMapping)) unsized++;
  }
  const remainingPoints = round1(totalPoints - completedPoints);
  const percentComplete = totalPoints > 0 ? Math.round(completedPoints / totalPoints * 100) : 0;
  return { totalItems, totalPoints, unsized, remainingPoints, percentComplete };
}

export function getThemeStats(theme: Theme, sizeMapping: SizeMapping[], sprints: Sprint[]) {
  const allRibs = theme.backboneItems.flatMap(b => b.ribItems);
  return computeItemStats(allRibs, sizeMapping, sprints);
}

export function getBackboneStats(backbone: Backbone, sizeMapping: SizeMapping[], sprints: Sprint[]) {
  return computeItemStats(backbone.ribItems, sizeMapping, sprints);
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
  const ordered = orderedSprints(sprints);
  return ordered.length > MAX_CHART_SPRINTS ? ordered.slice(-MAX_CHART_SPRINTS) : ordered;
}

export function getProgressOverTime(product: Product) {
  if (!product.sprints.length) return [];

  return chartSprints(product.sprints).map(sprint => {
    const { total, completed } = getProjectTotals(product, sprint.id);
    return {
      sprintName: sprint.name,
      sprintId: sprint.id,
      totalPoints: total,
      completedPoints: round1(completed),
      percentComplete: percentOf(completed, total),
    };
  });
}

// `sprintId` accepts null: the progress view represents "no sprint selected"
// that way, and the lookup below already returns null for an id it cannot find.
export function getSprintSummary(product: Product, sprintId: string | null) {
  const sprints = product.sprints;
  const sprint = sprints.find(s => s.id === sprintId);
  if (!sprint) return null;

  const now = getProjectTotals(product, sprint.id);
  const prev = previousSprint(sprints, sprint.id);
  const before = prev ? getProjectTotals(product, prev.id) : null;

  return {
    sprintName: sprint.name,
    endDate: sprint.endDate,
    totalPoints: now.total,
    completedPoints: round1(now.completed),
    remainingPoints: round1(now.total - now.completed),
    pointsThisSprint: round1(now.completed - (before?.completed ?? 0)),
    percentComplete: percentOf(now.completed, now.total),
    itemsUpdated: now.itemsUpdated,
    itemsTotal: now.itemsTotal,
    core: categorySummary(now.core, before?.core),
    nonCore: categorySummary(now.nonCore, before?.nonCore),
  };
}

function categorySummary(now: CategoryTotals, before: CategoryTotals | undefined) {
  return {
    totalPoints: now.total,
    completedPoints: round1(now.completed),
    pointsThisSprint: round1(now.completed - (before?.completed ?? 0)),
    percentComplete: percentOf(now.completed, now.total),
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
