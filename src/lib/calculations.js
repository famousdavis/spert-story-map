// All computed values - pure functions, no side effects

export function getRibItemPoints(ribItem, sizeMapping) {
  if (!ribItem.size) return 0;
  const mapping = sizeMapping.find(m => m.label === ribItem.size);
  return mapping ? mapping.points : 0;
}

export function getAllRibItems(product) {
  const items = [];
  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        items.push({ ...rib, themeName: theme.name, themeId: theme.id, backboneName: backbone.name, backboneId: backbone.id });
      }
    }
  }
  return items;
}

export function getTotalProjectPoints(product) {
  let total = 0;
  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        total += getRibItemPoints(rib, product.sizeMapping);
      }
    }
  }
  return total;
}

export function getPointsForRelease(product, releaseId) {
  let total = 0;
  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        const alloc = rib.releaseAllocations.find(a => a.releaseId === releaseId);
        if (alloc) {
          total += getRibItemPoints(rib, product.sizeMapping) * (alloc.percentage / 100);
        }
      }
    }
  }
  return total;
}

export function getCoreNonCorePoints(product) {
  let core = 0;
  let nonCore = 0;
  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        const pts = getRibItemPoints(rib, product.sizeMapping);
        if (rib.category === 'non-core') {
          nonCore += pts;
        } else {
          core += pts;
        }
      }
    }
  }
  return { core, nonCore };
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
  // Find the latest entry with an explicit progress value
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

  // Collect unique releaseIds from progressHistory
  const releaseIds = [...new Set(ribItem.progressHistory.map(p => p.releaseId).filter(Boolean))];

  if (releaseIds.length === 0) {
    // Legacy fallback: no releaseId entries — treat as global
    return _legacyPercentCompleteAsOf(ribItem, sprintId, sprints);
  }

  // Sum per-release walk-backs
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

// --- Release-level calculations (use per-release progress directly) ---

export function getReleasePercentComplete(product, releaseId, sprintId) {
  let totalAllocatedPoints = 0;
  let totalCompletedPoints = 0;

  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        const alloc = rib.releaseAllocations.find(a => a.releaseId === releaseId);
        if (!alloc) continue;

        const ribPoints = getRibItemPoints(rib, product.sizeMapping);
        const allocatedPoints = ribPoints * (alloc.percentage / 100);
        totalAllocatedPoints += allocatedPoints;

        // Read release-specific progress directly
        const releaseProgress = sprintId
          ? getRibReleaseProgressAsOf(rib, releaseId, sprintId, product.sprints)
          : getRibReleaseProgress(rib, releaseId);
        // releaseProgress is 0..alloc.percentage; convert to fraction of allocation
        const releasePortionComplete = alloc.percentage > 0
          ? Math.min(releaseProgress, alloc.percentage) / alloc.percentage
          : 0;
        totalCompletedPoints += allocatedPoints * releasePortionComplete;
      }
    }
  }

  return totalAllocatedPoints > 0 ? (totalCompletedPoints / totalAllocatedPoints) * 100 : 0;
}

export function getProjectPercentComplete(product, sprintId) {
  let totalPoints = 0;
  let completedPoints = 0;

  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        const pts = getRibItemPoints(rib, product.sizeMapping);
        totalPoints += pts;
        const pct = sprintId
          ? getRibItemPercentCompleteAsOf(rib, sprintId, product.sprints)
          : getRibItemPercentComplete(rib);
        completedPoints += pts * (pct / 100);
      }
    }
  }

  return totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;
}

export function getCoreNonCorePointsForRelease(product, releaseId) {
  let core = 0;
  let nonCore = 0;
  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        const alloc = rib.releaseAllocations.find(a => a.releaseId === releaseId);
        if (!alloc) continue;
        const pts = getRibItemPoints(rib, product.sizeMapping) * (alloc.percentage / 100);
        if (rib.category === 'non-core') {
          nonCore += pts;
        } else {
          core += pts;
        }
      }
    }
  }
  return { core, nonCore };
}

export function getAllocationTotal(ribItem) {
  return ribItem.releaseAllocations.reduce((sum, a) => sum + a.percentage, 0);
}

export function getSizingDistribution(product) {
  const dist = {};
  for (const m of product.sizeMapping) {
    dist[m.label] = 0;
  }
  dist['Unsized'] = 0;

  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        if (rib.size && dist[rib.size] !== undefined) {
          dist[rib.size]++;
        } else {
          dist['Unsized']++;
        }
      }
    }
  }
  return dist;
}

export function getThemeStats(theme, sizeMapping) {
  let totalItems = 0;
  let totalPoints = 0;
  let completedPoints = 0;
  let unsized = 0;
  for (const backbone of theme.backboneItems) {
    for (const rib of backbone.ribItems) {
      totalItems++;
      const pts = getRibItemPoints(rib, sizeMapping);
      totalPoints += pts;
      const pctComplete = getRibItemPercentComplete(rib);
      completedPoints += Math.round(pts * pctComplete / 100);
      if (!rib.size) unsized++;
    }
  }
  const percentComplete = totalPoints > 0 ? Math.round(completedPoints / totalPoints * 100) : 0;
  return { totalItems, totalPoints, unsized, percentComplete };
}

export function getBackboneStats(backbone, sizeMapping) {
  let totalItems = 0;
  let totalPoints = 0;
  let completedPoints = 0;
  let unsized = 0;
  let remainingPoints = 0;
  for (const rib of backbone.ribItems) {
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

export function getProgressOverTime(product) {
  if (!product.sprints.length) return [];

  return product.sprints.map(sprint => {
    let totalPoints = 0;
    let completedPoints = 0;

    for (const theme of product.themes) {
      for (const backbone of theme.backboneItems) {
        for (const rib of backbone.ribItems) {
          const pts = getRibItemPoints(rib, product.sizeMapping);
          totalPoints += pts;

          const pct = getRibItemPercentCompleteAsOf(rib, sprint.id, product.sprints);
          completedPoints += pts * (pct / 100);
        }
      }
    }

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

  let totalPoints = 0;
  let completedPointsAsOf = 0;
  let completedPointsPrev = 0;
  let itemsUpdated = 0;
  let itemsTotal = 0;

  let coreTotalPts = 0;
  let coreCompletedPts = 0;
  let coreCompletedPrev = 0;
  let nonCoreTotalPts = 0;
  let nonCoreCompletedPts = 0;
  let nonCoreCompletedPrev = 0;

  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        if (rib.releaseAllocations.length === 0) continue;
        const pts = getRibItemPoints(rib, product.sizeMapping);
        totalPoints += pts;
        itemsTotal++;

        const pctAsOf = getRibItemPercentCompleteAsOf(rib, sprintId, sprints);
        const completed = pts * (pctAsOf / 100);
        completedPointsAsOf += completed;

        let prevCompleted = 0;
        if (prevSprint) {
          const pctPrev = getRibItemPercentCompleteAsOf(rib, prevSprint.id, sprints);
          prevCompleted = pts * (pctPrev / 100);
          completedPointsPrev += prevCompleted;
        }

        if (rib.category === 'non-core') {
          nonCoreTotalPts += pts;
          nonCoreCompletedPts += completed;
          nonCoreCompletedPrev += prevCompleted;
        } else {
          coreTotalPts += pts;
          coreCompletedPts += completed;
          coreCompletedPrev += prevCompleted;
        }

        // Check if this rib has any non-null progress entry for this sprint
        const hasEntry = rib.progressHistory?.some(
          p => p.sprintId === sprintId && p.percentComplete !== null
        );
        if (hasEntry) itemsUpdated++;
      }
    }
  }

  const round1 = v => Math.round(v * 10) / 10;
  const pct = (completed, total) => total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

  return {
    sprintName: sprint.name,
    endDate: sprint.endDate,
    totalPoints,
    completedPoints: round1(completedPointsAsOf),
    remainingPoints: round1(totalPoints - completedPointsAsOf),
    pointsThisSprint: round1(completedPointsAsOf - completedPointsPrev),
    percentComplete: pct(completedPointsAsOf, totalPoints),
    itemsUpdated,
    itemsTotal,
    core: {
      totalPoints: coreTotalPts,
      completedPoints: round1(coreCompletedPts),
      pointsThisSprint: round1(coreCompletedPts - coreCompletedPrev),
      percentComplete: pct(coreCompletedPts, coreTotalPts),
    },
    nonCore: {
      totalPoints: nonCoreTotalPts,
      completedPoints: round1(nonCoreCompletedPts),
      pointsThisSprint: round1(nonCoreCompletedPts - nonCoreCompletedPrev),
      percentComplete: pct(nonCoreCompletedPts, nonCoreTotalPts),
    },
  };
}

export function getReleaseProgressOverTime(product, releaseId) {
  if (!product.sprints.length) return [];

  return product.sprints.map(sprint => {
    let totalAllocatedPoints = 0;
    let completedPoints = 0;

    for (const theme of product.themes) {
      for (const backbone of theme.backboneItems) {
        for (const rib of backbone.ribItems) {
          const alloc = rib.releaseAllocations.find(a => a.releaseId === releaseId);
          if (!alloc) continue;

          const ribPoints = getRibItemPoints(rib, product.sizeMapping);
          const allocatedPoints = ribPoints * (alloc.percentage / 100);
          totalAllocatedPoints += allocatedPoints;

          // Use per-release progress directly
          const releaseProgress = getRibReleaseProgressAsOf(rib, releaseId, sprint.id, product.sprints);
          const releasePortionComplete = alloc.percentage > 0
            ? Math.min(releaseProgress, alloc.percentage) / alloc.percentage
            : 0;
          completedPoints += allocatedPoints * releasePortionComplete;
        }
      }
    }

    return {
      sprintName: sprint.name,
      totalPoints: Math.round(totalAllocatedPoints * 10) / 10,
      completedPoints: Math.round(completedPoints * 10) / 10,
    };
  });
}
