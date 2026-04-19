// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, ChangeLogEntry, UserSettings } from '../types';
import { STORAGE_KEYS, SCHEMA_VERSION, DEFAULT_SIZE_MAPPING, CHANGELOG_MAX_ENTRIES } from './constants';

// Save error callback — subscribe to get notified when localStorage writes fail
let _onSaveError: ((error: unknown) => void) | null = null;
export function onSaveError(callback: (error: unknown) => void): void { _onSaveError = callback; }

function handleSaveError(e: unknown): void {
  console.error('Failed to save to localStorage:', e instanceof Error ? e.message : 'Unknown error');
  if (_onSaveError) _onSaveError(e);
}

// Debounce helper
let saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
let pendingSaves: Record<string, unknown> = {};
function debouncedSave(key: string, data: unknown, delay = 500): void {
  if (saveTimers[key]) clearTimeout(saveTimers[key]);
  pendingSaves[key] = data;
  saveTimers[key] = setTimeout(() => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      handleSaveError(e);
    }
    delete pendingSaves[key];
  }, delay);
}

/** Flush all pending debounced saves immediately. Call on beforeunload. */
export function flushPendingSaves(): void {
  for (const [key, data] of Object.entries(pendingSaves)) {
    if (saveTimers[key]) clearTimeout(saveTimers[key]);
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      handleSaveError(e);
    }
  }
  saveTimers = {};
  pendingSaves = {};
}

/**
 * Cancel all pending debounced saves WITHOUT writing.
 * Used by sign-out cleanup — we do not want trailing writes to
 * land after the user has asked to be signed out.
 */
export function cancelPendingSaves(): void {
  for (const key of Object.keys(saveTimers)) {
    clearTimeout(saveTimers[key]);
  }
  saveTimers = {};
  pendingSaves = {};
}

function immediatelyLoad(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Failed to load from localStorage:', e instanceof Error ? e.message : 'Unknown error');
    return null;
  }
}

// Product Index
export function loadProductIndex(): { id: string; name: string; updatedAt?: string }[] {
  return (immediatelyLoad(STORAGE_KEYS.PRODUCTS_INDEX) as { id: string; name: string; updatedAt?: string }[] | null) || [];
}

export function saveProductIndex(index: { id: string; name: string; updatedAt?: string }[]): void {
  debouncedSave(STORAGE_KEYS.PRODUCTS_INDEX, index, 100);
}

// Schema migration: v1 → v2 (per-release progress)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pre-schema data may not match Product interface
export function migrateToV2(product: any): any {
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
export function loadProduct(id: string): Product | null {
  let product = immediatelyLoad(`${STORAGE_KEYS.PRODUCT_PREFIX}${id}`);
  if (product && (product.schemaVersion || 1) < SCHEMA_VERSION) {
    product = migrateToV2(product);
    // Save immediately so migration only runs once
    try {
      localStorage.setItem(`${STORAGE_KEYS.PRODUCT_PREFIX}${id}`, JSON.stringify(product));
    } catch (e) {
      console.error('Failed to save migrated product:', e instanceof Error ? e.message : 'Unknown error');
    }
  }
  return product;
}

export function saveProduct(product: Product): Product {
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

export function saveProductImmediate(product: Product): Product {
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
    handleSaveError(e);
  }
  return updated;
}

export function deleteProduct(id: string): void {
  try {
    localStorage.removeItem(`${STORAGE_KEYS.PRODUCT_PREFIX}${id}`);
    const index = loadProductIndex().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PRODUCTS_INDEX, JSON.stringify(index));
  } catch (e) {
    console.error('Failed to delete product:', e instanceof Error ? e.message : 'Unknown error');
  }
}

/** Remove all local products and clear the product index. */
export function clearAllLocalProducts(): void {
  const index = loadProductIndex();
  for (const entry of index) {
    localStorage.removeItem(`${STORAGE_KEYS.PRODUCT_PREFIX}${entry.id}`);
  }
  localStorage.removeItem(STORAGE_KEYS.PRODUCTS_INDEX);
}

// Preferences
export function loadPreferences(): UserSettings {
  return (immediatelyLoad(STORAGE_KEYS.PREFERENCES) as UserSettings | null) || {};
}

export function savePreferences(prefs: UserSettings): void {
  debouncedSave(STORAGE_KEYS.PREFERENCES, prefs, 200);
}

// Workspace identity — generated once per browser, persists across sessions
export function getWorkspaceId(): string {
  let id = localStorage.getItem(STORAGE_KEYS.WORKSPACE_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.WORKSPACE_ID, id);
  }
  return id;
}

// Append an entry to a product's _changeLog, capping at max size
export function appendChangeLogEntry(product: Pick<Product, '_changeLog'>, entry: Omit<ChangeLogEntry, 't'>): ChangeLogEntry[] {
  const log = product._changeLog || [];
  const updated = [...log, { ...entry, t: Math.floor(Date.now() / 1000) }];
  return updated.length > CHANGELOG_MAX_ENTRIES
    ? updated.slice(updated.length - CHANGELOG_MAX_ENTRIES)
    : updated;
}

// Create new product
export function createNewProduct(name: string, description = '', workspaceIdOverride?: string): Product {
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
    sprintCadenceWeeks: 2,
    themes: [],
    _originRef: workspaceIdOverride || getWorkspaceId(),
    _changeLog: [{ t: Math.floor(Date.now() / 1000), op: 'create', entity: 'product' }] as ChangeLogEntry[],
  };
}

// Duplicate product
export function duplicateProduct(product: Product, workspaceIdOverride?: string): Product {
  const now = new Date().toISOString();
  const idMap = new Map<string, string>();

  function newId(oldId: string): string {
    if (!idMap.has(oldId)) idMap.set(oldId, crypto.randomUUID());
    return idMap.get(oldId)!;
  }

  // Remap rib IDs so releaseCardOrder can reference the new ones
  const ribIdMap = new Map<string, string>();
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
  const newCardOrder: Record<string, string[]> = {};
  for (const [colId, ribIds] of Object.entries(oldCardOrder)) {
    const newColId = colId === 'unassigned' ? 'unassigned' : newId(colId);
    newCardOrder[newColId] = ribIds.map(id => ribIdMap.get(id) || id);
  }

  // Remap sizingCardOrder values (rib IDs); keys are size labels so no remap needed
  const oldSizingOrder = product.sizingCardOrder || {};
  const newSizingOrder: Record<string, string[]> = {};
  for (const [key, ribIds] of Object.entries(oldSizingOrder)) {
    newSizingOrder[key] = ribIds.map(id => ribIdMap.get(id) || id);
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
    sizingCardOrder: newSizingOrder,
    _originRef: workspaceIdOverride || getWorkspaceId(),
    _changeLog: [{ t: Math.floor(Date.now() / 1000), op: 'duplicate', entity: 'product', source: product.id }] as ChangeLogEntry[],
  } as Product;
}

// Re-export import/export functions from dedicated module
export { exportProduct, exportAllProducts, importProductFromJSON, readImportFile } from './importExport';
