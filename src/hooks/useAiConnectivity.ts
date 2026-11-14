// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  collection, doc, query, orderBy, where,
  onSnapshot, updateDoc, setDoc, deleteDoc,
  serverTimestamp, getDocs,
} from 'firebase/firestore';
import type { QuerySnapshot, DocumentData, DocumentSnapshot, FirestoreError, Firestore } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsInstance, isFirebaseAvailable } from '../lib/firebase';
import type { Product, ProductUpdater } from '../types';
import { applyAiOp, applyDrainOps, computeSafePrefix, type AiOpDoc } from '../lib/aiOps';
import { selectSnapshotForWrite } from '../lib/aiSnapshot';
import { AI_CONSENT_KEY, AI_CONSENT_VERSION } from '../lib/aiConstants';
import { SESSIONS_COL } from '../lib/firestoreCollections';
import {
  getLastSeq, setLastSeq, clearLastSeq, safeParseConsent, buildOpsQuery,
  isBoundProduct, buildSwitchNotice, type SessionDocView,
} from './aiConnectivityUtils';
import {
  readSessionRecord, writeSessionRecord, removeSessionRecord, anySessionRecorded, listRecordedSessions,
} from '../lib/aiSessionRecords';
import { holdSessionLock, queryLockedNames } from './aiSessionLock';
import {
  readSessionDoc, readOtherSessions, judgeOtherSessions, endOtherSessions,
} from './aiSessionSwitch';
import { classifyOwnRecord, resumeSessionDoc, createSessionDoc, type StartPlan } from './aiSessionStart';

/** Firestore doc limit is 1 MB; 900 KB leaves headroom for metadata. */
const SNAPSHOT_BYTE_LIMIT = 900_000;

// ── Public types ────────────────────────────────────────────────────────────
export interface AiSessionState {
  sessionActive: boolean;
  aiConnected: boolean;
  consentRead: boolean;
  sessionId: string | null;
  /**
   * B15: the product `sessionId` belongs to (null with no session). The layout
   * opens the Connect AI panel only while this is the open product.
   */
  boundProductId: string | null;
  /** B15 R-4: the line naming an earlier session, shown until the panel closes or the session ends. */
  notice: string | null;
}
export interface UseAiConnectivityResult {
  sessionState: AiSessionState;
  startSession: (consentRead: boolean) => Promise<boolean>;
  stopSession: () => Promise<void>;
  changePermissions: (consentRead: boolean) => Promise<boolean>;
  dismissNotice: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function useAiConnectivity(
  product: Product | null,
  updateProduct: (updater: ProductUpdater) => void,
): UseAiConnectivityResult {
  const [sessionState, setSessionState] = useState<AiSessionState>({
    sessionActive: false, aiConnected: false, consentRead: false, sessionId: null, boundProductId: null, notice: null,
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
  // B15: the product the live session belongs to (set at go-live, cleared in
  // localTeardown), and the release for this tab's Web Lock on the session.
  const boundIdRef = useRef<string | null>(null);
  const releaseLockRef = useRef<(() => void) | null>(null);

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
    boundIdRef.current = null;
    releaseLockRef.current?.(); releaseLockRef.current = null;
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
    // B15 R-8: only the bound product's structure goes into its session.
    if (!isBoundProduct(boundIdRef.current, p.id)) return;
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
      // B15 R-7: a batch applies only to the bound product, checked here and again
      // inside the updater on the state actually being changed. The cursor moves
      // inside the updater, and only when it applies the batch: the updater runs
      // when React renders, so a cursor moved out here would skip a batch the
      // updater then rejects, losing it for both products.
      const bound = boundIdRef.current;
      if (!isBoundProduct(bound, current.id)) return;
      const toProcess = candidates.filter(o => o.seq > getLastSeq(sessionId));
      if (!toProcess.length) return;
      const { safeOps, nextSeq } = computeSafePrefix(current, toProcess);
      if (!safeOps.length) return;
      updateProduct((prev: Product) => {
        if (!isBoundProduct(bound, prev.id)) return prev;
        setLastSeq(sessionId, nextSeq);
        return safeOps.reduce((acc, opDoc) => {
          try { return applyAiOp(acc, opDoc.op, opDoc.payload); }
          catch { return acc; }
        }, prev);
      });
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
        const bound = boundIdRef.current;
        localTeardown();
        if (bound) removeSessionRecord(bound, sessionId);
        setSessionState({
          sessionActive: false, aiConnected: false, consentRead: false, sessionId: null, boundProductId: null, notice: null,
        });
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

  // ── B15 R-5: a product change under a live session ─────────────────────────
  // A non-null id other than the bound one disconnects locally, as leaving the
  // product pages does; the server session, its queue and its record stay with
  // the bound product. A → null (a storage swap) is NOT a change: the D5 drain
  // below must still apply the null window's ops when the bound product returns.
  // Declared before the D5 effect so that effect then sees no live session.
  useEffect(() => {
    const id = product?.id;
    if (!id || !activeSessionIdRef.current || !boundIdRef.current || id === boundIdRef.current) return;
    localTeardown();
    setSessionState(prev => ({
      ...prev, sessionActive: false, aiConnected: false, sessionId: null, boundProductId: null, notice: null,
    }));
  }, [product?.id, localTeardown]);

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
        const bound = boundIdRef.current;
        if (drainOps.length && productRef.current && isBoundProduct(bound, productRef.current.id)) {
          // nextSeq is product-state-independent for Phase-1 vocabulary (see
          // applyDrainOps JSDoc). Safe to compute against productRef.current
          // as a proxy for the functional update's seq value.
          const { nextSeq } = applyDrainOps(productRef.current, drainOps);
          // B15 R-7: as in the listener, check again on the state being changed
          // and move the cursor only when the drain applies.
          updateProduct(prev => {
            if (!isBoundProduct(bound, prev.id)) return prev;
            if (nextSeq > getLastSeq(sessionId)) setLastSeq(sessionId, nextSeq);
            return applyDrainOps(prev, drainOps).product;
          });
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
          openProductId: boundIdRef.current, // B15 R-6: the bound product, never the open one
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
          browserConnectedAt: serverTimestamp(), openProductId: boundIdRef.current, // B15 R-6
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // B15: keep the bound product's recorded name current while its session is live.
  useEffect(() => {
    const bound = boundIdRef.current;
    const sessionId = activeSessionIdRef.current;
    if (!sessionState.sessionActive || !bound || !sessionId || !product || product.id !== bound) return;
    const rec = readSessionRecord(bound);
    if (rec && rec.sessionId === sessionId && rec.productName !== product.name) {
      writeSessionRecord(bound, { ...rec, productName: product.name });
    }
  }, [product, sessionState.sessionActive]);

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

  // ── Go live ──────────────────────────────────────────────────────────────────
  // `lock` is the lock taken when the new session's record was written (null on
  // a resume); `others` is what S3 and S5 read (null on a resume).
  const goLive = useCallback((
    sessionId: string, openId: string, openName: string, consentRead: boolean, lock: (() => void) | null,
    others: { read: Awaited<ReturnType<typeof readOtherSessions>>; lockedNames: Set<string> | null } | null,
  ) => {
    activeSessionIdRef.current = sessionId;
    boundIdRef.current = openId;
    releaseLockRef.current?.();
    releaseLockRef.current = lock ?? holdSessionLock(sessionId);
    const rec = readSessionRecord(openId);
    if (rec?.sessionId === sessionId && rec.productName !== openName) writeSessionRecord(openId, { ...rec, productName: openName });
    const judged = others ? judgeOtherSessions(others.read, others.lockedNames, new Date()) : [];
    const notice = buildSwitchNotice(judged, openId, openName);
    resubscribeOps(sessionId);
    resubscribeSession(sessionId);
    startHeartbeat(sessionId);
    setSessionState({ sessionActive: true, aiConnected: false, consentRead, sessionId, boundProductId: openId, notice });
    if (consentRead) scheduleSnapshot();
    endOtherSessions(judged);
  }, [resubscribeOps, resubscribeSession, startHeartbeat, scheduleSnapshot]);

  // ── Create (S3, S4) and go live (S5) ─────────────────────────────────────────
  const createAndGoLive = useCallback(async (
    database: Firestore, plan: StartPlan, openId: string, openName: string,
    consentRead: boolean, exp: Date, stillOpen: () => boolean,
  ): Promise<boolean> => {
    const { sessionId } = plan;
    // This tab's Web Lock on a new session, taken when its record is written and
    // released in `finally` unless the session goes live.
    let lockBeforeLive: (() => void) | null = null;
    try {
      const created = plan.prevConsentRead === null;
      let read: Awaited<ReturnType<typeof readOtherSessions>> = [];
      if (created) {
        // R-3: read every other recorded session BEFORE the create: all of them
        // (sign-out uses the same list) except this product's own entry, which
        // is in `replaced` when it is to be ended.
        const others = listRecordedSessions().filter(o => o.productId !== openId);
        if (plan.replaced) others.push(plan.replaced);
        read = await readOtherSessions(database, others);
        if (!stillOpen()) return false;
        setLastSeq(sessionId, 0);
        // Reset D5 refs so a fresh session starts with no null-window state.
        highestSeenSeqRef.current = 0;
        inNullWindowRef.current = false;
        preNullWindowSeqRef.current = 0;
        if (!(await createSessionDoc(database, sessionId, openId, consentRead, exp))) return false;
        writeSessionRecord(openId, { sessionId, productName: openName, startedAt: Date.now() });
        if (!stillOpen()) return false;
        // Review -07: hold the lock from the moment the record names this session,
        // so another tab's R-3 that reads the record while this tab is still
        // querying the locks finds the session in use and does not end it.
        lockBeforeLive = holdSessionLock(sessionId);
      }
      const lockedNames = created && read.length ? await queryLockedNames() : null;
      if (!stillOpen()) return false;
      const lock = lockBeforeLive;
      lockBeforeLive = null;
      goLive(sessionId, openId, openName, consentRead, lock, created ? { read, lockedNames } : null);
      return true;
    } finally {
      lockBeforeLive?.(); // the session did not go live
    }
  }, [goLive]);

  // ── Start session ────────────────────────────────────────────────────────────
  // B15: a session belongs to the product it was started in. Resume only that
  // product's own recorded session (R-2); otherwise create one, and once it goes
  // live end the other recorded sessions no other tab is using (R-3), naming the
  // earlier product in one line (R-4). If the open product changes during any
  // await, nothing goes live (R-9); a doc already created stays recorded.
  const startSession = useCallback(async (consentRead: boolean): Promise<boolean> => {
    const database = db;
    if (!database || !isFirebaseAvailable || !product) return false;
    if (startSessionInFlightRef.current) return false;
    startSessionInFlightRef.current = true;
    const openId = product.id;
    const openName = product.name;
    const stillOpen = () => productRef.current?.id === openId;
    try {
      const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const record = readSessionRecord(openId);
      let plan: StartPlan = { sessionId: crypto.randomUUID(), prevConsentRead: null, replaced: null };
      if (record) {
        let view: SessionDocView;
        try { view = await readSessionDoc(database, record.sessionId); }
        catch (err) { console.error('[AI] Session check failed:', err); return false; }
        plan = classifyOwnRecord(plan, record, view, openId);
        if (!stillOpen()) return false;
      }
      // Write consent BEFORE the updateDoc so the intent is recorded locally.
      // On consent-downgrade abort in resumeSessionDoc, that write is REVERTED.
      localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({
        version: AI_CONSENT_VERSION, date: new Date().toISOString(), write: true, read: consentRead,
      }));
      // ── Resume path ──────────────────────────────────────────────────────
      if (plan.prevConsentRead !== null) {
        const next = await resumeSessionDoc(database, plan, openId, consentRead, exp);
        if (!next) return false;
        plan = next;
        if (!stillOpen()) return false;
      }
      return await createAndGoLive(database, plan, openId, openName, consentRead, exp, stillOpen);
    } finally {
      startSessionInFlightRef.current = false;
    }
  }, [product, createAndGoLive]);

  // ── Stop session (Disconnect) ─────────────────────────────────────────────────
  // B15 R-11: ends this tab's live session only, never a stored one; consent is
  // per browser and is removed only when no session is recorded any more.
  const stopSession = useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    const bound = boundIdRef.current;
    if (sessionId) {
      clearLastSeq(sessionId);
      if (bound) removeSessionRecord(bound, sessionId);
      await teardown(sessionId);
    }
    if (!anySessionRecorded()) localStorage.removeItem(AI_CONSENT_KEY);
    setSessionState({
      sessionActive: false, aiConnected: false, consentRead: false, sessionId: null, boundProductId: null, notice: null,
    });
  }, [teardown]);

  const dismissNotice = useCallback(() => {
    setSessionState(prev => (prev.notice ? { ...prev, notice: null } : prev));
  }, []);

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

  return { sessionState, startSession, stopSession, changePermissions, dismissNotice };
}
