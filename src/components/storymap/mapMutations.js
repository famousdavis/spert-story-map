/**
 * Pure mutation helpers for drag-and-drop operations on the story map.
 *
 * Each function calls `updateProduct(prev => next)` to produce a new
 * immutable product state. They are intentionally separated from the
 * drag hook so they can be tested and reused independently.
 */

/**
 * Move a rib item from one release lane to another (Y-axis drag).
 * Handles unassigned ↔ assigned transitions and updates releaseCardOrder.
 */
export function moveRibToRelease(updateProduct, ribId, fromReleaseId, toReleaseId, insertIndex) {
  updateProduct(prev => {
    const next = {
      ...prev,
      themes: prev.themes.map(t => ({
        ...t,
        backboneItems: t.backboneItems.map(b => ({
          ...b,
          ribItems: b.ribItems.map(r => {
            if (r.id !== ribId) return r;

            let newAllocations;
            if (toReleaseId === null) {
              // Moving to unassigned — clear all allocations
              newAllocations = [];
            } else if (fromReleaseId === null) {
              // Moving from unassigned — create a fresh allocation
              newAllocations = [{ releaseId: toReleaseId, percentage: 100, memo: '' }];
            } else {
              // Transfer allocation from one release to another
              // Guard: if target release already has an allocation, skip (no duplicate)
              if (r.releaseAllocations.some(a => a.releaseId === toReleaseId)) {
                return r;
              }
              const oldAlloc = r.releaseAllocations.find(a => a.releaseId === fromReleaseId);
              const pct = oldAlloc ? oldAlloc.percentage : 100;
              const memo = oldAlloc?.memo || '';
              newAllocations = r.releaseAllocations
                .filter(a => a.releaseId !== fromReleaseId)
                .concat({ releaseId: toReleaseId, percentage: pct, memo });
            }
            return { ...r, releaseAllocations: newAllocations };
          }),
        })),
      })),
    };

    // Update releaseCardOrder — insert at specified position
    const cardOrder = { ...(next.releaseCardOrder || {}) };
    const srcKey = fromReleaseId || 'unassigned';
    const dstKey = toReleaseId || 'unassigned';
    if (cardOrder[srcKey]) {
      cardOrder[srcKey] = cardOrder[srcKey].filter(id => id !== ribId);
    }
    const dstList = [...(cardOrder[dstKey] || [])].filter(id => id !== ribId);
    if (insertIndex != null && insertIndex >= 0 && insertIndex <= dstList.length) {
      dstList.splice(insertIndex, 0, ribId);
    } else {
      dstList.push(ribId);
    }
    cardOrder[dstKey] = dstList;
    next.releaseCardOrder = cardOrder;

    return next;
  });
}

/**
 * Reorder a rib item within the same release lane (Y-axis drag, same release).
 * Only updates releaseCardOrder — no allocation changes needed.
 */
export function reorderRibInRelease(updateProduct, ribId, releaseId, insertIndex) {
  updateProduct(prev => {
    const cardOrder = { ...(prev.releaseCardOrder || {}) };
    const key = releaseId || 'unassigned';
    const list = [...(cardOrder[key] || [])].filter(id => id !== ribId);
    const idx = Math.max(0, Math.min(insertIndex ?? list.length, list.length));
    list.splice(idx, 0, ribId);
    cardOrder[key] = list;
    return { ...prev, releaseCardOrder: cardOrder };
  });
}

/**
 * Move a rib item from one backbone column to another (X-axis drag).
 * Removes the rib from the source backbone and appends it to the target.
 */
export function moveRibToBackbone(updateProduct, ribId, fromThemeId, fromBackboneId, toThemeId, toBackboneId) {
  updateProduct(prev => {
    let ribData = null;

    // 1. Remove rib from source backbone
    const themes = prev.themes.map(t => {
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

    if (!ribData) return prev;

    // 2. Add rib to target backbone
    const themesWithRib = themes.map(t => {
      if (t.id !== toThemeId) return t;
      return {
        ...t,
        backboneItems: t.backboneItems.map(b => {
          if (b.id !== toBackboneId) return b;
          return { ...b, ribItems: [...b.ribItems, { ...ribData, order: b.ribItems.length + 1 }] };
        }),
      };
    });

    return { ...prev, themes: themesWithRib };
  });
}

/**
 * Move a backbone (and all its ribs) from one theme to another (X-axis drag).
 * Recalculates order fields in both source and target themes.
 */
export function moveBackboneToTheme(updateProduct, backboneId, fromThemeId, toThemeId) {
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

    // 2. Add backbone to target theme
    const themesWithBb = themes.map(t => {
      if (t.id !== toThemeId) return t;
      return {
        ...t,
        backboneItems: [
          ...t.backboneItems,
          { ...backboneData, order: t.backboneItems.length + 1 },
        ],
      };
    });

    return { ...prev, themes: themesWithBb };
  });
}
