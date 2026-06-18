// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, ChangeLogEntry, StorageDriver } from '../types';

/**
 * Firestore-backed storage driver.
 *
 * Collections:
 *   spertstorymap_projects/{productId}  — full product doc + owner/members
 *   spertstorymap_profiles/{uid}        — user profile
 *   spertstorymap_settings/{uid}        — per-user preferences
 */

import {
  doc, getDoc, setDoc, deleteDoc, getDocs, updateDoc,
  collection, query, where,
  onSnapshot, serverTimestamp,
  deleteField, runTransaction, arrayUnion,
} from 'firebase/firestore';
import { db } from './firebase';
import { migrateToV2 } from './storage';
import { sanitizeForFirestore } from './firestoreUtils';
import { callRevokeInvite, callResendInvite } from './callables';
import type { PendingInvite } from '../types';
import { PROJECTS_COL, SETTINGS_COL } from './firestoreCollections';

/** Remove Firestore-only fields from product data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore document data is heterogeneous; strict typing would be false safety
export function stripFirestoreFields(data: any): any {
  if (!data) return data;
  const { owner: _owner, members: _members, ...product } = data;
  return product;
}

/**
 * Per-product set of changelog-entry signatures already known to the server.
 * Used to compute the delta of new entries to push via arrayUnion. Without
 * this, every save would push the entire log array on top of itself, and
 * Firestore's arrayUnion dedupe (structural equality) would silently drop
 * everything but the first occurrence of each entry — yielding partial
 * truncation as the log grows.
 */
function entrySig(entry: ChangeLogEntry): string {
  return [
    entry.t,
    entry.op,
    entry.entity ?? '',
    entry.id ?? '',
    entry.uid ?? '',
    entry.source ?? '',
    entry.seq ?? '',
  ].join('|');
}

export function createFirestoreDriver(uid: string): StorageDriver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- subscribers may receive heterogeneous error shapes
  const saveErrorSubs = new Set<(error: any) => void>();
  let productTimer: ReturnType<typeof setTimeout> | null = null;
  let productPending: Product | null = null;
  let prefsTimer: ReturnType<typeof setTimeout> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore document data is heterogeneous; strict typing would be false safety
  let prefsPending: any = null;

  // Active onSnapshot unsubscribers (audit L3). Tracked centrally so
  // signOutCleanup can detach all listeners before credential revocation.
  const activeListeners = new Set<() => void>();

  // Per-product changelog baseline: signatures of entries the server is
  // known to already have. doSaveProduct sends only the delta via
  // arrayUnion; baseline is reset whenever the driver re-syncs from the
  // server (loadProduct, onProductChange echo, createProduct,
  // replaceProduct). Closure-scoped per driver instance so swapping users
  // wipes the map.
  const changeLogBaseline = new Map<string, Set<string>>();

  function getNewChangeLogEntries(productId: string, log: ChangeLogEntry[]): ChangeLogEntry[] {
    const baseline = changeLogBaseline.get(productId) ?? new Set<string>();
    return log.filter(e => !baseline.has(entrySig(e)));
  }

  function advanceBaseline(productId: string, newEntries: ChangeLogEntry[]): void {
    const cur = changeLogBaseline.get(productId) ?? new Set<string>();
    const upd = new Set(cur);
    newEntries.forEach(e => upd.add(entrySig(e)));
    changeLogBaseline.set(productId, upd);
  }

  function resetChangeLogBaseline(productId: string, log: ChangeLogEntry[]): void {
    changeLogBaseline.set(productId, new Set(log.map(entrySig)));
  }

  function handleWriteError(e: unknown): void {
    console.error('Firestore write error:', e instanceof Error ? e.message : 'Unknown error');
    for (const cb of saveErrorSubs) {
      try { cb(e); } catch (err) { console.error('onSaveError subscriber threw:', err); }
    }
  }

  /**
   * Save a product to Firestore.
   *
   * Two-write sequence:
   *   1. setDoc with mergeFields — overwrites whitelisted fields only.
   *      `_changeLog` is excluded from mergeFields so a smaller local log
   *      doesn't truncate the server's history (would happen on every echo
   *      that arrives before the local log catches up).
   *   2. updateDoc with arrayUnion(...newEntries) — appends only entries
   *      the server doesn't already have, tracked via changeLogBaseline.
   *      arrayUnion is atomic on the array field and dedupes by structural
   *      equality; the `seq` nonce in each entry guarantees uniqueness for
   *      same-second bulk-delete writes.
   *
   * Non-atomicity: if setDoc succeeds and the subsequent updateDoc fails,
   * the changelog entry isn't sent. The baseline isn't advanced for failed
   * writes, so the entry is retried on the next save (the user makes any
   * other change). Acceptable for a best-effort audit trail.
   *
   * Side-write fields stripped: id (URL-encoded into the doc ref),
   * _owner/_members (Firestore-only, set by createProduct/replaceProduct
   * — never by editor saves), _storageRef/_exportedBy/_exportedById
   * (export-time-only fields that would leak attribution into Firestore).
   */
  async function doSaveProduct(product: Product): Promise<void> {
    try {
      const ref = doc(db, PROJECTS_COL, product.id);
      const {
        id: _id,
        // Cloud-only / export-only fields that must never be written by a
        // routine save. owner/_owner and members/_members are owned by
        // createProduct + replaceProduct exclusively.
        owner: _o0, members: _m0,
        _storageRef: _sr, _exportedBy: _eb, _exportedById: _ebi,
        // Excluded from mergeFields below so the server's _changeLog isn't
        // truncated by a smaller local copy; sent via arrayUnion instead.
        _changeLog: _cl,
        ...rest
      } = product as Product & {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw doc may have stripped/sentinel shapes
        _owner?: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _members?: any;
      };
      // _owner / _members are alias fields re-attached by onProductChange
      // for in-memory state; they alias the canonical owner/members from
      // the raw doc and must also be stripped before write.
      const restNoAliases: Record<string, unknown> = { ...rest };
      delete restNoAliases._owner;
      delete restNoAliases._members;

      const sanitized = sanitizeForFirestore(restNoAliases);
      // mergeFields whitelist — every key from sanitized except canonical
      // owner/members (which never appear here anyway because they were
      // destructured out), plus updatedAt. _changeLog is intentionally
      // excluded; the updateDoc(arrayUnion) call below appends only the
      // new entries so the server's history is monotonic.
      const mergeFields = [
        ...Object.keys(sanitized).filter(k =>
          k !== 'owner' && k !== 'members' && k !== 'createdAt' &&
          k !== '_originRef' && k !== '_changeLog',
        ),
        'updatedAt',
      ];
      await setDoc(ref, { ...sanitized, updatedAt: serverTimestamp() }, { mergeFields });

      // Changelog delta — push only entries new to the server.
      const newEntries = getNewChangeLogEntries(product.id, product._changeLog ?? []);
      if (newEntries.length > 0) {
        await updateDoc(ref, { _changeLog: arrayUnion(...newEntries) });
        advanceBaseline(product.id, newEntries);
      }
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
        // Seed the baseline so the first save after a list-page load doesn't
        // re-send every entry (and so arrayUnion isn't asked to dedupe the
        // entire history).
        resetChangeLogBaseline(product.id, product._changeLog ?? []);
        products.push(product);
      });
      return products;
    },

    async loadProduct(id) {
      const ref = doc(db, PROJECTS_COL, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data();
      const product = migrateToV2(stripFirestoreFields({ id: snap.id, ...data }));
      // Seed _owner/_members on cold load too — without these the Share UI
      // and ownership-gated affordances would briefly render in their
      // "no access" state until the first onProductChange snapshot arrives.
      product._owner = data.owner ?? null;
      product._members = data.members ?? {};
      // Reset the changelog baseline so the first save after a cold load
      // sends only entries the user adds post-load (Option B — encapsulated
      // inside the driver so useProduct doesn't need to know about it).
      resetChangeLogBaseline(id, product._changeLog ?? []);
      return product;
    },

    /**
     * Create a new product with ownership.
     * Only place where owner/members are set — used by ProductList.handleCreate
     * and ProductList.handleDuplicate.
     *
     * Default: best-effort (errors caught via handleWriteError → onSaveError banner).
     * options.throwOnError: rethrows for callers that need to correlate failures with
     *                       specific products (the import pipeline).
     */
    async createProduct(product, options?: { throwOnError?: boolean }) {
      if (!db) {
        const err = new Error('Cloud storage unavailable. Please try again.');
        if (options?.throwOnError) throw err;
        handleWriteError(err);
        return;
      }
      // Drop any pending debounced save for this product before the create —
      // a trailing setDoc after the explicit create would either overwrite the
      // newly-set owner/members or race the import pipeline's per-product
      // outcome reporting.
      if (productTimer) { clearTimeout(productTimer); productTimer = null; }
      productPending = null;
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
        // Seed the baseline with the create-time changelog so future saves
        // send only the delta — without this, the first updateProduct after
        // a create would push the entire log via arrayUnion.
        resetChangeLogBaseline(product.id, product._changeLog ?? []);
      } catch (e) {
        if (options?.throwOnError) throw e;
        handleWriteError(e);
      }
    },

    /** Debounced save (200ms). Never sets owner/members. */
    saveProduct(product: Product) {
      productPending = product;
      if (productTimer) clearTimeout(productTimer);
      productTimer = setTimeout(() => {
        productTimer = null;
        const p = productPending;
        productPending = null;
        doSaveProduct(p!);
      }, 200);
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
     * Full content replace for import. Uses runTransaction to eliminate the prior
     * getDoc+setDoc lost-write race.
     *
     * Preserved from existing doc:
     *   owner, members — collaborator permissions (Firestore-only)
     *   createdAt      — original creation timestamp
     *   _originRef     — workspace provenance fingerprint (academic integrity)
     *
     * Errors propagate to applyImport's per-write try/catch and surface in the
     * import done banner (outcome.errors). NOT routed through handleWriteError.
     */
    async replaceProduct(product: Product) {
      if (!db) throw new Error('Cloud storage unavailable. Please try again.');
      if (productTimer) {
        clearTimeout(productTimer);
        productTimer = null;
        productPending = null;
      }
      const ref = doc(db, PROJECTS_COL, product.id);
      const { id: _id, ...rest } = product;
      const data = sanitizeForFirestore(rest);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const existing = snap.exists() ? snap.data() : {};
        tx.set(ref, {
          ...data,
          owner: existing.owner ?? uid,
          members: existing.members ?? { [uid]: 'owner' },
          createdAt: existing.createdAt ?? data.createdAt,
          _originRef: (existing._originRef as string | undefined) ?? data._originRef,
          updatedAt: serverTimestamp(),
        });
      });
      // Baseline reset AFTER transaction commits — the new server-side log
      // matches product._changeLog (replaceProduct overwrote the array),
      // so future saves should send only post-replace deltas.
      resetChangeLogBaseline(product.id, product._changeLog ?? []);
    },

    async deleteProduct(id: string) {
      // Drop any pending debounced save for this product before deleting —
      // otherwise the trailing setDoc would resurrect the just-deleted doc.
      if (productTimer) { clearTimeout(productTimer); productTimer = null; }
      productPending = null;
      // Also drop the baseline so a stale-baseline read after a re-create
      // doesn't suppress legitimate changelog entries.
      changeLogBaseline.delete(id);
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
     * At most 200ms of typing could be lost on tab close.
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

    /**
     * Subscribe to driver save errors. Multi-subscriber: ProductLayout and
     * ProductList both register independently. Returns an unsubscribe
     * function — call on effect cleanup so a re-render or unmount doesn't
     * leak a stale setSaveError callback that fires after the component
     * has gone away.
     */
    onSaveError(cb: (error: Error) => void) {
      saveErrorSubs.add(cb);
      return () => { saveErrorSubs.delete(cb); };
    },

    /**
     * Subscribe to real-time changes for a product.
     * Uses hasPendingWrites for echo prevention.
     *
     * stripFirestoreFields removes `owner`/`members` from the parsed product;
     * we re-attach BOTH `_owner` AND `_members` from the raw doc so per-project
     * listener echoes don't blank the field set by the initial loadProductIndex.
     * Without `_members`, the Sharing UI's "is this user the owner / an editor
     * / a viewer" check fails on the first echo, hiding affordances 1-3s after
     * any save. (H1-B fix; Lesson 49 third strip site.)
     */
    onProductChange(
      id: string,
      cb: (product: Product) => void,
      onError?: (error: unknown) => void,
    ) {
      const ref = doc(db, PROJECTS_COL, id);
      const rawUnsubscribe = onSnapshot(
        ref,
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          if (!snap.exists()) return;
          const data = snap.data();
          const product = migrateToV2(stripFirestoreFields({ id: snap.id, ...data }));
          product._owner = data.owner ?? null;
          product._members = (data.members as Record<string, string>) ?? {};
          // Re-sync the changelog baseline with the server's authoritative
          // copy so the next save's arrayUnion delta is correct.
          resetChangeLogBaseline(id, product._changeLog ?? []);
          cb(product);
        },
        (error) => {
          console.error('Firestore listener error:', error instanceof Error ? error.message : 'Unknown error');
          // Route to per-call onError (Pass 5 permission-denied path) when
          // provided; otherwise fall back to the save-error banner.
          if (onError) {
            onError(error);
          } else {
            for (const cb of saveErrorSubs) {
              try { cb(error); } catch (err) { console.error('onSaveError subscriber threw:', err); }
            }
          }
        },
      );
      // Wrap so tearDownListeners and the consumer's React-effect-cleanup
      // both work correctly. Calling either path removes the entry from
      // activeListeners exactly once. (Audit L3.)
      const wrapped = () => {
        if (activeListeners.delete(wrapped)) {
          rawUnsubscribe();
        }
      };
      activeListeners.add(wrapped);
      return wrapped;
    },

    /**
     * Detach every active onProductChange subscription. Called by
     * signOutCleanup before credentials are revoked so listeners do not
     * fire `permission-denied` errors against a logged-out auth state.
     * Safe to call multiple times — the wrapped unsubscribers are
     * idempotent. (Audit L3.)
     */
    tearDownListeners() {
      // Snapshot first because `wrapped()` mutates `activeListeners`.
      const all = Array.from(activeListeners);
      for (const unsub of all) unsub();
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
      await callRevokeInvite({ tokenId });
    },

    async resendInvite(tokenId: string): Promise<void> {
      await callResendInvite({ tokenId });
    },
  };
}
