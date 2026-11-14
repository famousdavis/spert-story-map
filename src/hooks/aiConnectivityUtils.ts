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

// ── B15: a session belongs to the product it was started in ─────────────────

/** What startSession needs from a session doc. `exists: false` = no such doc. */
export interface SessionDocView {
  exists: boolean;
  expiresAt: Date | null;
  openProductId: unknown;
  lastSeq: number;
  browserConnectedAt: Date | null;
  consentRead: boolean;
}

/** A doc that exists and is not past `expiresAt` (no `expiresAt` counts as live, as before). */
export function isSessionDocLive(doc: SessionDocView | null, now: Date): boolean {
  return !!doc && doc.exists && (!doc.expiresAt || doc.expiresAt >= now);
}

/**
 * R-2: resume only a session recorded for the open product whose doc is live and
 * still names the open product. A legacy session has no record, so it never resumes.
 */
export function canResumeSession(
  hasRecord: boolean, doc: SessionDocView | null, openProductId: string, now: Date,
): boolean {
  return hasRecord && isSessionDocLive(doc, now) && doc?.openProductId === openProductId;
}

/**
 * R-6/R-7/R-8: the one check every apply path and writer uses. A batch, a
 * snapshot or an `openProductId` write goes ahead only for the bound product.
 */
export function isBoundProduct(boundId: string | null, productId: string | null | undefined): boolean {
  return !!boundId && productId === boundId;
}

/** Landing's `isBrowserConnected` window (session.ts:69-72). */
export const BROWSER_CONNECTED_MS = 90_000;

/**
 * R-3: another tab is using the session. `lockHeld` is null where Web Locks are
 * missing; then, and for a legacy session (a v0.55.10 tab holds no lock), a
 * `browserConnectedAt` under 90 s old counts. Never `lastActiveAt`: the AI writes it.
 */
export function isSessionInUse(
  lockHeld: boolean | null, legacy: boolean, browserConnectedAt: Date | null, now: Date,
): boolean {
  const fresh = !!browserConnectedAt && now.getTime() - browserConnectedAt.getTime() < BROWSER_CONNECTED_MS;
  if (lockHeld === null) return fresh;
  return lockHeld || (legacy && fresh);
}

/** R-4: the AI sent changes this browser has not applied. */
export function changesWaiting(docLastSeq: number, cursor: number): boolean {
  return docLastSeq > cursor;
}

/** Another session found when a new one starts, judged before anything is ended. */
export interface OtherSession {
  sessionId: string;
  /** null for a legacy session (no product recorded). */
  productId: string | null;
  productName: string;
  startedAt: number;
  /** The doc could not be read: not ended, entry kept, no line. */
  readFailed: boolean;
  /** The doc exists and is not expired. */
  live: boolean;
  inUse: boolean;
  waiting: boolean;
}

/** R-4: the one line the panel shows when a new session started, or null. */
export function buildSwitchNotice(
  others: OtherSession[], openProductId: string, openProductName: string,
): string | null {
  const shown = others.filter(o => !o.readFailed && o.live);
  const named = shown
    .filter(o => o.productId !== null && o.productId !== openProductId)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  const neutral = (o: OtherSession) =>
    'Your earlier Connect AI session can’t be continued here, so this is a new session. Give your AI the new code.'
    + (!o.inUse && o.waiting ? ' Changes your AI sent in that session were not applied.' : '');
  if (named) {
    if (named.productName === openProductName) return neutral(named);
    if (named.inUse) {
      return `Your Connect AI session for “${named.productName}” is still open in another tab, so this is a new `
        + `session for “${openProductName}”. Give your AI the new code.`;
    }
    return `Your earlier Connect AI session was for “${named.productName}”, so this is a new session for `
      + `“${openProductName}”. Give your AI the new code and tell it you are now in “${openProductName}”.`
      + (named.waiting ? ` Changes your AI sent for “${named.productName}” were not applied.` : '');
  }
  const legacy = shown.find(o => o.productId === null);
  return legacy ? neutral(legacy) : null;
}
