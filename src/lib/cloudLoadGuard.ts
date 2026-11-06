// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Shape guard for project documents read from the cloud or from localStorage.
 * (`storage.ts` adds the few things a stored value needs: see `guardStoredProduct`.)
 *
 * A project document reaches this app from Firestore with no content checks:
 * the rules allowlist field NAMES only, and `validateProduct` runs on the import
 * path alone. localStorage has no checks either. A value of the wrong shape — an
 * object where a name belongs, a number where a list belongs — throws the first
 * time a view touches it, and because the app's only top-level error boundary
 * re-renders the same data on Reload, one such document on the project list
 * locked the whole app.
 *
 * ⚠️ THIS IS NOT `validateProduct`, AND MUST NEVER BECOME IT. The validator
 * rejects a whole file on its first violation and is STRICTER than what the app
 * itself writes (census-10: pasted text passes `MAX_STRING`, the cloud
 * `_changeLog` passes 500, `SizeMappingSection` stores `points` as a string).
 * Run on reads, it would make real projects unloadable. This guard instead:
 *
 *   - checks SHAPE ONLY — type and container, never length, count or range;
 *   - accepts every value an app writer can produce, which is wider than the
 *     declared types in places (`points: string`, `size: ''`, `null` dates and
 *     percentages, legacy `cardColor` keys) — see the bounds table in the PR;
 *   - never throws: an item of the wrong shape is set aside, a field of the
 *     wrong type is reset to a neutral value, and the rest of the project loads.
 *
 * It mutates the freshly-read product in place (as `migrateToV2` already does)
 * and returns the ids of the rules that fired. It never writes back. What happens to
 * a value set aside here at the next save depends on the path, below. Losing it there
 * is acceptable ONLY because no app writer can produce a value this guard rejects.
 *
 *   - LOCAL: the next save repairs everything. It writes the whole product.
 *   - CLOUD, a value reset here: the next save repairs it. Its key is in `mergeFields`,
 *     and so is the list around anything set aside inside a list.
 *   - CLOUD, a top-level key deleted here: the save merges named fields, so leaving a
 *     key out leaves it stored. Since v0.53.26 the driver names it with `deleteField()`
 *     at the next save (`guardRead` in `firestoreDriver.ts`).
 *   - CLOUD, `createdAt` and `_changeLog`: no save repairs these and none may. They stay
 *     in the document, filtered from every read, and raise no notice there. Replacing
 *     the project writes the whole document, so a bad `createdAt` goes then, and only
 *     then (`replaceProduct` in `firestoreDriver.ts`).
 *
 * ⚠️ Commit 6d98b85 says "Repair is at the next save, as on the cloud". That is true
 * on a local read and was FALSE on the cloud: not for `createdAt`, not for `_changeLog`,
 * not for any deleted key. A commit message cannot be corrected, so it is corrected
 * here. It is still false for the first two: see `RULES_NO_SAVE_CLEARS`.
 *
 * ⚠️ THE TWO PATHS DO NOT STORE THE SAME VALUE. `sanitizeForFirestore` leaves NaN
 * and Infinity alone, so the cloud keeps a number and this guard passes it.
 * `JSON.stringify` writes `null`, so the same value reads back here as `null`. No
 * writer stores either in `percentage` or `points`. One did in `sprintCadenceWeeks`:
 * before v0.6.0 clearing the Settings input stored NaN, and a local store outlives
 * the code that wrote it. Check a new rule against both, and against old writers.
 */

type Obj = Record<string, unknown>;
type Hits = Set<string>;

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const hasStringKey = (v: unknown, key: string): v is Obj =>
  isObj(v) && typeof v[key] === 'string';

/**
 * A text field. Absent stays absent unless `fill` is given (for fields every
 * writer sets); anything present that is not a string is reset to ''. A `null`
 * carries no text, so '' loses nothing and is not reported as set aside.
 */
function text(o: Obj, key: string, rule: string, hits: Hits, fill?: string): void {
  const v = o[key];
  if (typeof v === 'string') return;
  if (v === undefined) {
    if (fill !== undefined) o[key] = fill;
    return;
  }
  o[key] = '';
  if (v !== null) hits.add(rule);
}

/** A field whose writers store a string or `null` (dates, `size`). */
function textOrNull(o: Obj, key: string, rule: string, hits: Hits): void {
  const v = o[key];
  if (v === undefined || v === null || typeof v === 'string') return;
  o[key] = null;
  hits.add(rule);
}

/**
 * An optional field that is dropped when it has the wrong type. A `null` carries
 * no value, so dropping it loses nothing and is not reported as set aside.
 */
function dropUnless(o: Obj, key: string, ok: (v: unknown) => boolean, rule: string, hits: Hits): void {
  const v = o[key];
  if (v === undefined || ok(v)) return;
  delete o[key];
  if (v !== null) hits.add(rule);
}

/**
 * A list field. A missing list becomes `[]` silently — every writer sets these,
 * and an empty list loses nothing. A present non-list is a hit. Items failing
 * `keep` are set aside; each survivor is passed to `fix`.
 */
function list(o: Obj, key: string, rule: string, hits: Hits, keep: (v: unknown) => v is Obj, fix?: (item: Obj, hits: Hits) => void): void {
  const v = o[key];
  if (!Array.isArray(v)) {
    if (v !== undefined) hits.add(rule);
    o[key] = [];
    return;
  }
  const kept = v.filter(keep);
  if (kept.length !== v.length) {
    hits.add(rule);
    o[key] = kept;
  }
  if (fix) for (const item of kept) fix(item, hits);
}

const isNumOrString = (v: unknown) => typeof v === 'number' || typeof v === 'string';
const isNumber = (v: unknown) => typeof v === 'number';
const isString = (v: unknown) => typeof v === 'string';
const keepById = (v: unknown): v is Obj => hasStringKey(v, 'id');

function fixSizeRow(row: Obj, hits: Hits): void {
  // `points` is a string while a user is mid-edit (SizeMappingSection writes
  // `e.target.value`), and that string is persisted. Both are legitimate.
  if (!isNumOrString(row.points)) { row.points = 0; hits.add('sizeMapping.points'); }
}

function fixRelease(r: Obj, hits: Hits): void {
  text(r, 'name', 'release.name', hits, '');
  text(r, 'description', 'release.description', hits);
  textOrNull(r, 'targetDate', 'release.targetDate', hits);
}

function fixSprint(s: Obj, hits: Hits): void {
  text(s, 'name', 'sprint.name', hits, '');
  textOrNull(s, 'endDate', 'sprint.endDate', hits);
}

function fixAllocation(a: Obj, hits: Hits): void {
  text(a, 'memo', 'allocation.memo', hits);
}

const keepAllocation = (v: unknown): v is Obj =>
  hasStringKey(v, 'releaseId') && isNumOrString((v as Obj).percentage);

// `releaseId` may be absent on a legacy (pre-v2) entry; `migrateToV2` handles
// that, and such an entry is inert to the progress rule.
const keepProgress = (v: unknown): v is Obj =>
  hasStringKey(v, 'sprintId') && (v.releaseId === undefined || typeof v.releaseId === 'string');

function fixProgress(e: Obj, hits: Hits): void {
  const pct = e.percentComplete;
  if (pct !== undefined && pct !== null && typeof pct !== 'number') {
    e.percentComplete = null;
    hits.add('progress.percentComplete');
  }
  text(e, 'comment', 'progress.comment', hits);
  dropUnless(e, 'updatedAt', isString, 'progress.updatedAt', hits);
}

function fixRib(r: Obj, hits: Hits): void {
  text(r, 'name', 'rib.name', hits, '');
  text(r, 'description', 'rib.description', hits);
  text(r, 'notes', 'rib.notes', hits);
  textOrNull(r, 'size', 'rib.size', hits);
  if (r.category !== undefined && typeof r.category !== 'string') { r.category = 'core'; hits.add('rib.category'); }
  dropUnless(r, 'cardColor', isString, 'rib.cardColor', hits);
  list(r, 'releaseAllocations', 'rib.releaseAllocations', hits, keepAllocation, fixAllocation);
  list(r, 'progressHistory', 'rib.progressHistory', hits, keepProgress, fixProgress);
}

function fixBackbone(b: Obj, hits: Hits): void {
  text(b, 'name', 'backbone.name', hits, '');
  text(b, 'description', 'backbone.description', hits);
  list(b, 'ribItems', 'backbone.ribItems', hits, keepById, fixRib);
}

function fixTheme(t: Obj, hits: Hits): void {
  text(t, 'name', 'theme.name', hits, '');
  dropUnless(t, 'color', isString, 'theme.color', hits);
  list(t, 'backboneItems', 'theme.backboneItems', hits, keepById, fixBackbone);
}

/**
 * `releaseCardOrder` / `sizingCardOrder` / `cardColorLabels`: an object of
 * lists (or of strings). Entries of the wrong type are dropped; the elements of
 * a card-order list are left alone — they are only ever compared as ids, and a
 * `null` there is a legitimate store of an `undefined` (sanitizeForFirestore).
 * `Object.fromEntries` defines own properties, so a `__proto__` key cannot
 * reach the prototype.
 */
function record(o: Obj, key: string, rule: string, hits: Hits, ok: (v: unknown) => boolean): void {
  const v = o[key];
  if (v === undefined) return;
  if (!isObj(v)) { delete o[key]; hits.add(rule); return; }
  const entries = Object.entries(v);
  const kept = entries.filter(([, val]) => ok(val));
  if (kept.length !== entries.length) { o[key] = Object.fromEntries(kept); hits.add(rule); }
}

export function guardCloudProduct(loaded: object): string[] {
  const product = loaded as Obj;
  const hits: Hits = new Set();
  text(product, 'name', 'product.name', hits, '');
  text(product, 'description', 'product.description', hits);
  dropUnless(product, 'createdAt', isString, 'product.createdAt', hits);
  dropUnless(product, 'sprintCadenceWeeks', isNumber, 'product.sprintCadenceWeeks', hits);
  list(product, 'sizeMapping', 'sizeMapping', hits, (v): v is Obj => hasStringKey(v, 'label'), fixSizeRow);
  list(product, 'releases', 'releases', hits, keepById, fixRelease);
  list(product, 'sprints', 'sprints', hits, keepById, fixSprint);
  list(product, 'themes', 'themes', hits, keepById, fixTheme);
  record(product, 'releaseCardOrder', 'releaseCardOrder', hits, Array.isArray);
  record(product, 'sizingCardOrder', 'sizingCardOrder', hits, Array.isArray);
  record(product, 'cardColorLabels', 'cardColorLabels', hits, isString);
  // The cloud save appends deltas via arrayUnion, so there this changes only what
  // is held in memory, never the server, and the driver raises no notice for it. A
  // local save writes the whole product, so there it goes at the next save, like
  // everything else set aside here.
  if (product._changeLog !== undefined) list(product, '_changeLog', '_changeLog', hits, isObj);
  return [...hits];
}
