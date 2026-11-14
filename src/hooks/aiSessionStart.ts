// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The decisions useAiConnectivity's startSession makes about the open product's
// own session, with explicit parameters (no refs, no React): what S1's read means,
// what follows the resume write (S2), and the create write (S4). startSession
// keeps each await's `stillOpen()` check; aiSessionSwitch.ts handles the OTHER
// sessions.
import { doc, updateDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { APP_VERSION } from '../lib/version';
import { AI_CONSENT_KEY, AI_CONSENT_VERSION } from '../lib/aiConstants';
import { SESSIONS_COL } from '../lib/firestoreCollections';
import { clearLastSeq, canResumeSession, isSessionDocLive, type SessionDocView } from './aiConnectivityUtils';
import { removeSessionRecord, type AiSessionRecord } from '../lib/aiSessionRecords';
import type { OtherCandidate } from './aiSessionSwitch';

/** What startSession goes on with. `prevConsentRead` non-null: resume `sessionId`. */
export interface StartPlan {
  sessionId: string;
  prevConsentRead: boolean | null;
  /** The open product's own live session that names another product: replaced, ended once live. */
  replaced: OtherCandidate | null;
}

/** After S1: resume, replace, or forget a stale record (its cursor and entry go now). */
export function classifyOwnRecord(
  plan: StartPlan, record: AiSessionRecord, view: SessionDocView, openId: string,
): StartPlan {
  if (canResumeSession(true, view, openId, new Date())) {
    return { ...plan, sessionId: record.sessionId, prevConsentRead: view.consentRead };
  }
  if (isSessionDocLive(view, new Date())) {
    // Live but no longer naming this product: replace it, and end it below.
    return { ...plan, replaced: { sessionId: record.sessionId, productId: openId, productName: record.productName, startedAt: record.startedAt } };
  }
  clearLastSeq(record.sessionId);
  removeSessionRecord(openId, record.sessionId);
  return plan;
}

/**
 * S2: the resume write and what follows it. Returns the plan to go on with (a new
 * id and `prevConsentRead: null` when the doc is gone: create instead), or null to
 * stop (a failed Read → off downgrade, consent reverted).
 */
export async function resumeSessionDoc(
  database: Firestore, plan: StartPlan, openId: string, consentRead: boolean, exp: Date,
): Promise<StartPlan | null> {
  const { sessionId, prevConsentRead } = plan;
  try {
    await updateDoc(doc(database, SESSIONS_COL, sessionId), {
      consentRead, openProductId: openId,
      lastActiveAt: serverTimestamp(), browserConnectedAt: serverTimestamp(), expiresAt: exp,
    });
    if (prevConsentRead && !consentRead) {
      deleteDoc(doc(database, SESSIONS_COL, sessionId, 'snapshot', 'current')).catch(() => {});
    }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'not-found' || code === 'permission-denied') {
      clearLastSeq(sessionId);
      removeSessionRecord(openId, sessionId);
      return { ...plan, sessionId: crypto.randomUUID(), prevConsentRead: null };
    } else if (prevConsentRead && !consentRead) {
      // Privilege downgrade (Read → off) failed transiently. Revert
      // localStorage to the server's actual state (still consentRead:true).
      localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({
        version: AI_CONSENT_VERSION, date: new Date().toISOString(), write: true, read: true,
      }));
      deleteDoc(doc(database, SESSIONS_COL, sessionId, 'snapshot', 'current')).catch(() => {});
      console.error('[AI] Consent downgrade write failed; aborting resume:', err);
      return null;
    } else {
      console.error('[AI] Resume reconciliation failed; proceeding:', err);
    }
  }
  return plan;
}

/** S4: create the session doc. False when the create fails (logged). */
export async function createSessionDoc(
  database: Firestore, sessionId: string, openId: string, consentRead: boolean, exp: Date,
): Promise<boolean> {
  try {
    await setDoc(doc(database, SESSIONS_COL, sessionId), {
      createdAt: serverTimestamp(), lastActiveAt: serverTimestamp(), expiresAt: exp,
      browserConnectedAt: serverTimestamp(), openProductId: openId,
      consentWrite: true, consentRead, lastSeq: 0, appVersion: APP_VERSION,
      appId: 'storymap',
      // aiLastSeenAt intentionally OMITTED: MCP-server-owned. Including
      // it fails the Firestore create rule's hasOnly check.
    });
  } catch (err) {
    console.error('[AI] Session creation failed:', err);
    return false;
  }
  return true;
}
