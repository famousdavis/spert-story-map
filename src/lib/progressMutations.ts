// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, ProgressEntry, ReleaseAllocation, RibItem } from '../types';
import { transferAllocation } from './ribHelpers';

type UpdateProduct = (updater: (prev: Product) => Product) => void;

/**
 * Shared mutation helpers for progress tracking.
 * These wrap the triple-nested theme→backbone→rib traversal
 * into testable, reusable functions.
 */

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
          const history = [...(r.progressHistory || [])];
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
