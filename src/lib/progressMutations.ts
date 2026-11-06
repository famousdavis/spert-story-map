// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, ProgressEntry, ReleaseAllocation, RibItem, Sprint } from '../types';
import {
  bringHereTarget, currentAllocations, hasValue, historyByRelease, latestSprintId, orderedSprints, progressAsOf, rowRecords, share,
} from './progressRule';
import { reduceRibs, transferAllocation } from './ribHelpers';
import { MAX_MEMO } from './validateProduct';

type UpdateProduct = (updater: (prev: Product) => Product) => void;

/**
 * Shared mutation helpers for progress tracking.
 * These wrap the triple-nested theme→backbone→rib traversal
 * into testable, reusable functions.
 */

/**
 * A copy of `history` holding one entry for (sprint, release). Only the first
 * entry for a pair counts, so a write that left the others behind would let a
 * delete resurface a shadowed one. The first non-empty comment stays.
 */
function collapseDuplicates(history: ProgressEntry[], sprintId: string, releaseId: string): ProgressEntry[] {
  const isPair = (p: ProgressEntry) => p.sprintId === sprintId && p.releaseId === releaseId;
  const pair = history.filter(isPair);
  const first = pair[0];
  if (!first || pair.length < 2) return [...history];
  const comment = pair.find(p => p.comment)?.comment;
  const kept = comment === undefined ? first : { ...first, comment };
  return history.filter(p => !isPair(p) || p === first).map(p => p === first ? kept : p);
}

/**
 * Find and update a specific rib's progressHistory in a single updateProduct call.
 * `updater(history, existingIdx)` should return { history } or null to skip.
 */
function updateRibProgress(
  updateProduct: UpdateProduct,
  ribId: string,
  // Null is a real caller input — the `if (!sprintId) return` below is the
  // documented "do nothing when no sprint is selected" path.
  sprintId: string | null,
  releaseId: string,
  updater: (history: ProgressEntry[], existingIdx: number) => { history: ProgressEntry[] } | null,
): void {
  if (!sprintId) return;
  updateProduct(prev => ({
    ...prev,
    themes: prev.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r => {
          if (r.id !== ribId) return r;
          const history = collapseDuplicates(r.progressHistory || [], sprintId, releaseId);
          const existingIdx = history.findIndex(
            p => p.sprintId === sprintId && p.releaseId === releaseId
          );
          const result = updater(history, existingIdx);
          if (!result) return r;
          return { ...r, progressHistory: result.history };
        }),
      })),
    })),
  }));
}

/** Write a per-release progress entry. */
export function updateProgress(updateProduct: UpdateProduct, ribId: string, releaseId: string, sprintId: string | null, percentComplete: number): void {
  // Guarded here as well as in updateRibProgress: the narrowing has to hold
  // inside the updater closure below, which writes sprintId into a new entry.
  if (!sprintId) return;
  updateRibProgress(updateProduct, ribId, sprintId, releaseId, (history, existingIdx) => {
    const now = new Date().toISOString();
    const existing = existingIdx >= 0 ? history[existingIdx] : undefined;
    if (existing) {
      history[existingIdx] = { ...existing, percentComplete, updatedAt: now };
    } else {
      history.push({ sprintId, releaseId, percentComplete, comment: '', updatedAt: now });
    }
    return { history };
  });
}

/** Remove a progress entry. Preserves entry if it has a comment (zeros the %). */
export function removeProgress(updateProduct: UpdateProduct, ribId: string, releaseId: string, sprintId: string): void {
  updateRibProgress(updateProduct, ribId, sprintId, releaseId, (history, existingIdx) => {
    if (existingIdx < 0) return null;
    const existing = history[existingIdx];
    if (!existing) return null;
    if (existing.comment) {
      history[existingIdx] = { ...existing, percentComplete: null, updatedAt: new Date().toISOString() };
    } else {
      history.splice(existingIdx, 1);
    }
    return { history };
  });
}

/** Write a comment to a progress entry (creates one if none exists). */
export function updateComment(updateProduct: UpdateProduct, ribId: string, releaseId: string, sprintId: string | null, comment: string): void {
  // Same reason as updateProgress: the closure below writes sprintId.
  if (!sprintId) return;
  updateRibProgress(updateProduct, ribId, sprintId, releaseId, (history, existingIdx) => {
    const now = new Date().toISOString();
    const existing = existingIdx >= 0 ? history[existingIdx] : undefined;
    if (existing) {
      history[existingIdx] = { ...existing, comment, updatedAt: now };
    } else {
      history.push({ sprintId, releaseId, percentComplete: null, comment, updatedAt: now });
    }
    return { history };
  });
}

/**
 * Calculate the next sprint end date based on cadence.
 *
 * Returns null — the same "no date yet" the first sprint gets — when the
 * previous date cannot be read. `toISOString` throws on an invalid date, and
 * this runs inside an `updateProduct` updater, which React evaluates during
 * render: a stored end date the date input could never have produced made
 * "Add sprint" take the whole app down.
 */
export function calculateNextSprintEndDate(lastEndDate: string | null, cadenceWeeks: number): string | null {
  if (!lastEndDate) return null;
  const d = new Date(lastEndDate + 'T00:00:00');
  d.setDate(d.getDate() + cadenceWeeks * 7);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0]!;
}

// ─── Carrying progress when a rib changes release ───────────────────

function hasPositiveEntry(history: ProgressEntry[], releaseId: string): boolean {
  return history.some(e => e.releaseId === releaseId && (e.percentComplete ?? 0) > 0);
}

/** A real 0 is a record. Only an absent or null percentage is not. */
function hasRecordedEntry(history: ProgressEntry[], releaseId: string): boolean {
  return history.some(e => e.releaseId === releaseId && e.percentComplete !== null && e.percentComplete !== undefined);
}

/**
 * The rib has nothing recorded on `from` and `to` holds positive old records,
 * so a move leaves history alone and those records count again. This is the
 * one case where a move changes what the rib reads.
 *
 * ⚠️ "Nothing recorded", not "nothing positive". A typed 0 is the user saying
 * the rib is at 0, so it swaps like any other record and stays 0, there and
 * back. Treat it as nothing and one stray drag revives the old figure over it.
 */
function targetRecordsCountAgain(history: ProgressEntry[], from: string, to: string): boolean {
  return hasPositiveEntry(history, to) && !hasRecordedEntry(history, from);
}

/**
 * The records a rib's history holds after it moves from one release to another.
 * Pure, and it looks at history alone: the caller decides that this is a move.
 *
 * - Absent history, or no `from` or `to`: returned as is. A null `from` must
 *   never match, because legacy entries have no `releaseId`. A throw here would
 *   land in an updater React evaluates during render, and in the AI drain path.
 * - Nothing recorded on `from`, positive records on `to`: returned as is, and
 *   those records count again.
 * - Otherwise the two releases trade keys. Nothing merges, is added or is
 *   dropped, array positions hold, and a comment or `updatedAt` stays on its
 *   entry. A trade is its own inverse, so dragging back restores the array.
 *
 * Returns the SAME array when nothing needs renaming: `historyByRelease` caches
 * by array identity, and "untouched" should be true by reference.
 *
 * @no-throw — safe for use in the drain path.
 */
export function carryProgress(history: ProgressEntry[], from: string | null, to: string | null): ProgressEntry[];
export function carryProgress(history: ProgressEntry[] | undefined, from: string | null, to: string | null): ProgressEntry[] | undefined;
export function carryProgress(history: ProgressEntry[] | undefined, from: string | null, to: string | null): ProgressEntry[] | undefined {
  if (!history || from === null || to === null || from === to) return history;
  if (targetRecordsCountAgain(history, from, to)) return history;
  if (!history.some(e => e.releaseId === from || e.releaseId === to)) return history;
  return history.map(e => {
    if (e.releaseId === from) return { ...e, releaseId: to };
    if (e.releaseId === to) return { ...e, releaseId: from };
    return e;
  });
}

/**
 * `rib` with its records carried. The key is written only when the records
 * changed, so a rib that has no history key does not gain one.
 *
 * @no-throw — safe for use in the drain path.
 */
export function withCarriedProgress(rib: RibItem, from: string | null, to: string | null): RibItem {
  const history = carryProgress(rib.progressHistory, from, to);
  return history === rib.progressHistory ? rib : { ...rib, progressHistory: history };
}

/**
 * A rib moved by dragging: its allocations and its records together, so one
 * `updateProduct` holds both and undo restores both. Used by the map and by
 * Release Planning. The dialog and the AI keep their own allocations and call
 * `withCarriedProgress` directly.
 *
 * A refused move (the rib is already on `to`) returns the same rib. Records
 * carry only when `from` is on the rib: `transferAllocation` still returns a
 * list for a stale `from`, a cloud echo or AI op landing mid-drag, and a swap
 * there would promote records that were not counting.
 */
export function applyRibTransfer(rib: RibItem, from: string | null, to: string | null): RibItem {
  const allocations = transferAllocation(rib, from, to);
  if (allocations === null) return rib;
  const moved = { ...rib, releaseAllocations: allocations };
  const fromIsOnRib = (rib.releaseAllocations ?? []).some(a => a.releaseId === from);
  return fromIsOnRib ? withCarriedProgress(moved, from, to) : moved;
}

type AllocationRow = Pick<ReleaseAllocation, 'releaseId' | 'percentage'>;

/** The distinct releases a list allocates to. A 0% row allocates nothing. */
function allocatedReleaseIds(rows: AllocationRow[]): Set<string> {
  return new Set(rows.filter(r => r.percentage > 0).map(r => r.releaseId));
}

/**
 * Is this allocation change a move? Exactly one release gone and exactly one
 * arrived, at any percentage. A 0% row is absent on BOTH sides: the dialog drops
 * one on save, and a stored one (import admits 0) holds no share of the rib.
 *
 * The one statement of the rule, for the save and for the dialog's draft rows.
 */
export function detectAllocationMove(current: AllocationRow[], next: AllocationRow[]): { from: string; to: string } | null {
  const before = allocatedReleaseIds(current);
  const after = allocatedReleaseIds(next);
  const removed = [...before].filter(id => !after.has(id));
  const added = [...after].filter(id => !before.has(id));
  const [from] = removed;
  const [to] = added;
  if (removed.length !== 1 || added.length !== 1 || from === undefined || to === undefined) return null;
  return { from, to };
}

/**
 * What an allocation change would do to a rib's progress, for the dialog to say
 * before Save. Null when there is nothing to say: not a move, or a move with no
 * progress on either side.
 */
export function describeAllocationMove(
  rib: Pick<RibItem, 'releaseAllocations' | 'progressHistory'>,
  next: AllocationRow[],
): { toReleaseId: string; effect: 'carries' | 'counts-again' } | null {
  const move = detectAllocationMove(rib.releaseAllocations, next);
  if (!move) return null;
  const history = rib.progressHistory ?? [];
  if (targetRecordsCountAgain(history, move.from, move.to)) return { toReleaseId: move.to, effect: 'counts-again' };
  if (hasPositiveEntry(history, move.from)) return { toReleaseId: move.to, effect: 'carries' };
  return null;
}

/** Something Save would do to a rib's progress that the dialog should say first. */
export type AllocationWarning =
  | { kind: 'stops-counting'; releaseId: string }
  | { kind: 'capped'; releaseId: string; recorded: number; counted: number };

const holdsProgress = (entry: ProgressEntry, sprintIds: Set<string>) =>
  (sprintIds.has(entry.sprintId) && (entry.percentComplete ?? 0) > 0) || Boolean(entry.comment);

/**
 * What an allocation change would stop counting. On a detected move nothing stops:
 * the records carry, or the target's count again. Otherwise each release leaving
 * the rib with a record or a comment is named. A release staying on the rib, or a
 * move's target, is named when it holds more than its percentage will count.
 */
export function describeAllocationWarnings(
  rib: Pick<RibItem, 'releaseAllocations' | 'progressHistory'>,
  next: AllocationRow[],
  sprints: Sprint[],
): AllocationWarning[] {
  const history = rib.progressHistory ?? [];
  const move = detectAllocationMove(rib.releaseAllocations, next);
  const carried = move ? carryProgress(history, move.from, move.to) : history;
  const before = allocatedReleaseIds(rib.releaseAllocations);
  const after = allocatedReleaseIds(next);
  const sprintIds = new Set(sprints.map(s => s.id));
  const latest = latestSprintId(sprints);

  const warnings: AllocationWarning[] = [];
  if (!move) {
    for (const releaseId of before) {
      if (after.has(releaseId)) continue;
      if (history.some(e => e.releaseId === releaseId && holdsProgress(e, sprintIds))) warnings.push({ kind: 'stops-counting', releaseId });
    }
  }
  for (const row of next) {
    if (row.percentage <= 0 || !(before.has(row.releaseId) || row.releaseId === move?.to)) continue;
    const recorded = progressAsOf({ progressHistory: carried }, row.releaseId, latest, sprints);
    if (recorded > row.percentage) warnings.push({ kind: 'capped', releaseId: row.releaseId, recorded, counted: row.percentage });
  }
  return warnings;
}

/**
 * Save a rib's allocations from the dialog. Always stores the saved list:
 * `transferAllocation` rebuilds from the rib and would drop a percentage or
 * memo typed in the same Save. Records carry only on a move.
 */
export function saveRibAllocations(prev: Product, ribId: string, allocations: ReleaseAllocation[]): Product {
  return {
    ...prev,
    themes: prev.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r => {
          if (r.id !== ribId) return r;
          const saved = { ...r, releaseAllocations: allocations };
          const move = detectAllocationMove(r.releaseAllocations ?? [], allocations);
          return move ? withCarriedProgress(saved, move.from, move.to) : saved;
        }),
      })),
    })),
  };
}

// ─── Acting on records that do not count ────────────────────────────

/**
 * `prev` with one rib changed. `prev` itself when the rib is not found or comes
 * back the same, so an action on a row that has since gone writes nothing.
 */
function withRib(prev: Product, ribId: string, change: (rib: RibItem) => RibItem): Product {
  let changed = false;
  const themes = prev.themes.map(t => ({
    ...t,
    backboneItems: t.backboneItems.map(b => ({
      ...b,
      ribItems: b.ribItems.map(r => {
        if (r.id !== ribId) return r;
        const next = change(r);
        if (next !== r) changed = true;
        return next;
      }),
    })),
  }));
  return changed ? { ...prev, themes } : prev;
}

const isPositive = (entry: ProgressEntry) => (entry.percentComplete ?? 0) > 0;

/** Pattern #6: a comment keeps its entry and loses the percentage. With no comment, the entry goes. */
function clearedEntry(entry: ProgressEntry, now: string): ProgressEntry[] {
  if (!entry.comment) return [];
  return hasValue(entry) ? [{ ...entry, percentComplete: null, updatedAt: now }] : [entry];
}

function bySprint(entries: ProgressEntry[]): Map<string, ProgressEntry[]> {
  const groups = new Map<string, ProgressEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.sprintId);
    if (group) group.push(entry);
    else groups.set(entry.sprintId, [entry]);
  }
  return groups;
}

/** Bring here's two releases and everything each step reads. */
interface Combining { rib: RibItem; fromId: string; toId: string; sprints: Sprint[]; now: string }

/**
 * The first entry wins on each side, as `collapseDuplicates` does. A sprint where
 * neither side holds a value stays null: its comments move, and no figure changes.
 */
function combinedValue({ rib, fromId, toId, sprints }: Combining, sprintId: string, here: ProgressEntry[], row: ProgressEntry[]): number | null {
  const valued = [here[0], row[0]].some(entry => entry && hasValue(entry));
  if (!valued) return null;
  return Math.min(100, progressAsOf(rib, fromId, sprintId, sprints) + progressAsOf(rib, toId, sprintId, sprints));
}

/**
 * The entry a sprint ends with on the target. An entry that keeps its value and
 * comment is returned as it is, because `updatedAt` is printed beside each note and
 * a date should not move for an entry nothing happened to.
 */
function combinedEntry(c: Combining, sprintId: string, here: ProgressEntry[], row: ProgressEntry[], comment: string): ProgressEntry {
  const [first] = here;
  const percentComplete = combinedValue(c, sprintId, here, row);
  if (first && (first.percentComplete ?? null) === percentComplete && (first.comment ?? '') === comment) return first;
  return { ...first, sprintId, releaseId: c.toId, percentComplete, comment, updatedAt: c.now };
}

/**
 * The two comments together when they fit. ⚠️ NOTHING CUTS A COMMENT: when the join
 * would pass `MAX_MEMO`, the current comment is kept whole and null is returned, so
 * the caller leaves the row's comment where it is. The cap is real, because the
 * validator refuses a whole file over one long comment, and a comment can already
 * be over it, because nothing caps one as it is typed.
 */
function joinedComment(current: string, row: string): string | null {
  const joined = `${current}\n\n${row}`;
  return joined.length <= MAX_MEMO ? joined : null;
}

/** `rib`'s history with `records` combined into the target. Entries for an unknown sprint are never reached. */
function combineSeries(c: Combining, records: ProgressEntry[]): ProgressEntry[] {
  const history = c.rib.progressHistory;
  const target = bySprint(historyByRelease(history).get(c.toId) ?? []);
  const source = bySprint(records);
  const consumed = new Set<ProgressEntry>();
  const combined: ProgressEntry[] = [];
  const stayBehind: ProgressEntry[] = [];
  for (const sprintId of new Set(orderedSprints(c.sprints).map(s => s.id))) {
    const here = target.get(sprintId) ?? [];
    const row = source.get(sprintId) ?? [];
    if (here.length === 0 && row.length === 0) continue;
    for (const entry of [...here, ...row]) consumed.add(entry);
    const current = here.find(e => e.comment)?.comment;
    const note = row.find(e => e.comment);
    const joined = current && note?.comment ? joinedComment(current, note.comment) : undefined;
    if (joined === null && note) stayBehind.push(...clearedEntry(note, c.now));
    combined.push(combinedEntry(c, sprintId, here, row, joined ?? current ?? note?.comment ?? ''));
  }
  return [...history.filter(entry => !consumed.has(entry)), ...stayBehind, ...combined];
}

/**
 * "Bring here": the row's records combined into the rib's one current release, the
 * one place two series combine, because the user asked. For each sprint with a value
 * on either side the value is `min(100, row's walk-back + current's walk-back)`, one
 * entry per (sprint, release), so a later sprint on one side keeps the other's total.
 *
 * Never a bare re-key, which could collide with or be shadowed by an entry already
 * there. Everything is decided from `prev`, not from the row the user saw: a cloud
 * echo can land between the click and this running.
 */
export function bringRecordsHere(prev: Product, ribId: string, releaseId: string): Product {
  return withRib(prev, ribId, rib => {
    const target = bringHereTarget(rib, releaseId, new Set(prev.releases.map(r => r.id)));
    const records = rowRecords(rib, releaseId, prev.sprints);
    if (!target || !records.some(isPositive)) return rib;
    const now = new Date().toISOString();
    const c = { rib, fromId: releaseId, toId: target.releaseId, sprints: prev.sprints, now };
    return { ...rib, progressHistory: combineSeries(c, records) };
  });
}

/**
 * What "Bring here" would leave at the latest sprint, read off the writer's own
 * result so that the confirm cannot restate the formula differently. `reads` is what
 * the rib records and `counted` what its release counts, lower when the allocation
 * is. Null when the action would do nothing.
 */
export function previewBringHere(product: Product, ribId: string, releaseId: string): { reads: number; counted: number } | null {
  const next = bringRecordsHere(product, ribId, releaseId);
  if (next === product) return null;
  const rib = reduceRibs<RibItem | null>(next, (found, r) => (r.id === ribId ? r : found), null);
  const allocation = rib && currentAllocations(rib)[0];
  if (!rib || !allocation) return null;
  const latest = latestSprintId(next.sprints);
  return { reads: progressAsOf(rib, allocation.releaseId, latest, next.sprints), counted: share(rib, allocation, latest, next.sprints) };
}

/**
 * "Remove": the row's records follow pattern #6. It reaches a parked rib, which has
 * no Progress row. An effective entry on a current allocation is never touched, and
 * that is `rowRecords`' job: reusing `removeProgress` here finds the FIRST entry for
 * the pair, which is the one that counts.
 */
export function removeRowRecords(prev: Product, ribId: string, releaseId: string): Product {
  return withRib(prev, ribId, rib => {
    const records = rowRecords(rib, releaseId, prev.sprints);
    if (!records.some(isPositive)) return rib;
    const going = new Set(records);
    const now = new Date().toISOString();
    return { ...rib, progressHistory: rib.progressHistory.flatMap(e => (going.has(e) ? clearedEntry(e, now) : [e])) };
  });
}

/** Is there anything for Clear progress to clear? A note on its own is not progress. */
export function ribHasProgress(rib: Pick<RibItem, 'progressHistory'>): boolean {
  return (rib.progressHistory ?? []).some(hasValue);
}

/**
 * Clear progress: every entry the rib holds, on every sprint and release, by pattern
 * #6. Inert records go too, including the ones no row lists: a legacy entry with no
 * release, an unknown sprint. Comments stay, and the rib unlocks.
 */
export function clearRibProgress(product: Product, ribId: string): Product {
  return withRib(product, ribId, rib => {
    const history = rib.progressHistory ?? [];
    if (!history.some(e => hasValue(e) || !e.comment)) return rib;
    const now = new Date().toISOString();
    return { ...rib, progressHistory: history.flatMap(e => clearedEntry(e, now)) };
  });
}
