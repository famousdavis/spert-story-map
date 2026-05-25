// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from './firebase';
import { clearAllLocalProducts, getActiveNamespace } from './storage';
import { runDriverCleanup } from './driverCleanupRegistry';
import type { StorageMode } from '../types';

// Intentionally duplicated from StorageProvider.tsx. The key lives there
// as a private module constant (not in src/lib/constants.ts). A shared
// constants module refactor is out of scope for this release — keep the
// two in sync if either is ever changed.
const STORAGE_MODE_KEY = 'spert-storage-mode';

/**
 * Single source of truth for sign-out cleanup.
 *
 * Sequence (enforced ordering):
 *   1. Run driver teardown via the registry (cancelPendingSaves +
 *      tearDownListeners). The registry decouples this from React
 *      context — StorageProvider registers the teardown on every
 *      driver swap, so AuthProvider's ToS-failure branches can fire
 *      it without holding a driver reference.
 *   2. Clear every product key in the active namespace.
 *   3. Clear the namespaced products index (covered by step 2 in
 *      practice; explicit here for the edge case of an orphaned index).
 *   4. Clear the namespaced preferences key (contains Export Attribution PII).
 *   5. Reset persisted storage mode to 'local'. If switchMode is
 *      provided (UI-initiated sign-out), use it so React state stays
 *      in sync; otherwise write directly to localStorage (used by
 *      AuthProvider's ToS-failure branches, which have no context
 *      access to switchMode).
 *   6. Revoke the Firebase session. onAuthStateChanged will fire with
 *      null as a result, which is the mechanism that updates React
 *      auth state. Do NOT call setUser(null) elsewhere.
 *
 * Step 1 must run BEFORE step 6 — a trailing write after credential
 * revocation produces PERMISSION_DENIED, and a trailing write that
 * races revocation may commit stale state to the user's cloud doc
 * after they believed they signed out.
 *
 * Preserved (must NOT be cleared):
 *   - rp_workspace_id (per-browser academic integrity token)
 *   - spert-theme, spert_firstRun_seen, spert_map_hint_dismissed (UI prefs)
 *   - spert_tos_accepted_version (managed separately by tosHelpers)
 *   - rp:local:* keys (anonymous-session data — signed-out user's other
 *     local-mode workspace stays intact)
 */
export async function signOutCleanup(
  switchMode?: ((mode: StorageMode) => void) | null,
): Promise<void> {
  // 1. Driver teardown via registry — cancels pending writes + detaches
  //    onSnapshot listeners. The registry is a leaf module (no imports of
  //    its own), so static import is cycle-safe.
  await runDriverCleanup();

  // 2-4. Clear the signed-in user's namespaced state. getActiveNamespace
  //      returns the uid when signed in; anonymous sign-outs (rare) fall
  //      through to 'local', which clears anonymous data.
  const ns = getActiveNamespace();
  clearAllLocalProducts(ns);
  localStorage.removeItem(`rp:${ns}:products_index`);
  localStorage.removeItem(`rp:${ns}:preferences`);

  // 5. Reset persisted storage mode to 'local'.
  if (switchMode) {
    switchMode('local');
  } else {
    localStorage.setItem(STORAGE_MODE_KEY, 'local');
  }

  // 6. Revoke Firebase session (fires onAuthStateChanged(null)).
  if (auth) {
    await firebaseSignOut(auth);
  }
}
