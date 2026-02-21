/**
 * Storage driver abstraction layer.
 *
 * Two implementations:
 * - createLocalStorageDriver() — wraps existing storage.js (localStorage)
 * - createFirestoreDriver(uid) — Firestore backend (in firestoreDriver.js)
 *
 * Both return the same async interface so the rest of the app
 * is unaware of which backend is active.
 */

import {
  loadProductIndex,
  loadProduct,
  saveProduct,
  saveProductImmediate,
  deleteProduct,
  loadPreferences,
  savePreferences,
  getWorkspaceId,
  flushPendingSaves,
  onSaveError,
} from './storage';

// Re-export Firestore driver from dedicated module
export { createFirestoreDriver } from './firestoreDriver';

// ── LocalStorageDriver ──────────────────────────────────────────────

/**
 * Wraps existing storage.js functions with an async interface.
 * All operations resolve immediately (localStorage is synchronous).
 */
export function createLocalStorageDriver() {
  return {
    mode: 'local',

    /** Returns full product data for each entry (uniform with cloud driver). */
    loadProductIndex() {
      const index = loadProductIndex();
      const products = index
        .map(entry => loadProduct(entry.id))
        .filter(Boolean);
      return Promise.resolve(products);
    },

    loadProduct(id) {
      return Promise.resolve(loadProduct(id));
    },

    /** Create a new product. Ownership fields are N/A in local mode. */
    createProduct(product) {
      saveProductImmediate(product);
      return Promise.resolve();
    },

    saveProduct(product) {
      saveProduct(product);
      return Promise.resolve();
    },

    saveProductImmediate(product) {
      saveProductImmediate(product);
      return Promise.resolve();
    },

    deleteProduct(id) {
      deleteProduct(id);
      return Promise.resolve();
    },

    loadPreferences() {
      return Promise.resolve(loadPreferences());
    },

    savePreferences(prefs) {
      savePreferences(prefs);
      return Promise.resolve();
    },

    getWorkspaceId() {
      return getWorkspaceId();
    },

    flushPendingSaves() {
      flushPendingSaves();
    },

    onSaveError(cb) {
      onSaveError(cb);
    },

    /** No-op for local mode — no remote changes to subscribe to. */
    onProductChange(_id, _cb) {
      return () => {};
    },
  };
}
