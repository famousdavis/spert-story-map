import { STORAGE_KEYS, SCHEMA_VERSION, DEFAULT_SIZE_MAPPING } from './constants';

// Debounce helper
let saveTimers = {};
function debouncedSave(key, data, delay = 500) {
  if (saveTimers[key]) clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }, delay);
}

function immediatelyLoad(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
    return null;
  }
}

// Product Index
export function loadProductIndex() {
  return immediatelyLoad(STORAGE_KEYS.PRODUCTS_INDEX) || [];
}

export function saveProductIndex(index) {
  debouncedSave(STORAGE_KEYS.PRODUCTS_INDEX, index, 100);
}

// Schema migration: v1 → v2 (per-release progress)
function migrateToV2(product) {
  if (!product || (product.schemaVersion || 1) >= 2) return product;

  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        if (!rib.progressHistory || rib.progressHistory.length === 0) continue;
        const allocations = rib.releaseAllocations || [];
        if (allocations.length === 0) {
          // No allocations — drop progress (nowhere to assign it)
          rib.progressHistory = [];
          continue;
        }

        // Convert each old entry { sprintId, percentComplete } into per-release entries
        const newHistory = [];
        for (const entry of rib.progressHistory) {
          let remaining = entry.percentComplete;
          // Waterfall: fill first allocation up to its %, then next, etc.
          for (const alloc of allocations) {
            const portion = Math.min(remaining, alloc.percentage);
            if (portion > 0) {
              newHistory.push({
                sprintId: entry.sprintId,
                releaseId: alloc.releaseId,
                percentComplete: portion,
              });
            }
            remaining -= portion;
            if (remaining <= 0) break;
          }
        }
        rib.progressHistory = newHistory;
      }
    }
  }

  product.schemaVersion = SCHEMA_VERSION;
  return product;
}

// Products
export function loadProduct(id) {
  let product = immediatelyLoad(`${STORAGE_KEYS.PRODUCT_PREFIX}${id}`);
  if (product && (product.schemaVersion || 1) < SCHEMA_VERSION) {
    product = migrateToV2(product);
    // Save immediately so migration only runs once
    try {
      localStorage.setItem(`${STORAGE_KEYS.PRODUCT_PREFIX}${id}`, JSON.stringify(product));
    } catch (e) {
      console.error('Failed to save migrated product:', e);
    }
  }
  return product;
}

export function saveProduct(product) {
  const updated = { ...product, updatedAt: new Date().toISOString() };
  debouncedSave(`${STORAGE_KEYS.PRODUCT_PREFIX}${product.id}`, updated);

  // Update index
  const index = loadProductIndex();
  const existing = index.findIndex(p => p.id === product.id);
  const entry = { id: product.id, name: product.name, updatedAt: updated.updatedAt };
  if (existing >= 0) {
    index[existing] = entry;
  } else {
    index.push(entry);
  }
  saveProductIndex(index);
  return updated;
}

export function saveProductImmediate(product) {
  const updated = { ...product, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(`${STORAGE_KEYS.PRODUCT_PREFIX}${product.id}`, JSON.stringify(updated));
    const index = loadProductIndex();
    const existing = index.findIndex(p => p.id === product.id);
    const entry = { id: product.id, name: product.name, updatedAt: updated.updatedAt };
    if (existing >= 0) {
      index[existing] = entry;
    } else {
      index.push(entry);
    }
    localStorage.setItem(STORAGE_KEYS.PRODUCTS_INDEX, JSON.stringify(index));
  } catch (e) {
    console.error('Failed to save product:', e);
  }
  return updated;
}

export function deleteProduct(id) {
  try {
    localStorage.removeItem(`${STORAGE_KEYS.PRODUCT_PREFIX}${id}`);
    const index = loadProductIndex().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PRODUCTS_INDEX, JSON.stringify(index));
  } catch (e) {
    console.error('Failed to delete product:', e);
  }
}

// Preferences
export function loadPreferences() {
  return immediatelyLoad(STORAGE_KEYS.PREFERENCES) || {};
}

export function savePreferences(prefs) {
  debouncedSave(STORAGE_KEYS.PREFERENCES, prefs, 200);
}

// Create new product
export function createNewProduct(name, description = '') {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    description,
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    sizeMapping: [...DEFAULT_SIZE_MAPPING],
    releases: [],
    sprints: [],
    themes: [],
  };
}

// Duplicate product
export function duplicateProduct(product) {
  const now = new Date().toISOString();
  const idMap = new Map();

  function newId(oldId) {
    if (!idMap.has(oldId)) idMap.set(oldId, crypto.randomUUID());
    return idMap.get(oldId);
  }

  // Remap rib IDs so releaseCardOrder can reference the new ones
  const ribIdMap = new Map();
  const themes = product.themes.map(t => ({
    ...t,
    id: crypto.randomUUID(),
    backboneItems: t.backboneItems.map(b => ({
      ...b,
      id: crypto.randomUUID(),
      ribItems: b.ribItems.map(ri => {
        const newRibId = crypto.randomUUID();
        ribIdMap.set(ri.id, newRibId);
        return {
          ...ri,
          id: newRibId,
          releaseAllocations: ri.releaseAllocations.map(a => ({
            ...a,
            releaseId: newId(a.releaseId),
          })),
          progressHistory: ri.progressHistory.map(p => ({
            ...p,
            sprintId: newId(p.sprintId),
            ...(p.releaseId ? { releaseId: newId(p.releaseId) } : {}),
          })),
        };
      }),
    })),
  }));

  // Remap releaseCardOrder keys (release IDs) and values (rib IDs)
  const oldCardOrder = product.releaseCardOrder || {};
  const newCardOrder = {};
  for (const [colId, ribIds] of Object.entries(oldCardOrder)) {
    const newColId = colId === 'unassigned' ? 'unassigned' : newId(colId);
    newCardOrder[newColId] = ribIds.map(id => ribIdMap.get(id) || id);
  }

  return {
    ...product,
    id: crypto.randomUUID(),
    name: `${product.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    releases: product.releases.map(r => ({ ...r, id: newId(r.id) })),
    sprints: product.sprints.map(s => ({ ...s, id: newId(s.id) })),
    themes,
    releaseCardOrder: newCardOrder,
  };
}

// Export / Import
export function exportProduct(product) {
  const blob = new Blob([JSON.stringify(product, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `${product.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importProductFromJSON(jsonString) {
  let data = JSON.parse(jsonString);
  // Basic validation
  if (!data.id || !data.name || !Array.isArray(data.themes)) {
    throw new Error('Invalid product data: missing required fields');
  }
  if (!data.sizeMapping) data.sizeMapping = [...DEFAULT_SIZE_MAPPING];
  if (!data.releases) data.releases = [];
  if (!data.sprints) data.sprints = [];
  // Migrate if needed
  if (!data.schemaVersion || data.schemaVersion < SCHEMA_VERSION) {
    data = migrateToV2(data);
  }
  return data;
}
