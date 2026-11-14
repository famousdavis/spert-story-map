// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { AI_SESSION_KEY_PREFIX, AI_SESSION_ID_KEY } from './aiConstants';

/**
 * B15: which Connect AI session this browser holds for each product. One
 * localStorage key per product (`spert_ai_session:{productId}`), not one JSON
 * map: tabs share localStorage, and a map is read-modify-write, so two tabs
 * writing at once could lose an entry. Every removal is compare-and-remove: an
 * entry is removed only while it still names the session being ended.
 */
export interface AiSessionRecord {
  sessionId: string;
  productName: string;
  startedAt: number;
}

export interface RecordedSession extends AiSessionRecord {
  productId: string;
}

function parseRecord(raw: string | null): AiSessionRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AiSessionRecord> | null;
    if (!v || typeof v.sessionId !== 'string' || !v.sessionId) return null;
    return {
      sessionId: v.sessionId,
      productName: typeof v.productName === 'string' ? v.productName : '',
      startedAt: typeof v.startedAt === 'number' && Number.isFinite(v.startedAt) ? v.startedAt : 0,
    };
  } catch { return null; }
}

export function readSessionRecord(productId: string): AiSessionRecord | null {
  try { return parseRecord(localStorage.getItem(AI_SESSION_KEY_PREFIX + productId)); }
  catch { return null; }
}

export function writeSessionRecord(productId: string, record: AiSessionRecord): void {
  try { localStorage.setItem(AI_SESSION_KEY_PREFIX + productId, JSON.stringify(record)); }
  catch { /* localStorage unavailable */ }
}

/** Remove the product's entry only if it still names `sessionId`. */
export function removeSessionRecord(productId: string, sessionId: string): void {
  if (readSessionRecord(productId)?.sessionId !== sessionId) return;
  try { localStorage.removeItem(AI_SESSION_KEY_PREFIX + productId); } catch { /* unavailable */ }
}

/** Every product entry in this browser. */
export function listSessionRecords(): RecordedSession[] {
  const out: RecordedSession[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(AI_SESSION_KEY_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      const rec = parseRecord(localStorage.getItem(k));
      if (rec) out.push({ productId: k.slice(AI_SESSION_KEY_PREFIX.length), ...rec });
    }
  } catch { /* localStorage unavailable */ }
  return out;
}

/** The session id stored by a version before B15, if any. */
export function readLegacySessionId(): string | null {
  try { return localStorage.getItem(AI_SESSION_ID_KEY) || null; }
  catch { return null; }
}

export function removeLegacySessionId(sessionId: string): void {
  if (readLegacySessionId() !== sessionId) return;
  try { localStorage.removeItem(AI_SESSION_ID_KEY); } catch { /* unavailable */ }
}

/** True when any session is recorded: a product entry or a legacy session. */
export function anySessionRecorded(): boolean {
  return listSessionRecords().length > 0 || readLegacySessionId() !== null;
}
