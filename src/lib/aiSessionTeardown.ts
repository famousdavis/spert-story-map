// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { doc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsInstance } from './firebase';
import { SESSIONS_COL } from './firestoreCollections';
import {
  AI_SESSION_ID_KEY, AI_CONSENT_KEY, AI_TEARDOWN_PENDING_KEY,
} from './aiConstants';
import { clearLastSeq } from '../hooks/aiConnectivityUtils';

/**
 * B-04 — end a Connect AI session at sign-out, OUTSIDE React.
 *
 * `useAiConnectivity.stopSession` already does this, but that hook is mounted
 * only inside `ProductLayout`. A user can sign out from the project-list home
 * page, where the hook is not mounted, and sign-out can also be driven by an
 * auth-state change (another tab, a token that cannot refresh) that the hook
 * never sees. So the teardown lives here as a plain module function that reads
 * the session id from localStorage, and `signOutCleanup` (every explicit
 * sign-out) and `AuthProvider`'s auth-change handler (the cross-tab / token
 * paths) both call it. It mirrors `stopSession` → `teardown`: a LOCAL teardown
 * (forget the session in this browser) plus the server `teardownAiSession`
 * Cloud Function (delete the relay session + its snapshot), following
 * Forecaster's sign-out wiring.
 *
 * Idempotent: with no stored session id it is a no-op. Safe to call more than
 * once per sign-out (e.g. `signOutCleanup` then the auth-change handler) — the
 * second call finds the keys already gone and does nothing.
 *
 * Connect AI relay sessions are anonymous and browser-scoped; they do not
 * require a signed-in account (Connect AI works in local mode). Sign-out is one
 * trigger that should end a session, not a precondition for having one.
 */

/** Bound the server call so a flaky network cannot hang sign-out. */
const TEARDOWN_TIMEOUT_MS = 10_000;

export interface AiSignOutTeardownResult {
  /** True when a stored session id was found and a server teardown was tried. */
  attempted: boolean;
  /**
   * True when the session is fully ended as far as this browser can tell:
   * either there was nothing to end, or the server `teardownAiSession` call
   * succeeded. False means the relay session may still be live (and readable /
   * writable by the paired AI) until its 7-day TTL — a retry is parked.
   */
  serverOk: boolean;
}

// ── Pending-retry marker ──────────────────────────────────────────────────────

/**
 * Same-tab signal that the pending marker changed. AiTeardownBanner is mounted
 * once, app-wide, so it cannot learn of a set/clear from a `storage` event
 * (those fire only in OTHER tabs). This custom event lets it re-read.
 */
export const AI_TEARDOWN_CHANGED_EVENT = 'spert:ai-teardown-changed';

function notifyTeardownChanged(): void {
  try { window.dispatchEvent(new CustomEvent(AI_TEARDOWN_CHANGED_EVENT)); }
  catch { /* no window (non-DOM env) */ }
}

/** The session id parked for a later teardown retry, or null. */
export function getPendingAiTeardownSessionId(): string | null {
  try { return localStorage.getItem(AI_TEARDOWN_PENDING_KEY); }
  catch { return null; }
}

function setPendingAiTeardown(sessionId: string): void {
  try { localStorage.setItem(AI_TEARDOWN_PENDING_KEY, sessionId); } catch { /* no localStorage */ }
  notifyTeardownChanged();
}

export function clearPendingAiTeardown(): void {
  let had = false;
  try {
    had = localStorage.getItem(AI_TEARDOWN_PENDING_KEY) !== null;
    localStorage.removeItem(AI_TEARDOWN_PENDING_KEY);
  } catch { /* no localStorage */ }
  if (had) notifyTeardownChanged();
}

// ── Internals ──────────────────────────────────────────────────────────────────

function clearLocalAiKeys(sessionId: string | null): void {
  try {
    if (sessionId) clearLastSeq(sessionId);
    localStorage.removeItem(AI_SESSION_ID_KEY);
    localStorage.removeItem(AI_CONSENT_KEY);
  } catch { /* localStorage unavailable (private mode / blocked) */ }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('teardown-timeout')), ms);
    p.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

/**
 * The authoritative server-side revocation. Deletes the Read-mode snapshot and
 * calls the `teardownAiSession` Cloud Function (which deletes the ops, the
 * snapshot and the session doc). Returns true only when the Cloud Function
 * succeeded — after that every MCP tool rejects the session id with
 * `session_not_found`.
 */
async function runServerTeardown(sessionId: string): Promise<boolean> {
  if (!db || !functionsInstance) return false;
  // Offline: fail fast and deterministically rather than waiting on a request
  // that cannot succeed. The marker is set by the caller so it is retried.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  // Best-effort early snapshot delete; the Cloud Function deletes it too.
  try {
    await deleteDoc(doc(db, SESSIONS_COL, sessionId, 'snapshot', 'current'));
  } catch { /* non-fatal — the Cloud Function removes the snapshot as well */ }
  try {
    await withTimeout(
      httpsCallable(functionsInstance, 'teardownAiSession')({ sessionId }),
      TEARDOWN_TIMEOUT_MS,
    );
    return true;
  } catch (err) {
    console.error(
      '[AI] Sign-out teardown failed; the AI session may stay live until it ' +
      'TTL-expires in 7 days unless retried:', err,
    );
    return false;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * End the Connect AI session as part of sign-out. Always clears the local
 * session keys; when a session id was stored, also deletes the server relay
 * session. On a server failure the session id is parked for retry and the
 * result reports `serverOk: false` so the UI can tell the user.
 */
export async function endAiSessionForSignOut(): Promise<AiSignOutTeardownResult> {
  let sessionId: string | null = null;
  try { sessionId = localStorage.getItem(AI_SESSION_ID_KEY); } catch { /* no localStorage */ }

  // Local teardown ALWAYS — the browser forgets the session whether or not the
  // server call succeeds, so no next user on this browser can resume it.
  clearLocalAiKeys(sessionId);

  // Nothing stored, or no Firebase (so no relay session could ever have been
  // created): the session is fully ended; drop any stale marker.
  if (!sessionId || !db || !functionsInstance) {
    clearPendingAiTeardown();
    return { attempted: false, serverOk: true };
  }

  const serverOk = await runServerTeardown(sessionId);
  if (serverOk) clearPendingAiTeardown();
  else setPendingAiTeardown(sessionId);
  return { attempted: true, serverOk };
}

/**
 * Retry a parked teardown (next load, or when the browser is back online).
 * Returns true when there is nothing left pending (either it was cleared or
 * there was nothing to do); false when a retry was attempted and still failed.
 */
export async function retryPendingAiTeardown(): Promise<boolean> {
  const sessionId = getPendingAiTeardownSessionId();
  if (!sessionId) return true;
  if (!db || !functionsInstance) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const ok = await runServerTeardown(sessionId);
  if (ok) clearPendingAiTeardown();
  return ok;
}
