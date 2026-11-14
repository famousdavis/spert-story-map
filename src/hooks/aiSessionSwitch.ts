// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { doc, getDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { SESSIONS_COL } from '../lib/firestoreCollections';
import {
  getLastSeq, clearLastSeq, isSessionDocLive, isSessionInUse, changesWaiting,
  type OtherSession, type SessionDocView,
} from './aiConnectivityUtils';
import { removeSessionRecord, removeLegacySessionId } from '../lib/aiSessionRecords';
import { endSessionInBackground } from '../lib/aiSessionTeardown';
import { sessionLockName } from './aiSessionLock';

/**
 * B15 R-3/R-4: what startSession does with the OTHER sessions this browser
 * records when it starts a new one: read each doc first, judge it, then (only
 * once the new session goes live) end the ones no other tab is using.
 */

function toDate(v: unknown): Date | null {
  const d = (v as { toDate?: () => Date } | null | undefined)?.toDate?.();
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

/** Read a session doc. Throws when the read itself fails. */
export async function readSessionDoc(database: Firestore, sessionId: string): Promise<SessionDocView> {
  const snap = await getDoc(doc(database, SESSIONS_COL, sessionId));
  if (!snap.exists()) {
    return { exists: false, expiresAt: null, openProductId: null, lastSeq: 0, browserConnectedAt: null, consentRead: false };
  }
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    exists: true,
    expiresAt: toDate(d.expiresAt),
    openProductId: d.openProductId,
    lastSeq: typeof d.lastSeq === 'number' ? d.lastSeq : 0,
    browserConnectedAt: toDate(d.browserConnectedAt),
    consentRead: d.consentRead === true,
  };
}

export interface OtherCandidate {
  sessionId: string;
  /** null for a legacy session. */
  productId: string | null;
  productName: string;
  startedAt: number;
}

/** Read every candidate's doc in parallel; a failed read gives `doc: null` (unknown). */
export async function readOtherSessions(
  database: Firestore, candidates: OtherCandidate[],
): Promise<Array<OtherCandidate & { doc: SessionDocView | null }>> {
  return Promise.all(candidates.map(async c => {
    try { return { ...c, doc: await readSessionDoc(database, c.sessionId) }; }
    catch { return { ...c, doc: null }; }
  }));
}

/** Judge each one before anything is ended. `lockedNames` null = no Web Locks here. */
export function judgeOtherSessions(
  read: Array<OtherCandidate & { doc: SessionDocView | null }>, lockedNames: Set<string> | null, now: Date,
): OtherSession[] {
  return read.map(({ doc: d, ...c }) => {
    const live = isSessionDocLive(d, now);
    const lockHeld = lockedNames ? lockedNames.has(sessionLockName(c.sessionId)) : null;
    return {
      ...c,
      readFailed: d === null,
      live,
      inUse: live && isSessionInUse(lockHeld, c.productId === null, d?.browserConnectedAt ?? null, now),
      waiting: live && !!d && changesWaiting(d.lastSeq, getLastSeq(c.sessionId)),
    };
  });
}

/**
 * End every judged session no other tab is using. Server-side only, never this
 * tab's local teardown; fire-and-forget. A failed read is left alone (unknown);
 * a missing or expired doc only loses its record here.
 */
export function endOtherSessions(others: OtherSession[]): void {
  for (const o of others) {
    if (o.readFailed || (o.live && o.inUse)) continue;
    clearLastSeq(o.sessionId);
    if (o.productId !== null) removeSessionRecord(o.productId, o.sessionId);
    else removeLegacySessionId(o.sessionId);
    if (o.live) void endSessionInBackground(o.sessionId);
  }
}
