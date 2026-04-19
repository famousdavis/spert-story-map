// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, StorageDriver } from '../types';

/**
 * Storage driver abstraction layer.
 *
 * Two implementations:
 * - createLocalStorageDriver() — wraps existing storage.ts (localStorage)
 * - createFirestoreDriver(uid) — Firestore backend (in firestoreDriver.ts)
 *
 * Both return the same async interface so the rest of the app
 * is unaware of which backend is active.
 */

import {
  loadProductIndex as _loadProductIndex,
  loadProduct as _loadProduct,
  saveProduct as _saveProduct,
  saveProductImmediate as _saveProductImmediate,
  deleteProduct as _deleteProduct,
  loadPreferences as _loadPreferences,
  savePreferences as _savePreferences,
  getWorkspaceId as _getWorkspaceId,
  flushPendingSaves as _flushPendingSaves,
  cancelPendingSaves as _cancelPendingSaves,
  onSaveError as _onSaveError,
} from './storage';

// Re-export Firestore driver from dedicated module
export { createFirestoreDriver } from './firestoreDriver';

// ── LocalStorageDriver ──────────────────────────────────────────────

/**
 * Wraps existing storage.ts functions with an async interface.
 * All operations resolve immediately (localStorage is synchronous).
 */
export function createLocalStorageDriver(): StorageDriver {
  return {
    mode: 'local',

    /** Returns full product data for each entry (uniform with cloud driver). */
    loadProductIndex() {
      const index = _loadProductIndex();
      const products = index
        .map(entry => _loadProduct(entry.id))
        .filter(Boolean) as Product[];
      return Promise.resolve(products);
    },

    loadProduct(id: string) {
      return Promise.resolve(_loadProduct(id));
    },

    /** Create a new product. Ownership fields are N/A in local mode. */
    createProduct(product: Product) {
      _saveProductImmediate(product);
      return Promise.resolve();
    },

    saveProduct(product: Product) {
      _saveProduct(product);
      return Promise.resolve();
    },

    saveProductImmediate(product: Product) {
      _saveProductImmediate(product);
      return Promise.resolve();
    },

    /** Full overwrite for imports. In local mode, same as saveProductImmediate. */
    replaceProduct(product: Product) {
      _saveProductImmediate(product);
      return Promise.resolve();
    },

    deleteProduct(id: string) {
      _deleteProduct(id);
      return Promise.resolve();
    },

    loadPreferences() {
      return Promise.resolve(_loadPreferences());
    },

    savePreferences(prefs) {
      _savePreferences(prefs);
      return Promise.resolve();
    },

    getWorkspaceId() {
      return _getWorkspaceId();
    },

    flushPendingSaves() {
      _flushPendingSaves();
    },

    cancelPendingSaves() {
      _cancelPendingSaves();
    },

    onSaveError(cb: (error: Error) => void) {
      _onSaveError(cb);
    },

    /** No-op for local mode — no remote changes to subscribe to. */
    onProductChange() {
      return () => {};
    },
  };
}
