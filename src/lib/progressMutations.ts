// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, ProgressEntry } from '../types';

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

/** Calculate the next sprint end date based on cadence. */
export function calculateNextSprintEndDate(lastEndDate: string | null, cadenceWeeks: number): string | null {
  if (!lastEndDate) return null;
  const d = new Date(lastEndDate + 'T00:00:00');
  d.setDate(d.getDate() + cadenceWeeks * 7);
  return d.toISOString().split('T')[0]!;
}
