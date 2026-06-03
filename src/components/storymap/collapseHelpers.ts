// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Pure helpers for the Map tab's collapsible release lanes. Extracted from
 * StoryMapView so they can be unit-tested in the project's `node` test env
 * without a DOM (mirrors the computeInsertIndex / buildRibMoveState pattern).
 */

/** Drop collapsed-lane ids whose release no longer exists in the product. */
export function stripOrphans(ids: string[], validIds: Set<string>): string[] {
  return ids.filter((id) => validIds.has(id));
}

/**
 * "Collapse all but unassigned" / "Expand all" toggle target.
 * If every release is already collapsed → expand all (`[]`); otherwise collapse all.
 */
export function bulkNextCollapsed(allReleaseIds: string[], current: string[]): string[] {
  const currentSet = new Set(current);
  const allCollapsed = allReleaseIds.length > 0 && allReleaseIds.every((id) => currentSet.has(id));
  return allCollapsed ? [] : [...allReleaseIds];
}

/**
 * Prune a multi-selection to ids that still resolve to a currently-visible cell.
 * Returns `null` when nothing changes so the caller can skip a setState.
 */
export function pruneSelection<T>(ids: Set<T>, visibleIds: Set<T>): Set<T> | null {
  let changed = false;
  const next = new Set<T>();
  for (const id of ids) {
    if (visibleIds.has(id)) next.add(id);
    else changed = true;
  }
  return changed ? next : null;
}
