// All computed values - pure functions, no side effects
import { forEachRib, reduceRibs } from './ribHelpers';

export function getRibItemPoints(ribItem, sizeMapping) {
  if (!ribItem.size) return 0;
  const mapping = sizeMapping.find(m => m.label === ribItem.size);
  return mapping ? mapping.points : 0;
}

export function getAllRibItems(product) {
  const items = [];
  forEachRib(product, (rib, { theme, backbone }) => {
    items.push({ ...rib, themeName: theme.name, themeId: theme.id, backboneName: backbone.name, backboneId: backbone.id });
  });
  return items;
}

export function getTotalProjectPoints(product) {
  return reduceRibs(product, (total, rib) => total + getRibItemPoints(rib, product.sizeMapping), 0);
}

export function getPointsForRelease(product, releaseId) {
  return reduceRibs(product, (total, rib) => {
    const alloc = rib.releaseAllocations.find(a => a.releaseId === releaseId);
    return alloc ? total + getRibItemPoints(rib, product.sizeMapping) * (alloc.percentage / 100) : total;
  }, 0);
}

export function getCoreNonCorePoints(product) {
  return reduceRibs(product, (acc, rib) => {
    const pts = getRibItemPoints(rib, product.sizeMapping);
    if (rib.category === 'non-core') acc.nonCore += pts;
    else acc.core += pts;
    return acc;
  }, { core: 0, nonCore: 0 });
}

// --- Per-release progress helpers ---

// Get a single release's progress for a specific sprint
export function getRibReleaseProgressForSprint(ribItem, releaseId, sprintId) {
  const entry = ribItem.progressHistory?.find(
    p => p.sprintId === sprintId && p.releaseId === releaseId
  );
  return entry?.percentComplete ?? null;
}

// Get a single release's progress "as of" a given sprint (walk-back)
export function getRibReleaseProgressAsOf(ribItem, releaseId, sprintId, sprints) {
  if (!ribItem.progressHistory || ribItem.progressHistory.length === 0) return 0;
  if (!sprintId || !sprints) return getRibReleaseProgress(ribItem, releaseId);

  const sprintOrder = {};
  for (const s of sprints) sprintOrder[s.id] = s.order;

  const targetOrder = sprintOrder[sprintId];
  if (targetOrder === undefined) return getRibReleaseProgress(ribItem, releaseId);

  let best = null;
  let bestOrder = -1;
  for (const entry of ribItem.progressHistory) {
    if (entry.releaseId !== releaseId) continue;
    if (entry.percentComplete === null) continue;
    const order = sprintOrder[entry.sprintId];
    if (order !== undefined && order <= targetOrder && order > bestOrder) {
      best = entry;
      bestOrder = order;
    }
  }

  return best ? best.percentComplete : 0;
}

// Get the latest progress for a single release (last entry by array position)
export function getRibReleaseProgress(ribItem, releaseId) {
  if (!ribItem.progressHistory || ribItem.progressHistory.length === 0) return 0;
  const entries = ribItem.progressHistory.filter(
    p => p.releaseId === releaseId && p.percentComplete !== null
  );
  return entries.length > 0 ? entries[entries.length - 1].percentComplete : 0;
}

// --- Overall rib % (sum of per-release entries) ---

// Sum per-release entries for the latest sprint to get overall rib %
export function getRibItemPercentComplete(ribItem) {
  if (!ribItem.progressHistory || ribItem.progressHistory.length === 0) return 0;
  const realEntries = ribItem.progressHistory.filter(e => e.percentComplete !== null);
  if (realEntries.length === 0) return 0;
  const lastEntry = realEntries[realEntries.length - 1];
  return getRibItemPercentCompleteForSprint(ribItem, lastEntry.sprintId);
}

// Sum all per-release entries for a given sprint
export function getRibItemPercentCompleteForSprint(ribItem, sprintId) {
  if (!ribItem.progressHistory) return null;
  const entries = ribItem.progressHistory.filter(
    p => p.sprintId === sprintId && p.percentComplete !== null
  );
  if (entries.length === 0) return null;
  return Math.min(100, entries.reduce((sum, e) => sum + e.percentComplete, 0));
}

// Get overall progress "as of" a given sprint — sum per-release walk-backs
export function getRibItemPercentCompleteAsOf(ribItem, sprintId, sprints) {
  if (!ribItem.progressHistory || ribItem.progressHistory.length === 0) return 0;
  if (!sprintId || !sprints) return getRibItemPercentComplete(ribItem);

  const releaseIds = [...new Set(ribItem.progressHistory.map(p => p.releaseId).filter(Boolean))];

  if (releaseIds.length === 0) {
    return _legacyPercentCompleteAsOf(ribItem, sprintId, sprints);
  }

  let total = 0;
  for (const releaseId of releaseIds) {
    total += getRibReleaseProgressAsOf(ribItem, releaseId, sprintId, sprints);
  }
  return Math.min(100, total);
}

// Fallback for any un-migrated entries (shouldn't happen after migration, but safe)
function _legacyPercentCompleteAsOf(ribItem, sprintId, sprints) {
  const sprintOrder = {};
  for (const s of sprints) sprintOrder[s.id] = s.order;

  const targetOrder = sprintOrder[sprintId];
  if (targetOrder === undefined) return getRibItemPercentComplete(ribItem);

  let best = null;
  let bestOrder = -1;
  for (const entry of ribItem.progressHistory) {
    if (entry.percentComplete === null) continue;
    const order = sprintOrder[entry.sprintId];
    if (order !== undefined && order <= targetOrder && order > bestOrder) {
      best = entry;
      bestOrder = order;
    }
  }
  return best ? best.percentComplete : 0;
}

// --- Release-level calculations ---

export function getReleasePercentComplete(product, releaseId, sprintId) {
  const { totalAllocatedPoints, totalCompletedPoints } = reduceRibs(product, (acc, rib) => {
    const alloc = rib.releaseAllocations.find(a => a.releaseId === releaseId);
    if (!alloc) return acc;

    const ribPoints = getRibItemPoints(rib, product.sizeMapping);
    const allocatedPoints = ribPoints * (alloc.percentage / 100);
    acc.totalAllocatedPoints += allocatedPoints;

    const releaseProgress = sprintId
      ? getRibReleaseProgressAsOf(rib, releaseId, sprintId, product.sprints)
      : getRibReleaseProgress(rib, releaseId);
    const releasePortionComplete = alloc.percentage > 0
      ? Math.min(releaseProgress, alloc.percentage) / alloc.percentage
      : 0;
    acc.totalCompletedPoints += allocatedPoints * releasePortionComplete;
    return acc;
  }, { totalAllocatedPoints: 0, totalCompletedPoints: 0 });

  return totalAllocatedPoints > 0 ? (totalCompletedPoints / totalAllocatedPoints) * 100 : 0;
}

export function getProjectPercentComplete(product, sprintId) {
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

export function getCoreNonCorePointsForRelease(product, releaseId) {
  return reduceRibs(product, (acc, rib) => {
    const alloc = rib.releaseAllocations.find(a => a.releaseId === releaseId);
    if (!alloc) return acc;
    const pts = getRibItemPoints(rib, product.sizeMapping) * (alloc.percentage / 100);
    if (rib.category === 'non-core') acc.nonCore += pts;
    else acc.core += pts;
    return acc;
  }, { core: 0, nonCore: 0 });
}

export function getAllocationTotal(ribItem) {
  return ribItem.releaseAllocations.reduce((sum, a) => sum + a.percentage, 0);
}

export function getSizingDistribution(product) {
  const dist = {};
  for (const m of product.sizeMapping) dist[m.label] = 0;
  dist['Unsized'] = 0;

  forEachRib(product, (rib) => {
    if (rib.size && dist[rib.size] !== undefined) dist[rib.size]++;
    else dist['Unsized']++;
  });
  return dist;
}

export function computeItemStats(ribItems, sizeMapping) {
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

export function getThemeStats(theme, sizeMapping) {
  const allRibs = theme.backboneItems.flatMap(b => b.ribItems);
  return computeItemStats(allRibs, sizeMapping);
}

export function getBackboneStats(backbone, sizeMapping) {
  return computeItemStats(backbone.ribItems, sizeMapping);
}

export function getProgressOverTime(product) {
  if (!product.sprints.length) return [];

  return product.sprints.map(sprint => {
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

export function getSprintSummary(product, sprintId) {
  const sprints = product.sprints;
  const sprint = sprints.find(s => s.id === sprintId);
  if (!sprint) return null;

  const prevSprint = sprints.find(s => s.order === sprint.order - 1);

  const acc = reduceRibs(product, (a, rib) => {
    if (rib.releaseAllocations.length === 0) return a;
    const pts = getRibItemPoints(rib, product.sizeMapping);
    a.totalPoints += pts;
    a.itemsTotal++;

    const pctAsOf = getRibItemPercentCompleteAsOf(rib, sprintId, sprints);
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

  const round1 = v => Math.round(v * 10) / 10;
  const pct = (completed, total) => total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

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

export function getReleaseProgressOverTime(product, releaseId) {
  if (!product.sprints.length) return [];

  return product.sprints.map(sprint => {
    const { totalAllocatedPoints, completedPoints } = reduceRibs(product, (acc, rib) => {
      const alloc = rib.releaseAllocations.find(a => a.releaseId === releaseId);
      if (!alloc) return acc;

      const ribPoints = getRibItemPoints(rib, product.sizeMapping);
      const allocatedPoints = ribPoints * (alloc.percentage / 100);
      acc.totalAllocatedPoints += allocatedPoints;

      const releaseProgress = getRibReleaseProgressAsOf(rib, releaseId, sprint.id, product.sprints);
      const releasePortionComplete = alloc.percentage > 0
        ? Math.min(releaseProgress, alloc.percentage) / alloc.percentage
        : 0;
      acc.completedPoints += allocatedPoints * releasePortionComplete;
      return acc;
    }, { totalAllocatedPoints: 0, completedPoints: 0 });

    return {
      sprintName: sprint.name,
      totalPoints: Math.round(totalAllocatedPoints * 10) / 10,
      completedPoints: Math.round(completedPoints * 10) / 10,
    };
  });
}
