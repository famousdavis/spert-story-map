// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The fold (v0.56.1, R71 R-3, O44, O45): products a signed-in person kept in Local mode before this
 * version live in `rp:{uid}`, which was their only copy. At sign-in, after the Terms check and before
 * the driver is created, they move into `rp:local`, the one product store.
 *
 * Per product, in this order: write it to `rp:local` (unless an identical copy is there), write its
 * `rp:local` index entry (every branch; a failure stops the fold), remove the source key, remove the
 * source index entry. So an interrupted fold re-runs to the same result, and a product is never
 * removed from `rp:{uid}` before `rp:local` lists it.
 *
 * An id `rp:local` already holds: byte-identical means it was already moved; ANY difference keeps
 * both (O45: no "ancestor" rule, so no edit is lost), the moved one under a fresh id and a
 * `cloneName` name, its `_originRef`, `createdAt` and `_changeLog` unchanged. The person's tile order,
 * colour and archive follow the fresh id, and a Connect AI record keyed by the old id is ended.
 *
 * It never throws: a product it cannot read is skipped and left; the first failed write stops it.
 * It runs under an exclusive lock, so two tabs never fold at once.
 */
import { cloneName } from './cloneName';
import { flushPendingSaves, PRODUCT_NS } from './storage';
import { readSessionRecord, removeSessionRecord } from './aiSessionRecords';
import { endSessionInBackground } from './aiSessionTeardown';

export interface FoldOutcome {
  /** Products that left `rp:{uid}` (copies included). */
  moved: number;
  /** Of those, how many differed from a product `rp:local` already held, and were kept as copies. */
  copies: number;
  /** Products that could not be read, left in `rp:{uid}`. */
  unreadable: number;
  /** A write failed (a full store): the rest are left in `rp:{uid}`. */
  stopped: boolean;
}

interface IndexEntry { id: string; name: string; updatedAt?: string }
interface Moved { from: string; to: string }

const LOCK_NAME = 'spert-storymap:local-fold';
const FALLBACK_LOCK_KEY = '_rp:local-fold-in-progress';
const LOCK_TIMEOUT_MS = 30_000;

const productKey = (ns: string, id: string) => `rp:${ns}:product_${id}`;
const indexKey = (ns: string) => `rp:${ns}:products_index`;
const none = (): FoldOutcome => ({ moved: 0, copies: 0, unreadable: 0, stopped: false });

function readIndex(ns: string): IndexEntry[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(indexKey(ns)) ?? '[]');
    return Array.isArray(v) ? v.filter((e): e is IndexEntry => !!e && typeof e === 'object' && typeof (e as IndexEntry).id === 'string') : [];
  } catch {
    return [];
  }
}

/** Every `rp:{uid}:product_*` key's id: those the index lists first, in its order, then the rest. */
function sourceIds(uid: string): string[] {
  const prefix = productKey(uid, '');
  const found: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) found.push(k.slice(prefix.length));
  }
  const listed = readIndex(uid).map(e => e.id).filter(id => found.includes(id));
  return [...new Set([...listed, ...found])];
}

function parseProduct(raw: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const textOf = (v: unknown) => (typeof v === 'string' ? v : '');

/** Add or replace this product's entry in the `rp:local` index. Throws if the write fails. */
function listInLocal(entry: IndexEntry): void {
  const index = readIndex(PRODUCT_NS);
  const at = index.findIndex(e => e.id === entry.id);
  if (at >= 0) index[at] = entry; else index.push(entry);
  localStorage.setItem(indexKey(PRODUCT_NS), JSON.stringify(index));
}

function dropSourceEntry(uid: string, id: string): void {
  const rest = readIndex(uid).filter(e => e.id !== id);
  if (rest.length === 0) localStorage.removeItem(indexKey(uid));
  else localStorage.setItem(indexKey(uid), JSON.stringify(rest));
}

/** The moved product under a fresh id, written and listed; its key is removed again if listing fails. */
function keepAsCopy(product: Record<string, unknown>): IndexEntry {
  const to = crypto.randomUUID();
  const name = cloneName(textOf(product.name), readIndex(PRODUCT_NS).map(e => textOf(e.name)));
  localStorage.setItem(productKey(PRODUCT_NS, to), JSON.stringify({ ...product, id: to, name }));
  const entry = { id: to, name, updatedAt: textOf(product.updatedAt) };
  try {
    listInLocal(entry);
  } catch (e) {
    localStorage.removeItem(productKey(PRODUCT_NS, to));
    throw e;
  }
  return entry;
}

/** Move one product. Returns what happened; throws only when a write fails. */
function foldOne(uid: string, id: string, copies: Moved[]): 'moved' | 'copied' | 'unreadable' | 'gone' {
  const raw = localStorage.getItem(productKey(uid, id));
  if (raw === null) return 'gone';
  const product = parseProduct(raw);
  if (!product) return 'unreadable';
  const here = localStorage.getItem(productKey(PRODUCT_NS, id));
  let result: 'moved' | 'copied' = 'moved';
  if (here === null || here === raw) {
    if (here === null) localStorage.setItem(productKey(PRODUCT_NS, id), raw);
    listInLocal({ id, name: textOf(product.name), updatedAt: textOf(product.updatedAt) });
  } else {
    copies.push({ from: id, to: keepAsCopy(product).id });
    result = 'copied';
  }
  localStorage.removeItem(productKey(uid, id));
  dropSourceEntry(uid, id);
  return result;
}

/** The person's tile order, colour and archive follow each copy to its fresh id: a direct, synchronous write. */
function followPrefs(uid: string, copies: Moved[]): void {
  const key = `rp:${uid}:preferences`;
  const prefs = parseProduct(localStorage.getItem(key) ?? 'null');
  if (!prefs) return;
  const to = new Map(copies.map(c => [c.from, c.to]));
  if (Array.isArray(prefs.projectOrder)) prefs.projectOrder = prefs.projectOrder.map(id => to.get(id) ?? id);
  const map = prefs.projectPrefs;
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    const entries = map as Record<string, unknown>;
    for (const { from, to: fresh } of copies) {
      if (!Object.prototype.hasOwnProperty.call(entries, from)) continue;
      entries[fresh] = entries[from];
      delete entries[from];
    }
  }
  localStorage.setItem(key, JSON.stringify(prefs));
}

/** A Connect AI record keyed by an old id is ended, not moved, as sign-out ends one. */
function endAiRecords(copies: Moved[]): void {
  for (const { from } of copies) {
    const record = readSessionRecord(from);
    if (!record) continue;
    removeSessionRecord(from, record.sessionId);
    void endSessionInBackground(record.sessionId);
  }
}

/** The fold itself, synchronous; call it under the lock (`foldLocalStore`). Never throws. */
export function foldOwnProducts(uid: string): FoldOutcome {
  const out = none();
  if (!uid || uid === PRODUCT_NS) return out;
  const copies: Moved[] = [];
  try {
    const ids = sourceIds(uid);
    if (ids.length === 0) return out;
    // First: a debounced index write captured before the fold must not land after it. Only when
    // there is something to move, so a driver swap with nothing to fold still cancels (v0.55.14).
    flushPendingSaves();
    for (const id of ids) {
      const step = foldOne(uid, id, copies);
      if (step === 'unreadable') out.unreadable++;
      if (step === 'moved' || step === 'copied') out.moved++;
      if (step === 'copied') out.copies++;
    }
  } catch {
    out.stopped = true;
  }
  if (copies.length > 0) {
    try { followPrefs(uid, copies); } catch { out.stopped = true; }
    endAiRecords(copies);
  }
  return out;
}

interface LocksLike { request: (name: string, cb: () => unknown) => Promise<unknown> }

function readFallbackLock(): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(FALLBACK_LOCK_KEY) ?? 'null') as { ts?: unknown } | null;
    return typeof v?.ts === 'number' ? v.ts : null;
  } catch {
    return null;
  }
}

/** Without navigator.locks: wait while another tab's lock is fresh (as `migrateLegacyKeys` does). */
async function withFallbackLock(run: () => FoldOutcome): Promise<FoldOutcome> {
  while (true) {
    const ts = readFallbackLock();
    if (ts === null || Date.now() - ts >= LOCK_TIMEOUT_MS) break;
    await new Promise(r => setTimeout(r, 200));
  }
  try { localStorage.setItem(FALLBACK_LOCK_KEY, JSON.stringify({ ts: Date.now() })); } catch { /* full: fold anyway */ }
  try {
    return run();
  } finally {
    try { localStorage.removeItem(FALLBACK_LOCK_KEY); } catch { /* nothing to do */ }
  }
}

/** The fold under an exclusive lock across tabs. Never throws. */
export async function foldLocalStore(uid: string): Promise<FoldOutcome> {
  if (!uid || uid === PRODUCT_NS) return none();
  const locks = (typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LocksLike }).locks : undefined);
  try {
    if (locks && typeof locks.request === 'function') {
      let out = none();
      await locks.request(LOCK_NAME, () => { out = foldOwnProducts(uid); });
      return out;
    }
    return await withFallbackLock(() => foldOwnProducts(uid));
  } catch {
    return foldOwnProducts(uid);
  }
}
