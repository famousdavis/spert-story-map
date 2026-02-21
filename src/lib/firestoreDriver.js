/**
 * Firestore-backed storage driver.
 *
 * Collections:
 *   spertstorymap_projects/{productId}  — full product doc + owner/members
 *   spertstorymap_profiles/{uid}        — user profile
 *   spertstorymap_settings/{uid}        — per-user preferences
 */

import {
  doc, getDoc, setDoc, deleteDoc, getDocs,
  collection, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { migrateToV2 } from './storage';

const PROJECTS_COL = 'spertstorymap_projects';
const SETTINGS_COL = 'spertstorymap_settings';

/**
 * Recursively strip `undefined` values from an object.
 * Firestore rejects explicit `undefined` — must omit the field entirely.
 */
export function sanitizeForFirestore(obj) {
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
export function stripFirestoreFields(data) {
  if (!data) return data;
  const { owner, members, ...product } = data;
  return product;
}

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
        if (snap.metadata.hasPendingWrites) return;
        if (!snap.exists()) return;
        const data = snap.data();
        cb(migrateToV2(stripFirestoreFields({ id: snap.id, ...data })));
      });
    },
  };
}
