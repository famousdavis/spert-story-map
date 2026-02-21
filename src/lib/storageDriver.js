/**
 * Storage driver abstraction layer.
 *
 * Two implementations:
 * - createLocalStorageDriver() — wraps existing storage.js (localStorage)
 * - createFirestoreDriver(uid) — Firestore backend
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
  migrateToV2,
} from './storage';

import {
  doc, getDoc, setDoc, deleteDoc, getDocs,
  collection, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

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

// ── FirestoreDriver ─────────────────────────────────────────────────

const PROJECTS_COL = 'spertstorymap_projects';
const SETTINGS_COL = 'spertstorymap_settings';

/**
 * Recursively strip `undefined` values from an object.
 * Firestore rejects explicit `undefined` — must omit the field entirely.
 */
function sanitizeForFirestore(obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  if (typeof obj !== 'object') return obj;
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean;
}

/** Remove Firestore-only fields from product data. */
function stripFirestoreFields(data) {
  if (!data) return data;
  const { owner, members, ...product } = data;
  return product;
}

/**
 * Firestore-backed storage driver.
 *
 * Collections:
 *   spertstorymap_projects/{productId}  — full product doc + owner/members
 *   spertstorymap_profiles/{uid}        — user profile
 *   spertstorymap_settings/{uid}        — per-user preferences
 */
export function createFirestoreDriver(uid) {
  let _onSaveError = null;
  let productTimer = null;
  let productPending = null;
  let prefsTimer = null;
  let prefsPending = null;

  function handleWriteError(e) {
    console.error('Firestore write error:', e);
    if (_onSaveError) _onSaveError(e);
  }

  async function doSaveProduct(product) {
    try {
      const ref = doc(db, PROJECTS_COL, product.id);
      const { id, ...rest } = product;
      const data = sanitizeForFirestore(rest);
      // Never include owner/members in regular saves — prevents editors
      // from overwriting ownership. merge: true preserves them.
      await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      handleWriteError(e);
    }
  }

  async function doSavePrefs(prefs) {
    try {
      const ref = doc(db, SETTINGS_COL, uid);
      await setDoc(ref, sanitizeForFirestore(prefs));
    } catch (e) {
      handleWriteError(e);
    }
  }

  return {
    mode: 'cloud',

    /**
     * Load all projects the user has access to.
     * Returns full product data with _owner/_members metadata attached.
     */
    async loadProductIndex() {
      const snap = await getDocs(collection(db, PROJECTS_COL));
      const products = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.members && data.members[uid]) {
          const product = migrateToV2(stripFirestoreFields({ id: docSnap.id, ...data }));
          product._owner = data.owner;
          product._members = data.members;
          products.push(product);
        }
      });
      return products;
    },

    async loadProduct(id) {
      const ref = doc(db, PROJECTS_COL, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data();
      return migrateToV2(stripFirestoreFields({ id: snap.id, ...data }));
    },

    /**
     * Create a new product with ownership.
     * Only place where owner/members are set — used by ProductList.handleCreate
     * and ProductList.handleDuplicate.
     */
    async createProduct(product) {
      try {
        const ref = doc(db, PROJECTS_COL, product.id);
        const { id, ...rest } = product;
        const data = sanitizeForFirestore(rest);
        await setDoc(ref, {
          ...data,
          owner: uid,
          members: { [uid]: 'owner' },
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        handleWriteError(e);
      }
    },

    /** Debounced save (500ms). Never sets owner/members. */
    saveProduct(product) {
      productPending = product;
      if (productTimer) clearTimeout(productTimer);
      productTimer = setTimeout(() => {
        productTimer = null;
        const p = productPending;
        productPending = null;
        doSaveProduct(p);
      }, 500);
      return Promise.resolve();
    },

    /** Immediate save. Never sets owner/members. */
    async saveProductImmediate(product) {
      // Cancel any pending debounced save for this product
      if (productTimer) {
        clearTimeout(productTimer);
        productTimer = null;
        productPending = null;
      }
      await doSaveProduct(product);
    },

    async deleteProduct(id) {
      try {
        await deleteDoc(doc(db, PROJECTS_COL, id));
      } catch (e) {
        handleWriteError(e);
      }
    },

    async loadPreferences() {
      try {
        const ref = doc(db, SETTINGS_COL, uid);
        const snap = await getDoc(ref);
        return snap.exists() ? snap.data() : {};
      } catch (e) {
        console.error('Failed to load cloud preferences:', e);
        return {};
      }
    },

    /** Debounced save (200ms). */
    savePreferences(prefs) {
      prefsPending = prefs;
      if (prefsTimer) clearTimeout(prefsTimer);
      prefsTimer = setTimeout(() => {
        prefsTimer = null;
        const p = prefsPending;
        prefsPending = null;
        doSavePrefs(p);
      }, 200);
    },

    getWorkspaceId() {
      return uid;
    },

    /**
     * Flush both pending debounce timers.
     * Known limitation: beforeunload can't reliably await async Firestore
     * writes — the browser may kill the page before the promise resolves.
     * At most 500ms of typing could be lost on tab close.
     */
    flushPendingSaves() {
      if (productTimer && productPending) {
        clearTimeout(productTimer);
        productTimer = null;
        const p = productPending;
        productPending = null;
        doSaveProduct(p);
      }
      if (prefsTimer && prefsPending) {
        clearTimeout(prefsTimer);
        prefsTimer = null;
        const p = prefsPending;
        prefsPending = null;
        doSavePrefs(p);
      }
    },

    onSaveError(cb) {
      _onSaveError = cb;
    },

    /**
     * Subscribe to real-time changes for a product.
     * Uses hasPendingWrites for echo prevention.
     */
    onProductChange(id, cb) {
      const ref = doc(db, PROJECTS_COL, id);
      return onSnapshot(ref, (snap) => {
        if (snap.metadata.hasPendingWrites) return; // Echo — skip
        if (!snap.exists()) return;
        const data = snap.data();
        cb(migrateToV2(stripFirestoreFields({ id: snap.id, ...data })));
      });
    },
  };
}
