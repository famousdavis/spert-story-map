// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Sprint, ProgressSource } from '../types';
import {
  allocationTo, completion, currentAllocations, effectiveValue, historyByRelease, resolveSprintId, share,
} from './progressRule';
import type { RuleRib } from './progressRule';

/**
 * Count non-empty comments for a rib+release (or all releases if releaseId is null).
 */
export function getCommentCount(rib: ProgressSource, releaseId: string | null): number {
  if (!rib.progressHistory) return 0;
  if (releaseId) {
    return (historyByRelease(rib.progressHistory).get(releaseId) ?? []).filter(p => p.comment).length;
  }
  return rib.progressHistory.filter(p => p.comment).length;
}

/**
 * Get comment history for a rib+release, sorted newest-first by sprint order.
 */
export function getCommentHistory(rib: ProgressSource, releaseId: string | null, sprintNameMap: Record<string, string>, sprintOrder: Record<string, number>) {
  if (!rib.progressHistory) return [];
  // Grouped, not filtered: the Progress table asks once per allocation, and a
  // full-history filter each time was allocations × history (see historyByRelease).
  const entries = releaseId
    ? (historyByRelease(rib.progressHistory).get(releaseId) ?? []).filter(p => p.comment)
    : rib.progressHistory.filter(p => p.comment);
  return entries
    .map(e => ({
      ...e,
      sprintName: sprintNameMap[e.sprintId] || 'Unknown',
      order: sprintOrder[e.sprintId] ?? 0,
    }))
    .sort((a, b) => b.order - a.order);
}

/**
 * One row of comment history, derived from getCommentHistory rather than
 * restated. ProgressRow and CommentPanel each used to declare their own copy,
 * and both had drifted — they required `comment: string` where a ProgressEntry
 * comment is optional, and neither knew about `order`. Deriving it here means
 * the shape cannot drift again.
 */
export type CommentHistoryEntry = ReturnType<typeof getCommentHistory>[number];

/**
 * The value recorded for exactly this sprint. Blank (null) when there is none.
 * With no release (the backbone and theme groupings), the sum of the current
 * allocations' entries.
 */
export function getSprintPct(rib: RuleRib, releaseId: string | null, selectedSprint: string | null, sprints: Sprint[]): number | null {
  if (!selectedSprint) return null;
  if (releaseId) return effectiveValue(rib, releaseId, selectedSprint, sprints);
  const values = currentAllocations(rib)
    .map(a => effectiveValue(rib, a.releaseId, selectedSprint, sprints))
    .filter(v => v !== null);
  return values.length > 0 ? Math.min(100, values.reduce((sum, v) => sum + v, 0)) : null;
}

/**
 * What the row counts as of the selected sprint: the allocation's `share`, or the
 * rib's `completion` with no release.
 */
export function getCurrentPct(rib: RuleRib, releaseId: string | null, selectedSprint: string | null, sprints: Sprint[]): number {
  const asOf = resolveSprintId(sprints, selectedSprint);
  if (!releaseId) return completion(rib, asOf, sprints);
  const allocation = allocationTo(rib, releaseId);
  return allocation ? share(rib, allocation, asOf, sprints) : 0;
}

/**
 * The change in what the row counts since the previous sprint. Blank when the
 * sprint cell is blank, and with no previous sprint.
 */
export function getDelta(rib: RuleRib, releaseId: string | null, sprint: Sprint | null, prevSprint: Sprint | null, selectedSprint: string | null, sprints: Sprint[]): number | null {
  if (!sprint || !prevSprint) return null;
  if (getSprintPct(rib, releaseId, selectedSprint, sprints) === null) return null;
  return getCurrentPct(rib, releaseId, sprint.id, sprints) - getCurrentPct(rib, releaseId, prevSprint.id, sprints);
}
