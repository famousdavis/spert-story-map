// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  collection, doc, query, orderBy, where,
  onSnapshot, updateDoc, setDoc, deleteDoc,
  serverTimestamp, getDoc, getDocs,
} from 'firebase/firestore';
import type { QuerySnapshot, DocumentData, DocumentSnapshot, FirestoreError } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsInstance, isFirebaseAvailable } from '../lib/firebase';
import { APP_VERSION } from '../lib/version';
import type { Product, ProductUpdater } from '../types';
import { applyAiOp, applyDrainOps, computeSafePrefix, type AiOpDoc } from '../lib/aiOps';
import { selectSnapshotForWrite } from '../lib/aiSnapshot';
import {
  AI_SESSION_ID_KEY, AI_CONSENT_KEY, AI_CONSENT_VERSION,
} from '../lib/aiConstants';
import { SESSIONS_COL } from '../lib/firestoreCollections';
import {
  getLastSeq, setLastSeq, clearLastSeq, safeParseConsent, buildOpsQuery,
} from './aiConnectivityUtils';

/** Firestore doc limit is 1 MB; 900 KB leaves headroom for metadata. */
const SNAPSHOT_BYTE_LIMIT = 900_000;

// ── Public types ────────────────────────────────────────────────────────────
export interface AiSessionState {
  sessionActive: boolean;
  aiConnected: boolean;
  consentRead: boolean;
  sessionId: string | null;
}
export interface UseAiConnectivityResult {
  sessionState: AiSessionState;
  startSession: (consentRead: boolean) => Promise<boolean>;
  stopSession: () => Promise<void>;
  changePermissions: (consentRead: boolean) => Promise<boolean>;
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function useAiConnectivity(
  product: Product | null,
  updateProduct: (updater: ProductUpdater) => void,
): UseAiConnectivityResult {
  const [sessionState, setSessionState] = useState<AiSessionState>({
    sessionActive: false, aiConnected: false, consentRead: false, sessionId: null,
  });
  // ── Refs ──────────────────────────────────────────────────────────────────
  const productRef = useRef<Product | null>(product);
  const opsUnsubRef = useRef<(() => void) | null>(null);
  const sessionUnsubRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const startSessionInFlightRef = useRef(false);
  const consentReadRef = useRef(false);
  // Self-reference fix: onError retries delegate through refs to avoid a
  // self-referential useCallback.
  const resubscribeOpsRef = useRef<((sessionId: string) => void) | null>(null);
  const resubscribeSessionRef = useRef<((sessionId: string) => void) | null>(null);
  // Retry timer refs — cleared in localTeardown to prevent post-unmount attach.
  const retryTimerOpsRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerSessionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Retry counters. Reset in onNext (successful delivery) and localTeardown
  // (disconnect). NOT reset in resubscribeOps/resubscribeSession (the retry
  // path — resetting there would defeat the cap).
  const opRetryCountRef = useRef(0);
  const sessionRetryCountRef = useRef(0);
  // D5 null-product window recovery. highestSeenSeqRef tracks the max op seq
  // ever delivered; inNullWindowRef + preNullWindowSeqRef capture the cursor
  // at the moment ops first arrive while productRef.current is null.
  const highestSeenSeqRef = useRef(0);
  const inNullWindowRef = useRef(false);
  const preNullWindowSeqRef = useRef(0);

  useEffect(() => { productRef.current = product; }, [product]);
  useEffect(() => { consentReadRef.current = sessionState.consentRead; }, [sessionState.consentRead]);

  // ── localTeardown ──────────────────────────────────────────────────────────
  const localTeardown = useCallback(() => {
    opsUnsubRef.current?.(); opsUnsubRef.current = null;
    sessionUnsubRef.current?.(); sessionUnsubRef.current = null;
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (snapshotTimerRef.current) { clearTimeout(snapshotTimerRef.current); snapshotTimerRef.current = null; }
    if (retryTimerOpsRef.current) { clearTimeout(retryTimerOpsRef.current); retryTimerOpsRef.current = null; }
    if (retryTimerSessionRef.current) { clearTimeout(retryTimerSessionRef.current); retryTimerSessionRef.current = null; }
    activeSessionIdRef.current = null;
    opRetryCountRef.current = 0;
    sessionRetryCountRef.current = 0;
    highestSeenSeqRef.current = 0;
    inNullWindowRef.current = false;
    preNullWindowSeqRef.current = 0;
  }, []);

  // ── Snapshot writer ─────────────────────────────────────────────────────────
  const writeSnapshot = useCallback(() => {
    if (!db || !productRef.current || !activeSessionIdRef.current) return;
    if (!consentReadRef.current) return; // single gate
    const sessionId = activeSessionIdRef.current;
    const p = productRef.current;
    const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // D8: degrade rather than skip. A skipped write leaves the PRIOR snapshot in
    // place and stale -- the AI then reads outdated structure with no signal.
    const { snapshot, degraded } = selectSnapshotForWrite(p, SNAPSHOT_BYTE_LIMIT);
    if (!snapshot) {
      console.warn('[AI] Snapshot exceeds budget even without notes -- skipping.');
      return;
    }
    if (degraded) console.warn('[AI] Snapshot over budget with notes -- wrote lean.');

    setDoc(doc(db, SESSIONS_COL, sessionId, 'snapshot', 'current'),
      { product: snapshot, updatedAt: serverTimestamp(), expiresAt: exp },
    ).catch(err => console.error('[AI] Snapshot write failed:', err));
  }, []);

  const scheduleSnapshot = useCallback(() => {
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(writeSnapshot, 2000);
  }, [writeSnapshot]);

  // ── Product-edit snapshot effect ────────────────────────────────────────────
  useEffect(() => {
    if (!sessionState.sessionActive || !sessionState.consentRead) return;
    scheduleSnapshot();
  }, [product, sessionState.sessionActive, sessionState.consentRead, scheduleSnapshot]);

  // ── Op listener handlers ────────────────────────────────────────────────────
  const makeOpHandlers = useCallback((sessionId: string) => {
    const onNext = (snapshot: QuerySnapshot<DocumentData>) => {
      opRetryCountRef.current = 0; // successful delivery resets the error streak
      const candidates: AiOpDoc[] = snapshot.docChanges()
        .filter(c => c.type === 'added')
        .map(c => ({
          seq: c.doc.data().seq as number,
          op: c.doc.data().op as string,
          payload: c.doc.data().payload as unknown,
        }))
        .sort((a, b) => a.seq - b.seq);
      if (!candidates.length) return;
      // Always advance the high-water mark before the null-product guard.
      // noUncheckedIndexedAccess: candidates.length > 0 confirmed above.
      const lastCandidate = candidates[candidates.length - 1]; // AiOpDoc | undefined
      if (lastCandidate !== undefined && lastCandidate.seq > highestSeenSeqRef.current) {
        highestSeenSeqRef.current = lastCandidate.seq;
      }
      const current = productRef.current;
      if (!current) {
        // Null-product window. Capture the floor once (lastSeq is stable
        // during the window — never advances while product is null).
        if (!inNullWindowRef.current) {
          inNullWindowRef.current = true;
          preNullWindowSeqRef.current = getLastSeq(sessionId);
        }
        return;
      }
      const toProcess = candidates.filter(o => o.seq > getLastSeq(sessionId));
      if (!toProcess.length) return;
      const { safeOps, nextSeq } = computeSafePrefix(current, toProcess);
      if (!safeOps.length) return;
      updateProduct((prev: Product) => safeOps.reduce((acc, opDoc) => {
        try { return applyAiOp(acc, opDoc.op, opDoc.payload); }
        catch { return acc; }
      }, prev));
      setLastSeq(sessionId, nextSeq);
      scheduleSnapshot();
    };
    const onError = (err: FirestoreError) => {
      console.error('[AI] Op listener error:', err);
      setSessionState(prev => ({ ...prev, sessionActive: false }));
      opRetryCountRef.current++;
      if (opRetryCountRef.current >= 3) {
        console.warn('[AI] Op listener: 3 consecutive errors; giving up. Disconnect + reconnect to resume.');
        localTeardown();
        return;
      }
      retryTimerOpsRef.current = setTimeout(() => {
        retryTimerOpsRef.current = null;
        if (activeSessionIdRef.current !== sessionId || !db) return;
        resubscribeOpsRef.current?.(sessionId);
        setSessionState(prev => ({ ...prev, sessionActive: true }));
      }, 5_000);
    };
    return { onNext, onError };
  }, [updateProduct, scheduleSnapshot, localTeardown]);

  // ── Session doc listener handlers ───────────────────────────────────────────
  const makeSessionHandlers = useCallback((sessionId: string) => {
    const onNext = (snap: DocumentSnapshot) => {
      if (!snap.exists()) {
        localTeardown();
        setSessionState({ sessionActive: false, aiConnected: false, consentRead: false, sessionId: null });
        return;
      }
      sessionRetryCountRef.current = 0;
      const d = snap.data()!;
      const aiLastSeen = (d.aiLastSeenAt as { toDate?: () => Date } | null)?.toDate?.();
      const aiConnected = !!aiLastSeen && (Date.now() - aiLastSeen.getTime()) < 90_000;
      setSessionState(prev => ({ ...prev, aiConnected }));
    };
    const onError = (err: FirestoreError) => {
      console.error('[AI] Session listener error:', err);
      setSessionState(prev => ({ ...prev, sessionActive: false }));
      sessionRetryCountRef.current++;
      if (sessionRetryCountRef.current >= 3) {
        console.warn('[AI] Session listener: 3 consecutive errors; giving up.');
        localTeardown();
        return;
      }
      retryTimerSessionRef.current = setTimeout(() => {
        retryTimerSessionRef.current = null;
        if (activeSessionIdRef.current !== sessionId || !db) return;
        resubscribeSessionRef.current?.(sessionId);
        setSessionState(prev => ({ ...prev, sessionActive: true }));
      }, 5_000);
    };
    return { onNext, onError };
  }, [localTeardown]);

  // ── Two attach helpers (the only paths that create listeners) ────────────────
  const resubscribeOps = useCallback((sessionId: string) => {
    if (!db) return;
    opsUnsubRef.current?.();
    const { onNext, onError } = makeOpHandlers(sessionId);
    opsUnsubRef.current = onSnapshot(buildOpsQuery(sessionId, getLastSeq(sessionId)), onNext, onError);
  }, [makeOpHandlers]);

  const resubscribeSession = useCallback((sessionId: string) => {
    if (!db) return;
    sessionUnsubRef.current?.();
    const { onNext, onError } = makeSessionHandlers(sessionId);
    sessionUnsubRef.current = onSnapshot(doc(db, SESSIONS_COL, sessionId), onNext, onError);
  }, [makeSessionHandlers]);

  useEffect(() => { resubscribeOpsRef.current = resubscribeOps; }, [resubscribeOps]);
  useEffect(() => { resubscribeSessionRef.current = resubscribeSession; }, [resubscribeSession]);

  // ── Re-subscribe ops listener on product change (D5: null-window drain) ───
  useEffect(() => {
    const sessionId = activeSessionIdRef.current;
    // Guard: product and session must exist.
    // !opsUnsubRef.current is intentionally absent. Two reasons:
    //   1. The drain branch sets opsUnsubRef.current = null before going async;
    //      if this effect re-fires during the drain, it must still reach
    //      resubscribeOps to re-establish the listener.
    //   2. The !sessionId guard covers the "no active session" case
    //      (activeSessionIdRef.current is null when no session is live).
    if (!productRef.current || !sessionId) return;
    const wasInNullWindow = inNullWindowRef.current;
    const nullFloor = preNullWindowSeqRef.current;
    const drainCeiling = highestSeenSeqRef.current;
    inNullWindowRef.current = false;
    preNullWindowSeqRef.current = 0;
    if (wasInNullWindow && drainCeiling > nullFloor && db) {
      // Detach old listener BEFORE getDocs. Ops arriving during the async
      // window are persisted; post-drain resubscription picks them up from
      // the correct cursor.
      opsUnsubRef.current?.();
      opsUnsubRef.current = null;
      let completed = false;
      let cancelled = false;
      // timedOut: set when the fallback fires first. Signals the later
      // getDocs .then to skip re-draining (the timeout already resubscribed
      // and the new listener will deliver null-window ops normally from
      // getLastSeq = nullFloor). Without this flag, a slow-but-settling
      // getDocs would re-apply the drain range a second time and double-log
      // 'update' changelog entries.
      let timedOut = false;
      // Fallback: if getDocs never settles (network partition), re-establish
      // the listener within 5 s rather than leaving the session deaf.
      // Session guard: prevents zombie listener if stopSession fires mid-drain
      // (localTeardown nulls activeSessionIdRef; check prevents resubscribing
      // into a torn-down session).
      const drainTimerId = setTimeout(() => {
        if (!completed && !cancelled && activeSessionIdRef.current === sessionId && db) {
          timedOut = true;
          resubscribeOps(sessionId);
        }
      }, 5000);
      const drainQuery = query(
        collection(db, SESSIONS_COL, sessionId, 'ops'),
        where('seq', '>', nullFloor),
        where('seq', '<=', drainCeiling),
        orderBy('seq', 'asc'),
      );
      getDocs(drainQuery).then(snap => {
        clearTimeout(drainTimerId);
        completed = true;
        // cancelled: effect cleanup fired (deps changed).
        // timedOut: fallback already resubscribed; new listener delivers ops.
        // Either way: skip the drain apply to avoid double-application.
        if (cancelled || timedOut) return;
        // Session guard: stopSession may have fired during getDocs.
        if (activeSessionIdRef.current !== sessionId || !db) return;
        const drainOps: AiOpDoc[] = snap.docs
          .map(d => ({
            seq: d.data().seq as number,
            op: d.data().op as string,
            payload: d.data().payload as unknown,
          }))
          .sort((a, b) => a.seq - b.seq);
        if (drainOps.length && productRef.current) {
          // nextSeq is product-state-independent for Phase-1 vocabulary (see
          // applyDrainOps JSDoc). Safe to compute against productRef.current
          // as a proxy for the functional update's seq value.
          const { nextSeq } = applyDrainOps(productRef.current, drainOps);
          updateProduct(prev => applyDrainOps(prev, drainOps).product);
          if (nextSeq > getLastSeq(sessionId)) {
            setLastSeq(sessionId, nextSeq);
          }
        }
        resubscribeOps(sessionId);
      }).catch(() => {
        clearTimeout(drainTimerId);
        completed = true;
        if (!cancelled && !timedOut && activeSessionIdRef.current === sessionId && db) {
          resubscribeOps(sessionId);
        }
      });
      return () => {
        cancelled = true;
        clearTimeout(drainTimerId);
      };
    }
    resubscribeOps(sessionId);
  }, [product?.id, resubscribeOps, updateProduct]);

  // ── Heartbeat ────────────────────────────────────────────────────────────────
  const startHeartbeat = useCallback((sessionId: string) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    const fire = async () => {
      if (!db || activeSessionIdRef.current !== sessionId) return;
      try {
        await updateDoc(doc(db, SESSIONS_COL, sessionId), {
          browserConnectedAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          openProductId: productRef.current?.id ?? null,
        });
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === 'not-found' || code === 'permission-denied') {
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
          setSessionState(prev => ({ ...prev, sessionActive: false }));
        }
        console.error('[AI] Heartbeat error:', err);
      }
    };
    fire();
    heartbeatRef.current = setInterval(fire, 30_000);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && activeSessionIdRef.current && db) {
        updateDoc(doc(db, SESSIONS_COL, activeSessionIdRef.current), {
          browserConnectedAt: serverTimestamp(), openProductId: productRef.current?.id ?? null,
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (!db || !activeSessionIdRef.current || !product?.id) return;
    updateDoc(doc(db, SESSIONS_COL, activeSessionIdRef.current), {
      openProductId: product.id, lastActiveAt: serverTimestamp(),
    }).catch(() => {});
  }, [product?.id]);

  // ── Teardown (with server-side cleanup) ──────────────────────────────────────
  const teardown = useCallback(async (sessionId: string) => {
    localTeardown();
    if (db) {
      deleteDoc(doc(db, SESSIONS_COL, sessionId, 'snapshot', 'current')).catch(() => {});
    }
    if (functionsInstance) {
      httpsCallable(functionsInstance, 'teardownAiSession')({ sessionId })
        .catch(err => console.error('[AI] Teardown callable failed — data TTL-expires in 7 days:', err));
    }
  }, [localTeardown]);

  // ── Start session ────────────────────────────────────────────────────────────
  const startSession = useCallback(async (consentRead: boolean): Promise<boolean> => {
    if (!db || !isFirebaseAvailable || !product) return false;
    if (startSessionInFlightRef.current) return false;
    startSessionInFlightRef.current = true;
    try {
      const storedId = localStorage.getItem(AI_SESSION_ID_KEY);
      const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      let sessionId: string;
      let prevConsentRead: boolean | null = null;
      if (storedId) {
        let snap: Awaited<ReturnType<typeof getDoc>>;
        try { snap = await getDoc(doc(db, SESSIONS_COL, storedId)); }
        catch (err) { console.error('[AI] Session check failed:', err); return false; }
        if (snap.exists()) {
          const d = snap.data() as { expiresAt?: { toDate?: () => Date }; consentRead?: boolean } | undefined;
          const storedExp = d?.expiresAt?.toDate?.();
          if (!storedExp || storedExp >= new Date()) {
            sessionId = storedId;
            prevConsentRead = d?.consentRead ?? false;
          } else {
            clearLastSeq(storedId);
            sessionId = crypto.randomUUID();
          }
        } else {
          clearLastSeq(storedId);
          sessionId = crypto.randomUUID();
        }
      } else {
        sessionId = crypto.randomUUID();
      }
      // Write consent BEFORE the updateDoc so the intent is recorded locally.
      // On consent-downgrade abort below, we REVERT this write.
      localStorage.setItem(AI_SESSION_ID_KEY, sessionId);
      localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({
        version: AI_CONSENT_VERSION, date: new Date().toISOString(), write: true, read: consentRead,
      }));
      activeSessionIdRef.current = sessionId;
      const sessionRef = doc(db, SESSIONS_COL, sessionId);
      // ── Resume path ──────────────────────────────────────────────────────
      if (prevConsentRead !== null) {
        try {
          await updateDoc(sessionRef, {
            consentRead, openProductId: product.id,
            lastActiveAt: serverTimestamp(), browserConnectedAt: serverTimestamp(), expiresAt: exp,
          });
          if (prevConsentRead && !consentRead) {
            deleteDoc(doc(db, SESSIONS_COL, sessionId, 'snapshot', 'current')).catch(() => {});
          }
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code;
          if (code === 'not-found' || code === 'permission-denied') {
            clearLastSeq(sessionId);
            sessionId = crypto.randomUUID();
            localStorage.setItem(AI_SESSION_ID_KEY, sessionId);
            localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({
              version: AI_CONSENT_VERSION, date: new Date().toISOString(), write: true, read: consentRead,
            }));
            activeSessionIdRef.current = sessionId;
            prevConsentRead = null;
          } else if (prevConsentRead && !consentRead) {
            // Privilege downgrade (Read → off) failed transiently. Revert
            // localStorage to the server's actual state (still consentRead:true).
            localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({
              version: AI_CONSENT_VERSION, date: new Date().toISOString(), write: true, read: true,
            }));
            if (db) {
              deleteDoc(doc(db, SESSIONS_COL, sessionId, 'snapshot', 'current')).catch(() => {});
            }
            console.error('[AI] Consent downgrade write failed; aborting resume:', err);
            activeSessionIdRef.current = null;
            return false;
          } else {
            console.error('[AI] Resume reconciliation failed; proceeding:', err);
          }
        }
      }
      // ── Fresh-create path ────────────────────────────────────────────────
      if (prevConsentRead === null) {
        setLastSeq(sessionId, 0);
        // Reset D5 refs so a fresh session starts with no null-window state.
        highestSeenSeqRef.current = 0;
        inNullWindowRef.current = false;
        preNullWindowSeqRef.current = 0;
        const freshRef = doc(db, SESSIONS_COL, sessionId);
        try {
          await setDoc(freshRef, {
            createdAt: serverTimestamp(), lastActiveAt: serverTimestamp(), expiresAt: exp,
            browserConnectedAt: serverTimestamp(), openProductId: product.id,
            consentWrite: true, consentRead, lastSeq: 0, appVersion: APP_VERSION,
            appId: 'storymap',
            // aiLastSeenAt intentionally OMITTED: MCP-server-owned. Including
            // it fails the Firestore create rule's hasOnly check.
          });
        } catch (err) {
          console.error('[AI] Session creation failed:', err);
          activeSessionIdRef.current = null;
          return false;
        }
      }
      resubscribeOps(sessionId);
      resubscribeSession(sessionId);
      startHeartbeat(sessionId);
      setSessionState({ sessionActive: true, aiConnected: false, consentRead, sessionId });
      if (consentRead) scheduleSnapshot();
      return true;
    } finally {
      startSessionInFlightRef.current = false;
    }
  }, [product, resubscribeOps, resubscribeSession, startHeartbeat, scheduleSnapshot]);

  // ── Stop session ─────────────────────────────────────────────────────────────
  const stopSession = useCallback(async () => {
    const sessionId = activeSessionIdRef.current ?? localStorage.getItem(AI_SESSION_ID_KEY);
    if (sessionId) {
      clearLastSeq(sessionId);
      await teardown(sessionId);
    }
    localStorage.removeItem(AI_SESSION_ID_KEY);
    localStorage.removeItem(AI_CONSENT_KEY);
    setSessionState({ sessionActive: false, aiConnected: false, consentRead: false, sessionId: null });
  }, [teardown]);

  // ── Change permissions ───────────────────────────────────────────────────────
  const changePermissions = useCallback(async (consentRead: boolean): Promise<boolean> => {
    if (!db || !activeSessionIdRef.current) return false;
    try {
      await updateDoc(doc(db, SESSIONS_COL, activeSessionIdRef.current), {
        consentRead, lastActiveAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[AI] Failed to update consentRead:', err);
      return false;
    }
    const prev = safeParseConsent(localStorage.getItem(AI_CONSENT_KEY)) ?? {};
    localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({ ...prev, read: consentRead }));
    setSessionState(s => ({ ...s, consentRead }));
    if (consentRead) {
      scheduleSnapshot();
    } else {
      if (snapshotTimerRef.current) { clearTimeout(snapshotTimerRef.current); snapshotTimerRef.current = null; }
      if (activeSessionIdRef.current) {
        deleteDoc(doc(db, SESSIONS_COL, activeSessionIdRef.current, 'snapshot', 'current')).catch(() => {});
      }
    }
    return true;
  }, [scheduleSnapshot]);

  useEffect(() => { return () => localTeardown(); }, [localTeardown]);

  return { sessionState, startSession, stopSession, changePermissions };
}
