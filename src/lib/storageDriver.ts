// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, StorageDriver, PendingInvite } from '../types';

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
  saveProductImmediateOrThrow as _saveProductImmediateOrThrow,
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

    /**
     * Create a new product. Ownership fields are N/A in local mode.
     *
     * Default: best-effort (errors swallowed via handleSaveError → onSaveError banner).
     * options.throwOnError: rethrows for callers that need to correlate failures with
     *                       specific products (the import pipeline).
     */
    async createProduct(product: Product, options?: { throwOnError?: boolean }) {
      if (options?.throwOnError) {
        _saveProductImmediateOrThrow(product);
      } else {
        _saveProductImmediate(product);
      }
    },

    saveProduct(product: Product) {
      _saveProduct(product);
      return Promise.resolve();
    },

    saveProductImmediate(product: Product) {
      _saveProductImmediate(product);
      return Promise.resolve();
    },

    /**
     * Full content replace for import. Reads the existing product first to preserve
     * identity fields before overwriting content.
     *
     * createdAt  — preserved so dashboard shows original creation date
     * _originRef — workspace provenance fingerprint (academic integrity tracking)
     *
     * Local mode is single-writer; no transaction needed. Uses
     * saveProductImmediateOrThrow so a QuotaExceededError surfaces to applyImport
     * instead of being silently dropped.
     */
    async replaceProduct(product: Product) {
      const existing = _loadProduct(product.id);
      const merged: Product = {
        ...product,
        createdAt: existing?.createdAt ?? product.createdAt,
        _originRef: existing?._originRef ?? product._originRef,
      };
      _saveProductImmediateOrThrow(merged);
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
      return _onSaveError(cb);
    },

    /**
     * No-op for local mode — no remote changes to subscribe to. The
     * optional onError is accepted (and ignored) to keep the signature
     * uniform with the cloud driver.
     */
    onProductChange(_id: string, _cb: (product: Product) => void, _onError?: (error: unknown) => void) {
      return () => {};
    },

    /** No-op for local mode — there are no listeners to detach. */
    tearDownListeners() {},

    listPendingInvites(_productId: string): Promise<PendingInvite[]> {
      return Promise.resolve([]);
    },

    removeCollaborator(_productId: string, _uid: string): Promise<void> {
      return Promise.resolve();
    },

    revokeInvite(_tokenId: string): Promise<void> {
      return Promise.resolve();
    },

    resendInvite(_tokenId: string): Promise<void> {
      return Promise.resolve();
    },
  };
}
