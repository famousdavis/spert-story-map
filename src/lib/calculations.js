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

export function getRibItemPercentComplete(ribItem) {
  if (!ribItem.progressHistory || ribItem.progressHistory.length === 0) return 0;
  return ribItem.progressHistory[ribItem.progressHistory.length - 1].percentComplete;
}

export function getRibItemPercentCompleteForSprint(ribItem, sprintId) {
  const entry = ribItem.progressHistory?.find(p => p.sprintId === sprintId);
  return entry ? entry.percentComplete : null;
}

// Get progress "as of" a given sprint — uses that sprint's entry, or the latest prior sprint entry
export function getRibItemPercentCompleteAsOf(ribItem, sprintId, sprints) {
  if (!ribItem.progressHistory || ribItem.progressHistory.length === 0) return 0;
  if (!sprintId || !sprints) return getRibItemPercentComplete(ribItem);

  const sprintOrder = {};
  for (const s of sprints) sprintOrder[s.id] = s.order;

  const targetOrder = sprintOrder[sprintId];
  if (targetOrder === undefined) return getRibItemPercentComplete(ribItem);

  // Find the most recent entry at or before the selected sprint
  let best = null;
  let bestOrder = -1;
  for (const entry of ribItem.progressHistory) {
    const order = sprintOrder[entry.sprintId];
    if (order !== undefined && order <= targetOrder && order > bestOrder) {
      best = entry;
      bestOrder = order;
    }
  }

  return best ? best.percentComplete : 0;
}

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

        const overallComplete = sprintId
          ? getRibItemPercentCompleteAsOf(rib, sprintId, product.sprints)
          : getRibItemPercentComplete(rib);
        const allocationCeiling = alloc.percentage;
        const releasePortionComplete = Math.min(overallComplete, allocationCeiling) / allocationCeiling;
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

          const pct = getRibItemPercentCompleteAsOf(rib, sprint.id, product.sprints);

          const allocationCeiling = alloc.percentage;
          const releasePortionComplete = Math.min(pct, allocationCeiling) / allocationCeiling;
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
