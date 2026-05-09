// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, StorageDriver } from '../types';

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
  collection, query, where,
  onSnapshot, serverTimestamp,
  deleteField, runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';
import { migrateToV2 } from './storage';
import { sanitizeForFirestore } from './firestoreUtils';
import { getRevokeInvite, getResendInvite } from './firebase';
import type { PendingInvite } from '../types';

const PROJECTS_COL = 'spertstorymap_projects';
const SETTINGS_COL = 'spertstorymap_settings';

/** Remove Firestore-only fields from product data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore document data is heterogeneous; strict typing would be false safety
export function stripFirestoreFields(data: any): any {
  if (!data) return data;
  const { owner: _owner, members: _members, ...product } = data;
  return product;
}

export function createFirestoreDriver(uid: string): StorageDriver {
  let _onSaveError: ((error: unknown) => void) | null = null;
  let productTimer: ReturnType<typeof setTimeout> | null = null;
  let productPending: Product | null = null;
  let prefsTimer: ReturnType<typeof setTimeout> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore document data is heterogeneous; strict typing would be false safety
  let prefsPending: any = null;

  function handleWriteError(e: unknown): void {
    console.error('Firestore write error:', e instanceof Error ? e.message : 'Unknown error');
    if (_onSaveError) _onSaveError(e);
  }

  async function doSaveProduct(product: Product): Promise<void> {
    try {
      const ref = doc(db, PROJECTS_COL, product.id);
      const { id: _id, ...rest } = product;
      const data = sanitizeForFirestore(rest);
      // Never include owner/members in regular saves — prevents editors
      // from overwriting ownership. merge: true preserves them.
      await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      handleWriteError(e);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore document data is heterogeneous; strict typing would be false safety
  async function doSavePrefs(prefs: any): Promise<void> {
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
     * Uses a server-side where() filter on the members map to avoid
     * fetching every project in the collection (security + cost fix).
     * Returns full product data with _owner/_members metadata attached.
     */
    async loadProductIndex() {
      const q = query(
        collection(db, PROJECTS_COL),
        where(`members.${uid}`, 'in', ['owner', 'editor', 'viewer']),
      );
      const snap = await getDocs(q);
      const products = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const product = migrateToV2(stripFirestoreFields({ id: docSnap.id, ...data }));
        // Re-attach owner/members from the raw doc — stripFirestoreFields
        // removed them. Use `?? null` so the field shape is stable for the
        // UI's strict-equality ownership checks. (Lessons 38, 49.)
        product._owner = data.owner ?? null;
        product._members = data.members;
        products.push(product);
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
        const { id: _id, ...rest } = product;
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
    saveProduct(product: Product) {
      productPending = product;
      if (productTimer) clearTimeout(productTimer);
      productTimer = setTimeout(() => {
        productTimer = null;
        const p = productPending;
        productPending = null;
        doSaveProduct(p!);
      }, 500);
      return Promise.resolve();
    },

    /** Immediate save. Never sets owner/members. */
    async saveProductImmediate(product: Product) {
      if (productTimer) {
        clearTimeout(productTimer);
        productTimer = null;
        productPending = null;
      }
      await doSaveProduct(product);
    },

    /**
     * Full overwrite for imports. Reads existing owner/members first,
     * then writes the entire document without merge: true so stale
     * fields from the old document are not retained.
     */
    async replaceProduct(product: Product) {
      if (productTimer) {
        clearTimeout(productTimer);
        productTimer = null;
        productPending = null;
      }
      try {
        const ref = doc(db, PROJECTS_COL, product.id);
        const snap = await getDoc(ref);
        const existing = snap.exists() ? snap.data() : {};
        const { id: _id, ...rest } = product;
        const data = sanitizeForFirestore(rest);
        await setDoc(ref, {
          ...data,
          owner: existing.owner || uid,
          members: existing.members || { [uid]: 'owner' },
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        handleWriteError(e);
      }
    },

    async deleteProduct(id: string) {
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
        console.error('Failed to load cloud preferences:', e instanceof Error ? e.message : 'Unknown error');
        return {};
      }
    },

    /** Debounced save (200ms). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore document data is heterogeneous; strict typing would be false safety
    savePreferences(prefs: any) {
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

    /**
     * Cancel both pending debounce timers WITHOUT writing.
     * Used by sign-out cleanup — a trailing write after credential
     * revocation produces PERMISSION_DENIED, and a trailing write
     * that races revocation may commit stale state to the user's
     * cloud doc after they believed they signed out.
     */
    cancelPendingSaves() {
      if (productTimer) {
        clearTimeout(productTimer);
        productTimer = null;
      }
      productPending = null;
      if (prefsTimer) {
        clearTimeout(prefsTimer);
        prefsTimer = null;
      }
      prefsPending = null;
    },

    onSaveError(cb: (error: Error) => void) {
      _onSaveError = cb;
    },

    /**
     * Subscribe to real-time changes for a product.
     * Uses hasPendingWrites for echo prevention.
     *
     * stripFirestoreFields removes `owner`/`members` from the parsed product;
     * we re-attach `_owner` from the raw doc so per-project listener echoes
     * don't blank the field set by the initial loadProductIndex. Without
     * this, the Share button disappears 1–3s after Add Project as the first
     * snapshot arrives. (Lesson 49: third strip site.)
     */
    onProductChange(id: string, cb: (product: Product) => void) {
      const ref = doc(db, PROJECTS_COL, id);
      return onSnapshot(
        ref,
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          if (!snap.exists()) return;
          const data = snap.data();
          const product = migrateToV2(stripFirestoreFields({ id: snap.id, ...data }));
          product._owner = data.owner ?? null;
          cb(product);
        },
        (error) => {
          console.error('Firestore listener error:', error instanceof Error ? error.message : 'Unknown error');
          if (_onSaveError) _onSaveError(error);
        },
      );
    },

    async listPendingInvites(productId: string): Promise<PendingInvite[]> {
      try {
        const q = query(
          collection(db, 'spertsuite_invitations'),
          where('inviterUid', '==', uid),
          where('modelId', '==', productId),
        );
        const snap = await getDocs(q);
        const results: PendingInvite[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data();
          if (d.status !== 'pending') return;
          results.push({
            tokenId: docSnap.id,
            inviteeEmail: d.inviteeEmail as string,
            role: d.role as 'editor' | 'viewer',
            status: d.status as PendingInvite['status'],
            createdAt: (d.createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0,
            expiresAt: (d.expiresAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0,
            lastEmailSentAt: (d.lastEmailSentAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0,
            modelId: d.modelId as string,
            modelName: d.modelName as string,
            emailSendCount: (d.emailSendCount as number) ?? 0,
            inviterUid: d.inviterUid as string,
            appId: d.appId as string,
            isVoting: (d.isVoting as boolean) ?? false,
          });
        });
        return results.sort((a, b) => b.createdAt - a.createdAt);
      } catch (e) {
        console.error('Failed to load pending invites:', e instanceof Error ? e.message : 'Unknown error');
        return [];
      }
    },

    /**
     * Remove a collaborator from a project's members map.
     *
     * Three-guard pattern (Lesson 50). Firestore rules permit an owner to
     * remove themselves (passes "caller is owner" check), but the resulting
     * `members[ownerUid] === undefined` makes every subsequent read fail —
     * the project becomes permanently inaccessible. These guards backstop
     * the rules.
     *
     *   Guard 1 (pre-tx, fast-fail): caller is not the target.
     *   Guard 2 (in-tx): caller is the project owner.
     *   Guard 3 (in-tx): target is not the project owner.
     *
     * Errors are thrown with human-readable messages so callers can surface
     * them directly to the user. The factory closes over `uid`; there is no
     * `this`.
     */
    async removeCollaborator(productId: string, targetUid: string): Promise<void> {
      if (!db) return; // defensive: db is null when Firebase is unavailable
      // Guard 1 — pre-tx fast fail
      if (targetUid === uid) {
        throw new Error('Cannot remove yourself from a project.');
      }
      try {
        const ref = doc(db, PROJECTS_COL, productId);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) {
            throw new Error('Project not found.');
          }
          const data = snap.data();
          // Guard 2 — defense-in-depth (UI is owner-gated)
          if (data.owner !== uid) {
            throw new Error('Only the project owner can remove members.');
          }
          // Guard 3 — block removing the owner
          if (data.owner === targetUid) {
            throw new Error('Cannot remove the project owner.');
          }
          tx.update(ref, { [`members.${targetUid}`]: deleteField() });
        });
      } catch (e) {
        handleWriteError(e);
        throw e; // re-throw so the UI catch surfaces the guard message
      }
    },

    async revokeInvite(tokenId: string): Promise<void> {
      const callable = getRevokeInvite();
      if (!callable) return;
      await callable({ tokenId });
    },

    async resendInvite(tokenId: string): Promise<void> {
      const callable = getResendInvite();
      if (!callable) return;
      await callable({ tokenId });
    },
  };
}
