// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from './firebase';
import { flushPendingSaves, getActiveNamespace, removeExportIdentity } from './storage';
import { runDriverCleanup } from './driverCleanupRegistry';
import { clearTosAcceptance } from './tosHelpers';
import { endAiSessionForSignOut } from './aiSessionTeardown';
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
 *   0. Write any pending local save first, on every path (v0.56.1, R71 R-2;
 *      only at 'local' from v0.55.16): products live in rp:local, signed in
 *      or not, and step 1 would cancel the write. Local writes only.
 *   1. Run driver teardown via the registry (cancelPendingSaves +
 *      tearDownListeners). The registry decouples this from React
 *      context — StorageProvider registers the teardown on every
 *      driver swap, so AuthProvider's ToS-failure branches can fire
 *      it without holding a driver reference.
 *   2-4. At a uid, remove the person's export name and identifier from
 *      their own settings, directly and synchronously, and keep the rest
 *      (v0.56.1, R-2, R91). No product key is removed in any namespace:
 *      rp:local is this browser's one product store.
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
 * Steps 2-4 run only for a uid namespace (v0.55.16, Scheduler's WI-118 guard).
 * The Sign out button runs with the signed-in person's uid active. The Terms
 * sign-outs in AuthProvider run before setUser, while the preferences
 * namespace is still 'local', so they remove nothing; that person's export
 * identity stays in their own rp:{uid}:preferences, which no one else reads.
 *
 * Preserved (must NOT be cleared):
 *   - rp_workspace_id (per-browser academic integrity token)
 *   - spert-theme, spert_firstRun_seen, spert_map_hint_dismissed (UI prefs)
 *   - every product key and products index, on every path (v0.56.1)
 *   - the rest of the person's settings (tile order, colour, archive, caution switch)
 *
 * Cleared (B-10): spert_tos_accepted_version, via clearTosAcceptance. Keeping
 * it across sign-out let the next person on a shared browser be treated as
 * having accepted the Terms they never saw — and have a users/{uid} record
 * written for them. signOutCleanup runs only on a genuine sign-out, never on a
 * cold-load page reload, so a returning user's acceptance survives a reload.
 *
 * Ended (B-04): any active Connect AI session, via endAiSessionForSignOut —
 * a local teardown plus the server teardownAiSession call, so a paired AI
 * assistant loses access at sign-out instead of keeping read/write to the
 * last-open project until the relay's 7-day TTL. Done BEFORE firebaseSignOut
 * (step 6) while the Firestore client is still live. If the server call fails
 * (e.g. offline) the session id is parked for retry and AiTeardownBanner tells
 * the user; this does not block the rest of sign-out. See aiSessionTeardown.ts.
 */
export async function signOutCleanup(
  switchMode?: ((mode: StorageMode) => void) | null,
): Promise<void> {
  // 0. Write this browser's pending saves rather than let step 1 cancel them,
  //    on every path (v0.56.1). Local writes only, so nothing reaches the cloud
  //    after the sign-out.
  const ns = getActiveNamespace();
  flushPendingSaves();

  // 1. Driver teardown via registry — cancels pending writes + detaches
  //    onSnapshot listeners. The registry is a leaf module (no imports of
  //    its own), so static import is cycle-safe.
  await runDriverCleanup();

  // 2-4. At a uid: the export name and identifier leave the person's own
  //      settings; the rest stays for their next sign-in (R91). No product is
  //      removed (v0.56.1, R71).
  if (ns !== 'local') removeExportIdentity(ns);

  // 4b. Reset Terms acceptance (B-10) so the next person to sign in is shown
  //     the Terms. See the header note for why this is cleared here.
  clearTosAcceptance();

  // 4c. End any Connect AI session (B-04): local teardown + server
  //     teardownAiSession, so a paired AI loses access immediately rather than
  //     keeping read/write until the relay's 7-day TTL. Awaited (bounded by an
  //     internal timeout) so a reachable server is revoked before the page
  //     moves on; a failure is parked for retry, never thrown, so it cannot
  //     block firebaseSignOut below.
  await endAiSessionForSignOut();

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
