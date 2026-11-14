// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { doc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsInstance } from './firebase';
import { SESSIONS_COL } from './firestoreCollections';
import {
  AI_SESSION_ID_KEY, AI_CONSENT_KEY, AI_TEARDOWN_PENDING_KEY, AI_END_PENDING_KEY, AI_SESSION_KEY_PREFIX,
} from './aiConstants';
import { clearLastSeq } from '../hooks/aiConnectivityUtils';
import { listSessionRecords, listRecordedSessions } from './aiSessionRecords';

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
 * B15 (v0.55.11): a browser can hold one session per product, so sign-out ends
 * every recorded session plus a legacy one from before v0.55.11.
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

/**
 * Every session this browser records (B15): one per product entry, plus a
 * legacy one from before v0.55.11, each once. The same list startSession judges.
 */
function recordedSessionIds(): string[] {
  return listRecordedSessions().map(s => s.sessionId);
}

function clearLocalAiKeys(sessionIds: string[]): void {
  try {
    for (const id of sessionIds) clearLastSeq(id);
    for (const r of listSessionRecords()) localStorage.removeItem(AI_SESSION_KEY_PREFIX + r.productId);
    localStorage.removeItem(AI_SESSION_ID_KEY);
    localStorage.removeItem(AI_CONSENT_KEY);
  } catch { /* localStorage unavailable (private mode / blocked) */ }
}

// ── B15: sessions ended because another product's session started ────────────

function readPendingSessionEnds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(AI_END_PENDING_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [];
  } catch { return []; }
}

function writePendingSessionEnds(ids: string[]): void {
  try {
    if (ids.length) localStorage.setItem(AI_END_PENDING_KEY, JSON.stringify(ids));
    else localStorage.removeItem(AI_END_PENDING_KEY);
  } catch { /* no localStorage */ }
}

/** Sessions parked for a silent retry (no banner). */
export function getPendingSessionEnds(): string[] { return readPendingSessionEnds(); }

function parkSessionEnd(sessionId: string): void {
  const ids = readPendingSessionEnds();
  if (!ids.includes(sessionId)) writePendingSessionEnds([...ids, sessionId]);
}

/**
 * End a session on the server only (the snapshot delete and `teardownAiSession`),
 * never touching this tab's live session. A failure is parked on
 * AI_END_PENDING_KEY and retried silently by retryPendingAiTeardown.
 */
export async function endSessionInBackground(sessionId: string): Promise<boolean> {
  const ok = await runServerTeardown(sessionId);
  if (!ok) parkSessionEnd(sessionId);
  return ok;
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
  // Capture the imports into locals so the non-null narrowing survives into the
  // async closure below (a bare `db` would widen back to `Firestore | null`).
  const database = db;
  const fns = functionsInstance;
  if (!database || !fns) return false;
  // Offline: fail fast and deterministically rather than waiting on a request
  // that cannot succeed. The marker is set by the caller so it is retried.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    // Bound the WHOLE server teardown, not just the callable. A Firestore write
    // does not resolve while the backend is unreachable, and navigator.onLine
    // can be true when it still is (captive portal, dropped VPN, corporate
    // proxy). Left unbounded, the snapshot delete would hang sign-out forever.
    await withTimeout((async () => {
      // Best-effort early snapshot delete; the Cloud Function deletes it too,
      // so a failure here is swallowed — but it stays inside the timeout.
      try {
        await deleteDoc(doc(database, SESSIONS_COL, sessionId, 'snapshot', 'current'));
      } catch { /* non-fatal — the Cloud Function removes the snapshot as well */ }
      // The authoritative revocation.
      await httpsCallable(fns, 'teardownAiSession')({ sessionId });
    })(), TEARDOWN_TIMEOUT_MS);
    return true;
  } catch (err) {
    console.error(
      '[AI] Could not reach the server to end the AI session; it may ' +
      'stay live until it TTL-expires in 7 days unless retried:', err,
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
  // B15: every session this browser records, one per product plus a legacy one.
  const sessionIds = recordedSessionIds();

  // Local teardown ALWAYS — the browser forgets the session whether or not the
  // server call succeeds, so no next user on this browser can resume it.
  clearLocalAiKeys(sessionIds);

  // Nothing stored, or no Firebase (so no relay session could ever have been
  // created): nothing to revoke. MUST leave any parked marker ALONE. A failed
  // teardown parks the marker and then clears the session id (above), so the
  // SAME function running again with no session id — AuthProvider's auth-change
  // handler fires right after firebaseSignOut, and another tab shares
  // localStorage — would otherwise erase the warning it just set and the
  // failure would go silent, which is exactly what this change prevents. Only a
  // successful teardown/retry (below, or retryPendingAiTeardown) or the user's
  // Dismiss clears the marker.
  if (!sessionIds.length || !db || !functionsInstance) {
    return { attempted: false, serverOk: true };
  }

  const results = await Promise.all(sessionIds.map(id => runServerTeardown(id)));
  const failed = sessionIds.filter((_, i) => !results[i]);
  // Clear only a marker that belongs to a session we actually ended, so a
  // successful teardown of one session cannot drop another session's pending
  // retry.
  const marker = getPendingAiTeardownSessionId();
  if (marker && sessionIds.includes(marker) && !failed.includes(marker)) clearPendingAiTeardown();
  // The marker (and its banner) holds one id; any further failure is parked on
  // the silent list, which the same retry drains.
  const [first, ...rest] = failed;
  if (first) setPendingAiTeardown(first);
  for (const id of rest) parkSessionEnd(id);
  return { attempted: true, serverOk: failed.length === 0 };
}

/**
 * Retry a parked teardown (next load, or when the browser is back online).
 * Returns true when there is nothing left pending (either it was cleared or
 * there was nothing to do); false when a retry was attempted and still failed.
 */
export async function retryPendingAiTeardown(): Promise<boolean> {
  await retryPendingSessionEnds();
  const sessionId = getPendingAiTeardownSessionId();
  if (!sessionId) return true;
  if (!db || !functionsInstance) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const ok = await runServerTeardown(sessionId);
  if (ok) clearPendingAiTeardown();
  return ok;
}

/** Retry the silent list (B15). Each id leaves the list once its end succeeds. */
async function retryPendingSessionEnds(): Promise<void> {
  const ids = readPendingSessionEnds();
  if (!ids.length || !db || !functionsInstance) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const results = await Promise.all(ids.map(id => runServerTeardown(id)));
  const ended = ids.filter((_, i) => results[i]);
  writePendingSessionEnds(readPendingSessionEnds().filter(id => !ended.includes(id)));
}
