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
 *
 * insertIndex is a per-column (backbone-scoped) index, but releaseCardOrder
 * stores all ribs for a release across all backbones. We translate the
 * per-column index to the correct global position among sibling ribs.
 */
export function reorderRibInRelease(updateProduct, ribId, releaseId, insertIndex, backboneId) {
  updateProduct(prev => {
    const cardOrder = { ...(prev.releaseCardOrder || {}) };
    const key = releaseId || 'unassigned';
    const list = [...(cardOrder[key] || [])].filter(id => id !== ribId);

    if (backboneId && insertIndex != null && insertIndex >= 0) {
      // Find all rib IDs in this column (same backbone + release)
      const columnRibIds = new Set();
      for (const t of prev.themes) {
        for (const b of t.backboneItems) {
          if (b.id !== backboneId) continue;
          for (const r of b.ribItems) {
            if (r.id === ribId) continue; // already removed
            if (releaseId === null) {
              if (r.releaseAllocations.length === 0) columnRibIds.add(r.id);
            } else {
              if (r.releaseAllocations.some(a => a.releaseId === releaseId)) columnRibIds.add(r.id);
            }
          }
        }
      }

      // Walk the global order list to find the Nth sibling and insert after it
      let siblingCount = 0;
      let globalIdx = list.length; // default: append
      for (let i = 0; i < list.length; i++) {
        if (columnRibIds.has(list[i])) {
          if (siblingCount === insertIndex) {
            globalIdx = i;
            break;
          }
          siblingCount++;
        }
      }
      // If insertIndex is beyond all siblings, place after the last sibling
      if (siblingCount < insertIndex) {
        for (let i = list.length - 1; i >= 0; i--) {
          if (columnRibIds.has(list[i])) {
            globalIdx = i + 1;
            break;
          }
        }
      }
      list.splice(globalIdx, 0, ribId);
    } else {
      // Fallback: just splice at insertIndex directly
      const idx = insertIndex != null && insertIndex >= 0 && insertIndex <= list.length
        ? insertIndex : list.length;
      list.splice(idx, 0, ribId);
    }

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
      let ribData = null;
      const themes = next.themes.map(t => {
        if (t.id !== from.themeId) return t;
        return {
          ...t,
          backboneItems: t.backboneItems.map(b => {
            if (b.id !== from.backboneId) return b;
            const rib = b.ribItems.find(r => r.id === ribId);
            if (rib) ribData = { ...rib };
            return { ...b, ribItems: b.ribItems.filter(r => r.id !== ribId) };
          }),
        };
      });
      if (!ribData) return prev;
      const themesWithRib = themes.map(t => {
        if (t.id !== to.themeId) return t;
        return {
          ...t,
          backboneItems: t.backboneItems.map(b => {
            if (b.id !== to.backboneId) return b;
            return { ...b, ribItems: [...b.ribItems, { ...ribData, order: b.ribItems.length + 1 }] };
          }),
        };
      });
      next = { ...next, themes: themesWithRib };
    }

    // 2. Move release if changed
    if (releaseChanged) {
      next = {
        ...next,
        themes: next.themes.map(t => ({
          ...t,
          backboneItems: t.backboneItems.map(b => ({
            ...b,
            ribItems: b.ribItems.map(r => {
              if (r.id !== ribId) return r;
              const fromId = from.releaseId;
              const toId = to.releaseId;
              if (toId === null) return { ...r, releaseAllocations: [] };
              if (fromId === null) return { ...r, releaseAllocations: [{ releaseId: toId, percentage: 100, memo: '' }] };
              if (r.releaseAllocations.some(a => a.releaseId === toId)) return r;
              const oldAlloc = r.releaseAllocations.find(a => a.releaseId === fromId);
              const pct = oldAlloc ? oldAlloc.percentage : 100;
              const memo = oldAlloc?.memo || '';
              return {
                ...r,
                releaseAllocations: r.releaseAllocations
                  .filter(a => a.releaseId !== fromId)
                  .concat({ releaseId: toId, percentage: pct, memo }),
              };
            }),
          })),
        })),
      };

      const cardOrder = { ...(next.releaseCardOrder || {}) };
      const srcKey = from.releaseId || 'unassigned';
      const dstKey = to.releaseId || 'unassigned';
      if (cardOrder[srcKey]) {
        cardOrder[srcKey] = cardOrder[srcKey].filter(id => id !== ribId);
      }
      spliceCardOrder(cardOrder, dstKey, ribId, to.insertIndex);
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
        let ribData = null;
        const themes = next.themes.map(t => {
          if (t.id !== entry.fromThemeId) return t;
          return {
            ...t,
            backboneItems: t.backboneItems.map(b => {
              if (b.id !== entry.fromBackboneId) return b;
              const rib = b.ribItems.find(r => r.id === entry.ribId);
              if (rib) ribData = { ...rib };
              return { ...b, ribItems: b.ribItems.filter(r => r.id !== entry.ribId) };
            }),
          };
        });
        if (ribData) {
          const themesWithRib = themes.map(t => {
            if (t.id !== to.themeId) return t;
            return {
              ...t,
              backboneItems: t.backboneItems.map(b => {
                if (b.id !== to.backboneId) return b;
                return { ...b, ribItems: [...b.ribItems, { ...ribData, order: b.ribItems.length + 1 }] };
              }),
            };
          });
          next = { ...next, themes: themesWithRib };
        }
      }

      if (releaseChanged) {
        next = {
          ...next,
          themes: next.themes.map(t => ({
            ...t,
            backboneItems: t.backboneItems.map(b => ({
              ...b,
              ribItems: b.ribItems.map(r => {
                if (r.id !== entry.ribId) return r;
                const fromId = entry.fromReleaseId;
                const toId = to.releaseId;
                if (toId === null) return { ...r, releaseAllocations: [] };
                if (fromId === null) return { ...r, releaseAllocations: [{ releaseId: toId, percentage: 100, memo: '' }] };
                if (r.releaseAllocations.some(a => a.releaseId === toId)) return r;
                const oldAlloc = r.releaseAllocations.find(a => a.releaseId === fromId);
                const pct = oldAlloc ? oldAlloc.percentage : 100;
                const memo = oldAlloc?.memo || '';
                return {
                  ...r,
                  releaseAllocations: r.releaseAllocations
                    .filter(a => a.releaseId !== fromId)
                    .concat({ releaseId: toId, percentage: pct, memo }),
                };
              }),
            })),
          })),
        };

        const cardOrder = { ...(next.releaseCardOrder || {}) };
        const srcKey = entry.fromReleaseId || 'unassigned';
        const dstKey = to.releaseId || 'unassigned';
        if (cardOrder[srcKey]) {
          cardOrder[srcKey] = cardOrder[srcKey].filter(id => id !== entry.ribId);
        }
        const idx = to.insertIndex != null ? to.insertIndex + insertOffset : to.insertIndex;
        spliceCardOrder(cardOrder, dstKey, entry.ribId, idx);
        next = { ...next, releaseCardOrder: cardOrder };
        insertOffset++;
      }
    }

    return next;
  });
}
