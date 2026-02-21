import {
  getRibItemPercentComplete,
  getRibReleaseProgressForSprint,
  getRibReleaseProgress,
} from './calculations';

/**
 * Count non-empty comments for a rib+release (or all releases if releaseId is null).
 */
export function getCommentCount(rib, releaseId) {
  if (!rib.progressHistory) return 0;
  if (releaseId) {
    return rib.progressHistory.filter(p => p.releaseId === releaseId && p.comment).length;
  }
  return rib.progressHistory.filter(p => p.comment).length;
}

/**
 * Get comment history for a rib+release, sorted newest-first by sprint order.
 */
export function getCommentHistory(rib, releaseId, sprintNameMap, sprintOrder) {
  if (!rib.progressHistory) return [];
  const entries = releaseId
    ? rib.progressHistory.filter(p => p.releaseId === releaseId && p.comment)
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
 * Get the sprint-specific percentage for a rib+release.
 * For non-release grouping (releaseId is null), aggregates across all releases.
 */
export function getSprintPct(rib, releaseId, selectedSprint) {
  if (!selectedSprint) return null;
  if (releaseId) {
    return getRibReleaseProgressForSprint(rib, releaseId, selectedSprint);
  }
  const entries = (rib.progressHistory?.filter(p => p.sprintId === selectedSprint) || [])
    .filter(e => e.percentComplete !== null);
  return entries.length > 0 ? Math.min(100, entries.reduce((s, e) => s + e.percentComplete, 0)) : null;
}

/**
 * Get the current cumulative percentage for a rib+release.
 */
export function getCurrentPct(rib, releaseId) {
  if (releaseId) return getRibReleaseProgress(rib, releaseId);
  return getRibItemPercentComplete(rib);
}

/**
 * Get the delta (change) between the current sprint and the previous sprint.
 */
export function getDelta(rib, releaseId, sprint, prevSprint, selectedSprint) {
  if (!sprint || !prevSprint) return null;
  const current = getSprintPct(rib, releaseId, selectedSprint);
  if (current === null) return null;
  let prev;
  if (releaseId) {
    prev = getRibReleaseProgressForSprint(rib, releaseId, prevSprint.id);
  } else {
    const entries = (rib.progressHistory?.filter(p => p.sprintId === prevSprint.id) || [])
      .filter(e => e.percentComplete !== null);
    prev = entries.length > 0 ? entries.reduce((s, e) => s + e.percentComplete, 0) : null;
  }
  return current - (prev || 0);
}
