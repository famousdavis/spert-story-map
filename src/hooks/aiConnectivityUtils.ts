// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { collection, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AI_LAST_SEQ_PREFIX } from '../lib/aiConstants';
import { SESSIONS_COL } from '../lib/firestoreCollections';

/**
 * Pure module-level helpers for the AI connectivity hook (useAiConnectivity).
 * Extracted so the localStorage seq cursor and consent-parse logic can be
 * unit-tested without mounting the hook. The hook body composes these.
 */

/** Read the last-applied op seq cursor for a session (NaN-guarded → 0). */
export function getLastSeq(sessionId: string): number {
  const n = parseInt(localStorage.getItem(AI_LAST_SEQ_PREFIX + sessionId) ?? '0', 10);
  return Number.isFinite(n) ? n : 0;
}
export function setLastSeq(sessionId: string, seq: number): void {
  localStorage.setItem(AI_LAST_SEQ_PREFIX + sessionId, String(seq));
}
export function clearLastSeq(sessionId: string): void {
  localStorage.removeItem(AI_LAST_SEQ_PREFIX + sessionId);
}

/**
 * Safe JSON parse for the AI consent localStorage value. Used in
 * changePermissions only. writeSnapshot reads consentReadRef (not
 * localStorage). ProductLayout.tsx inlines its own safe-parse IIFE.
 */
export function safeParseConsent(raw: string | null): { version?: number; read?: boolean; write?: boolean } | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as { version?: number; read?: boolean; write?: boolean }; }
  catch { return null; }
}

/** Build the ordered ops subscription query for seq > afterSeq. */
export function buildOpsQuery(sessionId: string, afterSeq: number) {
  return query(
    collection(db!, SESSIONS_COL, sessionId, 'ops'),
    where('seq', '>', afterSeq),
    orderBy('seq', 'asc'),
  );
}
