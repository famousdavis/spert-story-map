// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from './firebase';
import { STORAGE_KEYS } from './constants';
import type { StorageDriver, StorageMode } from '../types';

// Intentionally duplicated from StorageProvider.tsx. The key lives there
// as a private module constant (not in src/lib/constants.ts). A shared
// constants module refactor is out of scope for this release — keep the
// two in sync if either is ever changed.
const STORAGE_MODE_KEY = 'spert-storage-mode';

/**
 * Single source of truth for sign-out cleanup.
 *
 * Sequence (enforced ordering):
 *   1. Cancel any pending debounced Firestore writes — prevents
 *      PERMISSION_DENIED after credential revocation and prevents
 *      stale writes from landing during the revoke race.
 *   2. Detach every active onSnapshot listener registered through the
 *      driver (audit L3). Without this, listeners survive into the
 *      logged-out auth state and fire `permission-denied`, surfacing
 *      a misleading toast on a logged-out screen.
 *   3. Clear every rp_product_* key from localStorage.
 *   4. Clear rp_products_index.
 *   5. Clear rp_app_preferences (contains Export Attribution PII).
 *   6. Reset persisted storage mode to 'local'. If switchMode is
 *      provided (UI-initiated sign-out), use it so React state stays
 *      in sync; otherwise write directly to localStorage (used by
 *      AuthProvider's ToS-failure branches, which have no context
 *      access to switchMode).
 *   7. Revoke the Firebase session. onAuthStateChanged will fire with
 *      null as a result, which is the mechanism that updates React
 *      auth state. Do NOT call setUser(null) elsewhere.
 *
 * Preserved (must NOT be cleared):
 *   - rp_workspace_id (per-browser academic integrity token)
 *   - spert-theme, spert_firstRun_seen, spert_map_hint_dismissed (UI prefs)
 *   - spert_tos_accepted_version (managed separately by tosHelpers)
 */
export async function signOutCleanup(
  driver: StorageDriver | null,
  switchMode?: (mode: StorageMode) => void,
): Promise<void> {
  // 1. Cancel pending writes on the live driver before credentials are revoked.
  if (driver) {
    driver.cancelPendingSaves();
    // 2. Detach live onSnapshot listeners (audit L3).
    driver.tearDownListeners();
  }

  // 3. Clear every rp_product_* key by iterating localStorage directly.
  //    This catches orphaned product docs that are not in the index.
  const prefix = STORAGE_KEYS.PRODUCT_PREFIX;
  const productKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) productKeys.push(key);
  }
  for (const key of productKeys) localStorage.removeItem(key);

  // 4. Clear the product index.
  localStorage.removeItem(STORAGE_KEYS.PRODUCTS_INDEX);

  // 5. Clear Export Attribution and other per-user preferences.
  localStorage.removeItem(STORAGE_KEYS.PREFERENCES);

  // 6. Reset persisted storage mode to 'local'.
  if (switchMode) {
    switchMode('local');
  } else {
    localStorage.setItem(STORAGE_MODE_KEY, 'local');
  }

  // 7. Revoke Firebase session (fires onAuthStateChanged(null)).
  if (auth) {
    await firebaseSignOut(auth);
  }
}
