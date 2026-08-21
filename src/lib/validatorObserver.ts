// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Observe `validateProduct()` on the persistence read paths (Brief 10).
 *
 * `validateProduct` has exactly one production call site — `importExport.ts:68`,
 * the file-import path. Every persistence read path bypasses it, and the Firestore
 * rules perform zero content validation (the `spertstorymap_projects` update rule
 * is a field-NAME allowlist with no value predicates). This module runs the
 * validator against live persisted state, at four read seams, and REPORTS what it
 * would have done. It changes nothing.
 *
 * ⚠️ THIS RELEASE OBSERVES. IT DOES NOT ENFORCE. The validator is handed a clone,
 * never live state, and every call site invokes `observe` for effect. If a change
 * here can alter what a load path returns, the change is wrong.
 *
 * Registration is via `validatorObserverRegistry` and is gated on a localStorage
 * flag read once at bootstrap — see `initValidatorObserver`. Unregistered, the
 * seams are no-ops and this module never executes.
 */

import { validateProduct } from './validateProduct';
import { diff } from './validatorObserverDiff';
import { registerObserver, type ObserverContext } from './validatorObserverRegistry';
import { APP_VERSION } from './version';
import type { Product } from '../types';

/**
 * Bare literal, read directly — NEVER through the uid-namespace helpers.
 * `setStorageNamespace` is bound at `StorageProvider.tsx:59`, inside an effect that
 * runs after `createRoot(...).render(...)` (`main.tsx:22`), so a namespaced key is
 * unreadable at the bootstrap read point. `rp_workspace_id` (`constants.ts:12`) is
 * the standing precedent for a never-namespaced key.
 */
export const OBSERVER_FLAG_KEY = 'rp_validator_observer';

type Classification = 'ok' | 'repaired' | 'rejected';

/**
 * Dedupe keys for classifications only (§3e). Holds short hashed strings, never
 * product content — this is the mechanism the brief mandates, not a retention
 * buffer. Measurements are deliberately absent: they are never deduped.
 */
const seenClassifications = new Set<string>();
let observerErrors = 0;

// --- identity ---------------------------------------------------------------

/**
 * Reduce a thrown value to an identity carrying no user data.
 *
 * ⚠️ Takes the thrown VALUE, not a message, and must not assume assert-shaped
 * input. The inner `catch` receives non-`assert` throws: a `releases: [null]`
 * product reaches `assert(isValidId(r.id), …)` at `validateProduct.ts:275` and
 * dereferences `r.id` on `null`, throwing a `TypeError` BEFORE `assert` is called.
 *
 * Three of the validator's assert messages interpolate user data (`:323`, `:391`,
 * `:419`) and all three wrap it in double quotes, so eliding everything between
 * the first `"` and the last `"` removes the content and keeps the identity.
 * (It also flattens `:371`'s `Rib category must be "core" or "non-core"` to
 * `Rib category must be ""`. That message carries no user data and the remainder
 * is still unique — expected, not a defect.)
 */
export function assertIdentity(e: unknown): string {
  const name =
    e instanceof Error && typeof e.name === 'string' && e.name
      ? e.name
      : e === null
        ? 'null'
        : typeof e === 'object'
          ? (Object.getPrototypeOf(e)?.constructor?.name ?? 'Object')
          : typeof e;

  const message =
    typeof e === 'object' && e !== null && typeof (e as { message?: unknown }).message === 'string'
      ? (e as { message: string }).message
      : null;

  return message === null ? name : `${name}: ${elideQuoted(message)}`;
}

function elideQuoted(message: string): string {
  const first = message.indexOf('"');
  const last = message.lastIndexOf('"');
  if (first < 0 || last <= first) return message;
  return message.slice(0, first + 1) + message.slice(last);
}

// --- measurement ------------------------------------------------------------

export interface CapProximity {
  used: number;
  cap: number;
}

export interface Measurement {
  appVersion: string;
  /** Emitted under a NEUTRAL label — see `emitMeasurement`. */
  changelogCount: number;
  capProximity: Record<string, CapProximity>;
  rawSchemaVersion: unknown;
  didMigrate: boolean;
}

/**
 * Taken BEFORE the clone and inside §4's outer `try`, on every observation.
 *
 * `rejected` reports the first failure only, and the changelog assert (`:503`) is
 * late while releases (`:275`) and sprints (`:290`) are early — so a >500 project
 * with an empty release name would report the name and conceal the headline number
 * if this ran after classification.
 */
export function measure(product: Product, rawSchemaVersion: unknown): Measurement {
  return {
    appVersion: APP_VERSION,
    changelogCount: product._changeLog?.length ?? 0,
    capProximity: capProximities(product),
    rawSchemaVersion,
    // ⚠️ This exact comparison, not a paraphrase of either migration guard. The
    // v1→v2 waterfall sets `schemaVersion = SCHEMA_VERSION` iff it ran
    // (`storage.ts:162`) and preserves the value verbatim otherwise, so this is
    // correct at BOTH seams with no knowledge of which one called it. The cloud
    // guard and the local gate disagree for non-numeric values, and a mirror of
    // either is wrong at the other seam.
    didMigrate: rawSchemaVersion !== product.schemaVersion,
  };
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asRec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const strLen = (v: unknown): number => (typeof v === 'string' ? v.length : 0);

interface TreeScan {
  backbonesPerTheme: number;
  ribsTotal: number;
  allocationsPerRib: number;
  progressPerRib: number;
  nameLen: number;
  memoLen: number;
  idLen: number;
}

function scanRib(rib: Record<string, unknown>, acc: TreeScan): void {
  const allocations = asArray(rib.releaseAllocations);
  const progress = asArray(rib.progressHistory);
  acc.allocationsPerRib = Math.max(acc.allocationsPerRib, allocations.length);
  acc.progressPerRib = Math.max(acc.progressPerRib, progress.length);
  acc.nameLen = Math.max(acc.nameLen, strLen(rib.name));
  acc.idLen = Math.max(acc.idLen, strLen(rib.id));
  acc.memoLen = Math.max(acc.memoLen, strLen(rib.description), strLen(rib.notes));
  for (const a of allocations) acc.memoLen = Math.max(acc.memoLen, strLen(asRec(a).memo));
  for (const e of progress) acc.memoLen = Math.max(acc.memoLen, strLen(asRec(e).comment));
}

function scanBackbone(backbone: Record<string, unknown>, acc: TreeScan): void {
  const ribs = asArray(backbone.ribItems);
  acc.ribsTotal += ribs.length;
  acc.nameLen = Math.max(acc.nameLen, strLen(backbone.name));
  acc.idLen = Math.max(acc.idLen, strLen(backbone.id));
  for (const r of ribs) scanRib(asRec(r), acc);
}

function scanTheme(theme: Record<string, unknown>, acc: TreeScan): void {
  const backbones = asArray(theme.backboneItems);
  acc.backbonesPerTheme = Math.max(acc.backbonesPerTheme, backbones.length);
  acc.nameLen = Math.max(acc.nameLen, strLen(theme.name));
  acc.idLen = Math.max(acc.idLen, strLen(theme.id));
  for (const b of backbones) scanBackbone(asRec(b), acc);
}

/** Longest string in each of the three flat, non-tree string caps. */
function scanFlatStrings(p: Record<string, unknown>) {
  let sizeLabelLen = 0;
  for (const m of asArray(p.sizeMapping)) {
    sizeLabelLen = Math.max(sizeLabelLen, strLen(asRec(m).label));
  }
  let colorLabelLen = 0;
  for (const v of Object.values(asRec(p.cardColorLabels))) {
    colorLabelLen = Math.max(colorLabelLen, strLen(v));
  }
  let journalFieldLen = 0;
  for (const entry of asArray(p._changeLog)) {
    for (const v of Object.values(asRec(entry))) {
      journalFieldLen = Math.max(journalFieldLen, strLen(v));
    }
  }
  return { sizeLabelLen, colorLabelLen, journalFieldLen };
}

/**
 * Every cap `validateProduct` enforces, with the value this product reaches —
 * nine array caps and six string-length caps. Deliberately defensive about shape:
 * a hand-edited or hostile product may not have the tree the types promise, and a
 * throw here costs the whole measurement (§4's outer level).
 */
export function capProximities(product: Product): Record<string, CapProximity> {
  const p = product as unknown as Record<string, unknown>;
  const acc: TreeScan = {
    backbonesPerTheme: 0, ribsTotal: 0, allocationsPerRib: 0, progressPerRib: 0,
    nameLen: strLen(p.name), memoLen: 0, idLen: strLen(p.id),
  };
  for (const t of asArray(p.themes)) scanTheme(asRec(t), acc);
  const flat = scanFlatStrings(p);

  return {
    themes: { used: asArray(p.themes).length, cap: 100 },
    backbonesPerTheme: { used: acc.backbonesPerTheme, cap: 200 },
    ribsTotal: { used: acc.ribsTotal, cap: 5000 },
    releases: { used: asArray(p.releases).length, cap: 100 },
    sprints: { used: asArray(p.sprints).length, cap: 200 },
    allocationsPerRib: { used: acc.allocationsPerRib, cap: 100 },
    progressPerRib: { used: acc.progressPerRib, cap: 10000 },
    sizeMapping: { used: asArray(p.sizeMapping).length, cap: 20 },
    journalEntries: { used: asArray(p._changeLog).length, cap: 500 },
    nameLen: { used: acc.nameLen, cap: 1000 },
    memoLen: { used: acc.memoLen, cap: 2000 },
    sizeLabelLen: { used: flat.sizeLabelLen, cap: 20 },
    colorLabelLen: { used: flat.colorLabelLen, cap: 80 },
    idLen: { used: acc.idLen, cap: 128 },
    journalFieldLen: { used: flat.journalFieldLen, cap: 128 },
  };
}

// --- classification ---------------------------------------------------------

export interface DiffClassification {
  cls: Exclude<Classification, 'rejected'>;
  paths: string[];
  /** Top-level keys the validator stripped — a `repaired` sub-class (§3c). */
  unknownFields: string[];
}

export function classify(paths: string[]): DiffClassification {
  return {
    cls: paths.length === 0 ? 'ok' : 'repaired',
    paths,
    unknownFields: paths
      .filter(p => p.endsWith(' DELETED') && !p.includes('.') && !p.includes('['))
      .map(p => p.slice(0, -' DELETED'.length)),
  };
}

// --- the observer ------------------------------------------------------------

/**
 * The canonical sequence. Called FOR EFFECT — it returns nothing, and no seam may
 * write `return observe(...)`.
 *
 * Two `try` levels, and the nesting is the point (§4):
 *   inner — `validateProduct` threw. Classified `rejected`. THIS IS THE SIGNAL.
 *   outer — measurement, clone, diff or recording failed. Counted. THIS IS NOISE.
 * A single `try` would turn every `rejected` into "observer failed".
 */
export function observe(product: Product | null, { rawSchemaVersion }: ObserverContext): void {
  // Routine, not defensive: `storage.loadProduct` returns `Product | null` and
  // null is the normal answer for a stale index entry. Without this guard the
  // deref lands inside the outer `try` and every stale entry becomes an
  // `observer-error` — noise that is not corruption, in an n = 1 corpus.
  if (!product) return;
  try {
    const measurement = measure(product, rawSchemaVersion);
    emitMeasurement(product, measurement);
    const copy = structuredClone(product);
    try {
      validateProduct(copy);
      emitClassification(product, classify(diff(product, copy)), null);
    } catch (e) {
      emitClassification(product, null, assertIdentity(e));
    }
  } catch (e) {
    observerErrors += 1;
    console.error(`[observer] internal failure #${observerErrors}:`, assertIdentity(e));
  }
}

// --- output ------------------------------------------------------------------

/** §3e: recorded on EVERY observation, never deduped. */
function emitMeasurement(product: Product, m: Measurement): void {
  const near = Object.entries(m.capProximity)
    .filter(([, c]) => c.cap > 0 && c.used / c.cap >= 0.8)
    .map(([k, c]) => `${k} ${c.used}/${c.cap}`);
  console.info('[observer] measure', {
    id: product.id,
    appVersion: m.appVersion,
    // Neutral label, deliberately — never `_changeLog`.
    entryCount: m.changelogCount,
    rawSchemaVersion: m.rawSchemaVersion,
    didMigrate: m.didMigrate,
    nearCap: near.length ? near : 'none',
    caps: m.capProximity,
  });
}

/**
 * §3e: deduped on (productId, class, assert identity, diff-path signature).
 * Assert identity is in the key because a `rejected` product has no diff paths,
 * and the path signature is because a `repaired` product has no assert identity.
 */
function emitClassification(
  product: Product,
  repaired: DiffClassification | null,
  identity: string | null,
): void {
  const cls: Classification = identity !== null ? 'rejected' : (repaired?.cls ?? 'ok');
  const paths = repaired?.paths ?? [];
  const key = `${product.id}|${cls}|${identity ?? ''}|${hash(paths.join(' '))}`;
  if (seenClassifications.has(key)) return;
  seenClassifications.add(key);

  if (cls === 'rejected') {
    console.warn('[observer] REJECTED', { id: product.id, identity });
    return;
  }
  if (cls === 'ok') {
    console.info('[observer] ok', { id: product.id });
    return;
  }
  console.warn('[observer] REPAIRED', {
    id: product.id,
    pathCount: paths.length,
    paths,
    unknownFields: repaired?.unknownFields ?? [],
  });
}

/** FNV-1a, so the dedupe key stays bounded regardless of how many paths moved. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// --- bootstrap ---------------------------------------------------------------

/**
 * Read the flag once, at bootstrap, and register only if it is on.
 *
 * ⚠️ RUNTIME GATE, DELIBERATELY. A build-time gate would also keep the observer
 * out of the production bundle, but then the bundle that ships would not be the
 * bundle that was tested — for a few KB. The flag is worth it for three reasons:
 * this release ships as "no behaviour change" and console output on every load on
 * every machine is observable behaviour; it makes the single-observer window
 * structural rather than conventional; and this runs `validateProduct` against
 * live persisted state for the first time, at four seams.
 *
 * The read is wrapped because `localStorage` throws in some private browsing modes
 * and does not exist at all under vitest's node environment (`vite.config.ts:13`).
 * Absent, unset, or unreadable → do not register.
 */
export function initValidatorObserver(): void {
  let raw: string | null;
  try {
    raw = localStorage.getItem(OBSERVER_FLAG_KEY);
  } catch {
    return;
  }
  if (!raw || raw === '0' || raw === 'false') return;
  registerObserver(observe);
  console.info(`[observer] validator observation ON (${OBSERVER_FLAG_KEY}) — v${APP_VERSION}`);
}
