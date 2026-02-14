/**
 * Shared mutation helpers for progress tracking.
 * These wrap the triple-nested theme→backbone→rib traversal
 * into testable, reusable functions.
 */

/**
 * Find and update a specific rib's progressHistory in a single updateProduct call.
 * `updater(history, existingIdx)` should return { history } or null to skip.
 */
function updateRibProgress(updateProduct, ribId, sprintId, releaseId, updater) {
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
export function updateProgress(updateProduct, ribId, releaseId, sprintId, percentComplete) {
  updateRibProgress(updateProduct, ribId, sprintId, releaseId, (history, existingIdx) => {
    const now = new Date().toISOString();
    if (existingIdx >= 0) {
      history[existingIdx] = { ...history[existingIdx], percentComplete, updatedAt: now };
    } else {
      history.push({ sprintId, releaseId, percentComplete, comment: '', updatedAt: now });
    }
    return { history };
  });
}

/** Remove a progress entry. Preserves entry if it has a comment (zeros the %). */
export function removeProgress(updateProduct, ribId, releaseId, sprintId) {
  updateRibProgress(updateProduct, ribId, sprintId, releaseId, (history, existingIdx) => {
    if (existingIdx < 0) return null;
    if (history[existingIdx].comment) {
      history[existingIdx] = { ...history[existingIdx], percentComplete: null, updatedAt: new Date().toISOString() };
    } else {
      history.splice(existingIdx, 1);
    }
    return { history };
  });
}

/** Write a comment to a progress entry (creates one if none exists). */
export function updateComment(updateProduct, ribId, releaseId, sprintId, comment) {
  updateRibProgress(updateProduct, ribId, sprintId, releaseId, (history, existingIdx) => {
    const now = new Date().toISOString();
    if (existingIdx >= 0) {
      history[existingIdx] = { ...history[existingIdx], comment, updatedAt: now };
    } else {
      history.push({ sprintId, releaseId, percentComplete: null, comment, updatedAt: now });
    }
    return { history };
  });
}

/** Calculate the next sprint end date based on cadence. */
export function calculateNextSprintEndDate(lastEndDate, cadenceWeeks) {
  if (!lastEndDate) return null;
  const d = new Date(lastEndDate + 'T00:00:00');
  d.setDate(d.getDate() + cadenceWeeks * 7);
  return d.toISOString().split('T')[0];
}
