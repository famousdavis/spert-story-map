/**
 * Pure mutation helpers for drag-and-drop operations on the story map.
 *
 * Each function calls `updateProduct(prev => next)` to produce a new
 * immutable product state. They are intentionally separated from the
 * drag hook so they can be tested and reused independently.
 */

/** Insert ribId into cardOrder[key] at insertIndex, removing any prior occurrence. */
function spliceCardOrder(cardOrder, key, ribId, insertIndex) {
  const list = [...(cardOrder[key] || [])].filter(id => id !== ribId);
  const idx = insertIndex != null && insertIndex >= 0 && insertIndex <= list.length
    ? insertIndex : list.length;
  list.splice(idx, 0, ribId);
  cardOrder[key] = list;
}

/**
 * Insert ribId into cardOrder[key] at a per-column (backbone-scoped) insertIndex.
 * Translates the column-local index to the correct global position by walking
 * the global list and counting sibling ribs (same backbone + release).
 *
 * Also ensures all columnRibIds are present in the list (appends any missing ones),
 * so that a sparse/empty releaseCardOrder doesn't cause layout instability after
 * the first drag operation.
 */
function spliceCardOrderByColumn(cardOrder, key, ribId, insertIndex, columnRibIds) {
  const list = [...(cardOrder[key] || [])].filter(id => id !== ribId);

  if (columnRibIds && columnRibIds.size > 0 && insertIndex != null && insertIndex >= 0) {
    // Ensure all sibling ribs are in the list (preserving their existing order
    // if present, appending at end if not). This prevents layout instability
    // when releaseCardOrder was previously empty or sparse.
    for (const sibId of columnRibIds) {
      if (!list.includes(sibId)) {
        list.push(sibId);
      }
    }

    // Now translate the per-column insertIndex to a global list position.
    // Walk the list counting siblings; insert before the Nth sibling.
    let siblingCount = 0;
    let globalIdx = -1;
    for (let i = 0; i < list.length; i++) {
      if (columnRibIds.has(list[i])) {
        if (siblingCount === insertIndex) {
          globalIdx = i;
          break;
        }
        siblingCount++;
      }
    }
    // insertIndex at or beyond all siblings — place after the last sibling
    if (globalIdx === -1) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (columnRibIds.has(list[i])) {
          globalIdx = i + 1;
          break;
        }
      }
      if (globalIdx === -1) globalIdx = list.length;
    }
    list.splice(globalIdx, 0, ribId);
  } else {
    const idx = insertIndex != null && insertIndex >= 0 && insertIndex <= list.length
      ? insertIndex : list.length;
    list.splice(idx, 0, ribId);
  }

  cardOrder[key] = list;
}

/**
 * Find all rib IDs in a specific backbone column for a given release.
 * Used to translate per-column insert indices to global card order positions.
 */
function getColumnRibIds(themes, backboneId, releaseId, excludeRibId) {
  const ids = new Set();
  for (const t of themes) {
    for (const b of t.backboneItems) {
      if (b.id !== backboneId) continue;
      for (const r of b.ribItems) {
        if (r.id === excludeRibId) continue;
        if (releaseId === null) {
          if (r.releaseAllocations.length === 0) ids.add(r.id);
        } else {
          if (r.releaseAllocations.some(a => a.releaseId === releaseId)) ids.add(r.id);
        }
      }
    }
  }
  return ids;
}

// ─── Shared pure helpers ────────────────────────────────────────────

/**
 * Compute new releaseAllocations for a rib being moved between releases.
 * Returns new allocations array, or null if rib should be left unchanged
 * (e.g. duplicate release guard).
 */
export function transferAllocation(rib, fromReleaseId, toReleaseId) {
  if (toReleaseId === null) {
    // Moving to unassigned — clear all allocations
    return [];
  }
  if (fromReleaseId === null) {
    // Moving from unassigned — create a fresh allocation
    return [{ releaseId: toReleaseId, percentage: 100, memo: '' }];
  }
  // Release → release: guard against duplicate
  if (rib.releaseAllocations.some(a => a.releaseId === toReleaseId)) {
    return null; // already has target release
  }
  const oldAlloc = rib.releaseAllocations.find(a => a.releaseId === fromReleaseId);
  const pct = oldAlloc ? oldAlloc.percentage : 100;
  const memo = oldAlloc?.memo || '';
  return rib.releaseAllocations
    .filter(a => a.releaseId !== fromReleaseId)
    .concat({ releaseId: toReleaseId, percentage: pct, memo });
}

/**
 * Remove a rib from its source backbone/theme and add it to a target.
 * Returns { themes, ribData } or null if the rib wasn't found.
 */
function moveRibBetweenBackbones(themes, ribId, fromThemeId, fromBackboneId, toThemeId, toBackboneId) {
  let ribData = null;

  // 1. Remove rib from source backbone
  const stripped = themes.map(t => {
    if (t.id !== fromThemeId) return t;
    return {
      ...t,
      backboneItems: t.backboneItems.map(b => {
        if (b.id !== fromBackboneId) return b;
        const rib = b.ribItems.find(r => r.id === ribId);
        if (rib) ribData = { ...rib };
        return { ...b, ribItems: b.ribItems.filter(r => r.id !== ribId) };
      }),
    };
  });

  if (!ribData) return null;

  // 2. Add rib to target backbone
  const result = stripped.map(t => {
    if (t.id !== toThemeId) return t;
    return {
      ...t,
      backboneItems: t.backboneItems.map(b => {
        if (b.id !== toBackboneId) return b;
        return { ...b, ribItems: [...b.ribItems, { ...ribData, order: b.ribItems.length + 1 }] };
      }),
    };
  });

  return { themes: result, ribData };
}

/** Apply transferAllocation to a single rib across all themes. */
function applyAllocationTransfer(themes, ribId, fromReleaseId, toReleaseId) {
  return themes.map(t => ({
    ...t,
    backboneItems: t.backboneItems.map(b => ({
      ...b,
      ribItems: b.ribItems.map(r => {
        if (r.id !== ribId) return r;
        const newAlloc = transferAllocation(r, fromReleaseId, toReleaseId);
        return newAlloc !== null ? { ...r, releaseAllocations: newAlloc } : r;
      }),
    })),
  }));
}

// ─── Exported mutation functions ────────────────────────────────────

/**
 * Move a rib item from one release lane to another (Y-axis drag).
 * Handles unassigned ↔ assigned transitions and updates releaseCardOrder.
 */
export function moveRibToRelease(updateProduct, ribId, fromReleaseId, toReleaseId, insertIndex) {
  updateProduct(prev => {
    const next = {
      ...prev,
      themes: applyAllocationTransfer(prev.themes, ribId, fromReleaseId, toReleaseId),
    };

    const cardOrder = { ...(next.releaseCardOrder || {}) };
    const srcKey = fromReleaseId || 'unassigned';
    const dstKey = toReleaseId || 'unassigned';
    if (cardOrder[srcKey]) {
      cardOrder[srcKey] = cardOrder[srcKey].filter(id => id !== ribId);
    }
    spliceCardOrder(cardOrder, dstKey, ribId, insertIndex);
    next.releaseCardOrder = cardOrder;

    return next;
  });
}

/**
 * Reorder a rib item within the same release lane (Y-axis drag, same release).
 * Only updates releaseCardOrder — no allocation changes needed.
 */
export function reorderRibInRelease(updateProduct, ribId, releaseId, insertIndex, backboneId) {
  updateProduct(prev => {
    const cardOrder = { ...(prev.releaseCardOrder || {}) };
    const key = releaseId || 'unassigned';
    const columnRibIds = getColumnRibIds(prev.themes, backboneId, releaseId, ribId);
    spliceCardOrderByColumn(cardOrder, key, ribId, insertIndex, columnRibIds);
    return { ...prev, releaseCardOrder: cardOrder };
  });
}

/**
 * Move a rib item from one backbone column to another (X-axis drag).
 * Removes the rib from the source backbone and appends it to the target.
 */
export function moveRibToBackbone(updateProduct, ribId, fromThemeId, fromBackboneId, toThemeId, toBackboneId) {
  updateProduct(prev => {
    const result = moveRibBetweenBackbones(prev.themes, ribId, fromThemeId, fromBackboneId, toThemeId, toBackboneId);
    if (!result) return prev;
    return { ...prev, themes: result.themes };
  });
}

/**
 * Move a backbone (and all its ribs) from one theme to another (X-axis drag).
 * Recalculates order fields in both source and target themes.
 */
export function moveBackboneToTheme(updateProduct, backboneId, fromThemeId, toThemeId, insertIndex) {
  updateProduct(prev => {
    let backboneData = null;

    // 1. Remove backbone from source theme
    const themes = prev.themes.map(t => {
      if (t.id !== fromThemeId) return t;
      const bb = t.backboneItems.find(b => b.id === backboneId);
      if (bb) backboneData = { ...bb, ribItems: [...bb.ribItems] };
      return {
        ...t,
        backboneItems: t.backboneItems
          .filter(b => b.id !== backboneId)
          .map((b, i) => ({ ...b, order: i + 1 })),
      };
    });

    if (!backboneData) return prev;

    // 2. Add backbone to target theme at insertion index
    const themesWithBb = themes.map(t => {
      if (t.id !== toThemeId) return t;
      const items = [...t.backboneItems];
      const idx = insertIndex != null && insertIndex >= 0 && insertIndex <= items.length
        ? insertIndex : items.length;
      items.splice(idx, 0, backboneData);
      return {
        ...t,
        backboneItems: items.map((b, i) => ({ ...b, order: i + 1 })),
      };
    });

    return { ...prev, themes: themesWithBb };
  });
}

/**
 * Reorder a theme within the product.themes array.
 * Removes the theme from its current position and inserts at insertIndex.
 */
export function reorderTheme(updateProduct, themeId, insertIndex) {
  updateProduct(prev => {
    const idx = prev.themes.findIndex(t => t.id === themeId);
    if (idx === -1) return prev;
    const theme = prev.themes[idx];
    const without = prev.themes.filter(t => t.id !== themeId);
    const pos = insertIndex != null && insertIndex >= 0 && insertIndex <= without.length
      ? insertIndex : without.length;
    without.splice(pos, 0, theme);
    return {
      ...prev,
      themes: without.map((t, i) => ({ ...t, order: i + 1 })),
    };
  });
}

/**
 * Move a single rib in both axes simultaneously (backbone + release).
 * Combines moveRibToBackbone and moveRibToRelease into one atomic update.
 */
export function moveRib2D(updateProduct, ribId, from, to) {
  const backboneChanged = from.backboneId !== to.backboneId || from.themeId !== to.themeId;
  const releaseChanged = from.releaseId !== to.releaseId;
  if (!backboneChanged && !releaseChanged) return;

  updateProduct(prev => {
    let next = prev;

    // 1. Move backbone if changed
    if (backboneChanged) {
      const result = moveRibBetweenBackbones(next.themes, ribId, from.themeId, from.backboneId, to.themeId, to.backboneId);
      if (!result) return prev;
      next = { ...next, themes: result.themes };
    }

    // 2. Move release if changed
    if (releaseChanged) {
      next = { ...next, themes: applyAllocationTransfer(next.themes, ribId, from.releaseId, to.releaseId) };
    }

    // 3. Update card order — needed whenever backbone or release changes
    {
      const cardOrder = { ...(next.releaseCardOrder || {}) };
      const srcKey = from.releaseId || 'unassigned';
      const dstKey = (releaseChanged ? to.releaseId : from.releaseId) || 'unassigned';
      if (releaseChanged && cardOrder[srcKey]) {
        cardOrder[srcKey] = cardOrder[srcKey].filter(id => id !== ribId);
      }
      const columnRibIds = getColumnRibIds(next.themes, to.backboneId, releaseChanged ? to.releaseId : from.releaseId, ribId);
      spliceCardOrderByColumn(cardOrder, dstKey, ribId, to.insertIndex, columnRibIds);
      next = { ...next, releaseCardOrder: cardOrder };
    }

    return next;
  });
}

/**
 * Batch-move multiple ribs in both axes simultaneously.
 * Each entry in `entries` has { ribId, fromThemeId, fromBackboneId, fromReleaseId }.
 */
export function moveRibs2D(updateProduct, entries, to) {
  if (!entries.length) return;

  updateProduct(prev => {
    let next = prev;
    let insertOffset = 0;

    for (const entry of entries) {
      const backboneChanged = entry.fromBackboneId !== to.backboneId || entry.fromThemeId !== to.themeId;
      const releaseChanged = entry.fromReleaseId !== to.releaseId;

      if (backboneChanged) {
        const result = moveRibBetweenBackbones(next.themes, entry.ribId, entry.fromThemeId, entry.fromBackboneId, to.themeId, to.backboneId);
        if (result) {
          next = { ...next, themes: result.themes };
        }
      }

      if (releaseChanged) {
        next = { ...next, themes: applyAllocationTransfer(next.themes, entry.ribId, entry.fromReleaseId, to.releaseId) };
      }

      // Update card order — needed whenever backbone or release changes
      {
        const cardOrder = { ...(next.releaseCardOrder || {}) };
        const srcKey = entry.fromReleaseId || 'unassigned';
        const dstKey = (releaseChanged ? to.releaseId : entry.fromReleaseId) || 'unassigned';
        if (releaseChanged && cardOrder[srcKey]) {
          cardOrder[srcKey] = cardOrder[srcKey].filter(id => id !== entry.ribId);
        }
        const targetReleaseId = releaseChanged ? to.releaseId : entry.fromReleaseId;
        const columnRibIds = getColumnRibIds(next.themes, to.backboneId, targetReleaseId, entry.ribId);
        const idx = to.insertIndex != null ? to.insertIndex + insertOffset : to.insertIndex;
        spliceCardOrderByColumn(cardOrder, dstKey, entry.ribId, idx, columnRibIds);
        next = { ...next, releaseCardOrder: cardOrder };
        insertOffset++;
      }
    }

    return next;
  });
}
