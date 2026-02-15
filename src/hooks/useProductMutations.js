import { useCallback } from 'react';
import { calculateNextSprintEndDate } from '../lib/progressMutations';
import { DEFAULT_THEME_COLOR_KEYS } from '../lib/themeColors';

/** Remove deleted rib IDs from releaseCardOrder. */
function cleanCardOrder(cardOrder, ribIds) {
  if (!cardOrder || ribIds.size === 0) return cardOrder;
  const cleaned = {};
  for (const [col, ids] of Object.entries(cardOrder)) {
    cleaned[col] = ids.filter(id => !ribIds.has(id));
  }
  return cleaned;
}

/**
 * Provides reusable CRUD operations for the product's theme/backbone/rib hierarchy.
 * Keeps mutation logic DRY between StructureView, SettingsView, and anywhere else
 * that needs to modify the product tree.
 */
export function useProductMutations(updateProduct) {
  const updateTheme = useCallback((themeId, updater) => {
    updateProduct(prev => ({
      ...prev,
      themes: prev.themes.map(t =>
        t.id === themeId ? (typeof updater === 'function' ? updater(t) : { ...t, ...updater }) : t
      ),
    }));
  }, [updateProduct]);

  const updateBackbone = useCallback((themeId, backboneId, updater) => {
    updateProduct(prev => ({
      ...prev,
      themes: prev.themes.map(t =>
        t.id === themeId
          ? {
            ...t,
            backboneItems: t.backboneItems.map(b =>
              b.id === backboneId ? (typeof updater === 'function' ? updater(b) : { ...b, ...updater }) : b
            ),
          }
          : t
      ),
    }));
  }, [updateProduct]);

  const updateRib = useCallback((themeId, backboneId, ribId, updater) => {
    updateProduct(prev => ({
      ...prev,
      themes: prev.themes.map(t =>
        t.id === themeId
          ? {
            ...t,
            backboneItems: t.backboneItems.map(b =>
              b.id === backboneId
                ? { ...b, ribItems: b.ribItems.map(r => r.id === ribId ? (typeof updater === 'function' ? updater(r) : { ...r, ...updater }) : r) }
                : b
            ),
          }
          : t
      ),
    }));
  }, [updateProduct]);

  const addTheme = useCallback(() => {
    updateProduct(prev => ({
      ...prev,
      themes: [...prev.themes, {
        id: crypto.randomUUID(),
        name: 'New Theme',
        order: prev.themes.length + 1,
        color: DEFAULT_THEME_COLOR_KEYS[prev.themes.length % DEFAULT_THEME_COLOR_KEYS.length],
        backboneItems: [],
      }],
    }));
  }, [updateProduct]);

  const addBackbone = useCallback((themeId) => {
    updateTheme(themeId, t => ({
      ...t,
      backboneItems: [...t.backboneItems, {
        id: crypto.randomUUID(),
        name: 'New Backbone Item',
        description: '',
        order: t.backboneItems.length + 1,
        ribItems: [],
      }],
    }));
  }, [updateTheme]);

  const addRib = useCallback((themeId, backboneId) => {
    updateBackbone(themeId, backboneId, b => ({
      ...b,
      ribItems: [...b.ribItems, {
        id: crypto.randomUUID(),
        name: 'New Rib Item',
        description: '',
        order: b.ribItems.length + 1,
        size: null,
        category: 'core',
        releaseAllocations: [],
        progressHistory: [],
      }],
    }));
  }, [updateBackbone]);

  const addRelease = useCallback(() => {
    updateProduct(prev => ({
      ...prev,
      releases: [...prev.releases, {
        id: crypto.randomUUID(),
        name: `Release ${prev.releases.length + 1}`,
        order: prev.releases.length + 1,
        description: '',
        targetDate: null,
      }],
    }));
  }, [updateProduct]);

  /** Insert a new release after `afterReleaseId`. If null, appends at end. */
  const addReleaseAfter = useCallback((afterReleaseId) => {
    updateProduct(prev => {
      const sorted = [...prev.releases].sort((a, b) => a.order - b.order);
      const afterIdx = afterReleaseId
        ? sorted.findIndex(r => r.id === afterReleaseId)
        : -1;
      const insertIdx = afterIdx >= 0 ? afterIdx + 1 : sorted.length;
      const newRelease = {
        id: crypto.randomUUID(),
        name: `Release ${prev.releases.length + 1}`,
        order: 0,
        description: '',
        targetDate: null,
      };
      sorted.splice(insertIdx, 0, newRelease);
      return {
        ...prev,
        releases: sorted.map((r, i) => ({ ...r, order: i + 1 })),
      };
    });
  }, [updateProduct]);

  const addSprint = useCallback((onCreated) => {
    const newId = crypto.randomUUID();
    updateProduct(prev => {
      const cadenceWeeks = prev.sprintCadenceWeeks || 2;
      const last = prev.sprints.length > 0 ? prev.sprints[prev.sprints.length - 1] : null;
      return {
        ...prev,
        sprints: [...prev.sprints, {
          id: newId,
          name: `Sprint ${prev.sprints.length + 1}`,
          order: prev.sprints.length + 1,
          endDate: calculateNextSprintEndDate(last?.endDate, cadenceWeeks),
        }],
      };
    });
    if (onCreated) onCreated(newId);
    return newId;
  }, [updateProduct]);

  const deleteTheme = useCallback((themeId) => {
    updateProduct(prev => {
      const ribIds = new Set();
      const theme = prev.themes.find(t => t.id === themeId);
      if (theme) theme.backboneItems.forEach(b => b.ribItems.forEach(r => ribIds.add(r.id)));
      return {
        ...prev,
        themes: prev.themes.filter(t => t.id !== themeId),
        releaseCardOrder: cleanCardOrder(prev.releaseCardOrder, ribIds),
        sizingCardOrder: cleanCardOrder(prev.sizingCardOrder, ribIds),
      };
    });
  }, [updateProduct]);

  const deleteBackbone = useCallback((themeId, backboneId) => {
    updateProduct(prev => {
      const ribIds = new Set();
      const theme = prev.themes.find(t => t.id === themeId);
      const bb = theme?.backboneItems.find(b => b.id === backboneId);
      if (bb) bb.ribItems.forEach(r => ribIds.add(r.id));
      return {
        ...prev,
        themes: prev.themes.map(t =>
          t.id === themeId ? { ...t, backboneItems: t.backboneItems.filter(b => b.id !== backboneId) } : t
        ),
        releaseCardOrder: cleanCardOrder(prev.releaseCardOrder, ribIds),
        sizingCardOrder: cleanCardOrder(prev.sizingCardOrder, ribIds),
      };
    });
  }, [updateProduct]);

  const deleteRib = useCallback((themeId, backboneId, ribId) => {
    updateProduct(prev => ({
      ...prev,
      themes: prev.themes.map(t =>
        t.id === themeId
          ? { ...t, backboneItems: t.backboneItems.map(b =>
              b.id === backboneId ? { ...b, ribItems: b.ribItems.filter(r => r.id !== ribId) } : b
            )}
          : t
      ),
      releaseCardOrder: cleanCardOrder(prev.releaseCardOrder, new Set([ribId])),
      sizingCardOrder: cleanCardOrder(prev.sizingCardOrder, new Set([ribId])),
    }));
  }, [updateProduct]);

  const deleteRibs = useCallback((entries) => {
    if (!entries.length) return;
    updateProduct(prev => {
      const allRibIds = new Set(entries.map(e => e.ribId));
      return {
        ...prev,
        themes: prev.themes.map(t => ({
          ...t,
          backboneItems: t.backboneItems.map(b => ({
            ...b,
            ribItems: b.ribItems.filter(r => !allRibIds.has(r.id)),
          })),
        })),
        releaseCardOrder: cleanCardOrder(prev.releaseCardOrder, allRibIds),
        sizingCardOrder: cleanCardOrder(prev.sizingCardOrder, allRibIds),
      };
    });
  }, [updateProduct]);

  const moveItem = useCallback((items, id, direction, key = 'id') => {
    const arr = [...items];
    const idx = arr.findIndex(item => item[key] === id);
    if (idx < 0) return items;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= arr.length) return items;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    return arr.map((item, i) => ({ ...item, order: i + 1 }));
  }, []);

  return {
    updateTheme,
    updateBackbone,
    updateRib,
    addTheme,
    addBackbone,
    addRib,
    addRelease,
    addReleaseAfter,
    addSprint,
    deleteTheme,
    deleteBackbone,
    deleteRib,
    deleteRibs,
    moveItem,
  };
}
