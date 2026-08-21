// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, ChangeLogEntry, UserSettings } from '../types';
import { STORAGE_KEYS, SCHEMA_VERSION, DEFAULT_SIZE_MAPPING, CHANGELOG_MAX_ENTRIES } from './constants';
import { runObserver } from './validatorObserverRegistry';
import { needsV2Migration } from './schemaVersion';

// ── localStorage namespace ──────────────────────────────────────────
//
// Every per-user write goes through a namespace so the same browser can
// hold multiple users' caches without collision. StorageProvider binds the
// active namespace on every auth transition: `uid` when signed in, `'local'`
// when anonymous. Callers can override per-call (e.g. ProductList's orphan
// check reads `'local'` while in cloud mode).
//
// Workspace identity (rp_workspace_id) is NEVER namespaced — it's a
// per-browser academic integrity token that must survive sign-outs.

let activeNamespace: string = 'local';

export function setStorageNamespace(ns: string): void {
  activeNamespace = ns || 'local';
}

export function getActiveNamespace(): string {
  return activeNamespace;
}

function productKeyFor(id: string, ns: string): string {
  return `rp:${ns}:product_${id}`;
}

function indexKeyFor(ns: string): string {
  return `rp:${ns}:products_index`;
}

function preferencesKeyFor(ns: string): string {
  return `rp:${ns}:preferences`;
}

// Save error subscribers — multi-subscriber Set so ProductLayout AND
// ProductList can each receive write-failure notifications without one
// overwriting the other (the prior single-callback model only kept the
// last registrant). Returns an unsubscribe function — call on effect
// cleanup so an unmounted component doesn't leak a setState target.
const saveErrorSubs = new Set<(error: unknown) => void>();

export function onSaveError(callback: (error: unknown) => void): () => void {
  saveErrorSubs.add(callback);
  return () => { saveErrorSubs.delete(callback); };
}

function handleSaveError(e: unknown): void {
  console.error('Failed to save to localStorage:', e instanceof Error ? e.message : 'Unknown error');
  for (const cb of saveErrorSubs) {
    try { cb(e); } catch (err) { console.error('onSaveError subscriber threw:', err); }
  }
}

// Debounce helper
let saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
let pendingSaves: Record<string, unknown> = {};
function debouncedSave(key: string, data: unknown, delay = 200): void {
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
export function loadProductIndex(ns?: string): { id: string; name: string; updatedAt?: string }[] {
  const key = indexKeyFor(ns ?? activeNamespace);
  return (immediatelyLoad(key) as { id: string; name: string; updatedAt?: string }[] | null) || [];
}

export function saveProductIndex(index: { id: string; name: string; updatedAt?: string }[], ns?: string): void {
  debouncedSave(indexKeyFor(ns ?? activeNamespace), index, 100);
}

// Schema migration: v1 → v2 (per-release progress)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pre-schema data may not match Product interface
export function migrateToV2(product: any): any {
  // ⚠️ ONE predicate, shared with the three call sites — see schemaVersion.ts. The
  // inline `(sv || 1) >= 2` this replaced disagreed with the local and import gates
  // for a truthy non-numeric value, and this function is DESTRUCTIVE, so the cloud
  // (which calls it unguarded) zeroed progress history where the others did nothing.
  if (!product || !needsV2Migration(product.schemaVersion)) return product;

  // ⚠️ Shape guards, not paranoia. The cloud calls this inside `snap.forEach`, so a
  // non-array `themes` threw `TypeError: … is not iterable` and took down the WHOLE
  // project-index load — every project, not just the malformed one — before any
  // per-item isolation could see it. Returning early leaves the product untouched and
  // unmigrated, which is idempotent and harmless on the next load.
  if (!Array.isArray(product.themes)) return product;

  for (const theme of product.themes) {
    if (!Array.isArray(theme?.backboneItems)) continue;
    for (const backbone of theme.backboneItems) {
      if (!Array.isArray(backbone?.ribItems)) continue;
      for (const rib of backbone.ribItems) {
        if (!rib) continue;
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
export function loadProduct(id: string, ns?: string): Product | null {
  const namespace = ns ?? activeNamespace;
  const key = productKeyFor(id, namespace);
  // Boundary cast: immediatelyLoad returns `unknown` because localStorage JSON
  // is untrusted. This is the same validation boundary validateProduct sits on
  // for imports — the migration below is what normalises an older shape.
  let product = immediatelyLoad(key) as Product | null;
  // Brief 10 §3d: capture BEFORE the gate below. `migrateToV2` mutates `product`
  // IN PLACE, so a capture taken at the `return` would already read the
  // post-migration value — measured wrong in 18 of 24 cases.
  const rawSchemaVersion = product?.schemaVersion;
  if (product && needsV2Migration(product.schemaVersion)) {
    product = migrateToV2(product);
    // Save immediately so migration only runs once
    try {
      localStorage.setItem(key, JSON.stringify(product));
    } catch (e) {
      console.error('Failed to save migrated product:', e instanceof Error ? e.message : 'Unknown error');
    }
  }
  // Called FOR EFFECT — never `return runObserver(...)`. A no-op unless something
  // registered the observer at bootstrap (§3a); `null` is routine here and the
  // observer guards it (§3b.2).
  runObserver(product, { rawSchemaVersion });
  return product;
}

export function saveProduct(product: Product): Product {
  const updated = { ...product, updatedAt: new Date().toISOString() };
  debouncedSave(productKeyFor(product.id, activeNamespace), updated);

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
    localStorage.setItem(productKeyFor(product.id, activeNamespace), JSON.stringify(updated));
    const index = loadProductIndex();
    const existing = index.findIndex(p => p.id === product.id);
    const entry = { id: product.id, name: product.name, updatedAt: updated.updatedAt };
    if (existing >= 0) {
      index[existing] = entry;
    } else {
      index.push(entry);
    }
    localStorage.setItem(indexKeyFor(activeNamespace), JSON.stringify(index));
  } catch (e) {
    handleSaveError(e);
  }
  return updated;
}

/**
 * Synchronous immediate save that propagates write errors instead of swallowing
 * them via handleSaveError. Used by the import pipeline so callers can correlate
 * a quota failure with the specific product that failed.
 *
 * Non-import paths should continue to use saveProductImmediate (best-effort,
 * fires onSaveError banner globally).
 */
export function saveProductImmediateOrThrow(product: Product): Product {
  const updated = { ...product, updatedAt: new Date().toISOString() };
  localStorage.setItem(productKeyFor(product.id, activeNamespace), JSON.stringify(updated));
  const index = loadProductIndex();
  const existing = index.findIndex(p => p.id === product.id);
  const entry = { id: product.id, name: product.name, updatedAt: updated.updatedAt };
  if (existing >= 0) {
    index[existing] = entry;
  } else {
    index.push(entry);
  }
  localStorage.setItem(indexKeyFor(activeNamespace), JSON.stringify(index));
  return updated;
}

export function deleteProduct(id: string): void {
  // Drop any pending debounced writes for this product and the index — a
  // trailing save would resurrect the deleted product or write a stale
  // index entry referencing it.
  const productKey = productKeyFor(id, activeNamespace);
  const indexKey = indexKeyFor(activeNamespace);
  if (saveTimers[productKey]) { clearTimeout(saveTimers[productKey]); delete saveTimers[productKey]; delete pendingSaves[productKey]; }
  if (saveTimers[indexKey])   { clearTimeout(saveTimers[indexKey]);   delete saveTimers[indexKey];   delete pendingSaves[indexKey]; }
  try {
    localStorage.removeItem(productKey);
    const index = loadProductIndex().filter(p => p.id !== id);
    localStorage.setItem(indexKey, JSON.stringify(index));
  } catch (e) {
    console.error('Failed to delete product:', e instanceof Error ? e.message : 'Unknown error');
  }
}

/** Remove all local products in a namespace and clear that namespace's index. */
export function clearAllLocalProducts(ns?: string): void {
  const namespace = ns ?? activeNamespace;
  const index = loadProductIndex(namespace);
  for (const entry of index) {
    localStorage.removeItem(productKeyFor(entry.id, namespace));
  }
  localStorage.removeItem(indexKeyFor(namespace));
}

// Preferences
export function loadPreferences(ns?: string): UserSettings {
  const key = preferencesKeyFor(ns ?? activeNamespace);
  return (immediatelyLoad(key) as UserSettings | null) || {};
}

export function savePreferences(prefs: UserSettings, ns?: string): void {
  debouncedSave(preferencesKeyFor(ns ?? activeNamespace), prefs, 200);
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

/**
 * Append an entry to a product's `_changeLog`.
 *
 * Adds a per-entry uniqueness nonce (`seq`) so two entries appended in the
 * same second are still distinguishable in Firestore's arrayUnion path —
 * arrayUnion dedupes by structural equality, so bulk-delete entries that
 * omit id/uid/source would collapse to a single entry without seq.
 *
 * Caps at CHANGELOG_MAX_ENTRIES.
 */
export function appendChangeLogEntry(product: Pick<Product, '_changeLog'>, entry: Omit<ChangeLogEntry, 't' | 'seq'>): ChangeLogEntry[] {
  const log = product._changeLog || [];
  const nonce = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const updated = [...log, { ...entry, t: Math.floor(Date.now() / 1000), seq: nonce }];
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

// Note: exportProduct is now async and takes (product, driver, storageRefOverride?, cachedPrefs?).
// All call sites have been updated to pass `driver` as the second argument; the previous
// sync signature relied on a synchronous loadPreferences() that broke cloud-mode export
// attribution (cloud prefs live in Firestore, not localStorage).
