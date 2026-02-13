import { useCallback } from 'react';

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
    moveItem,
  };
}
