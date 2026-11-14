// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Settings are written field by field (v0.55.14). A writer hands the driver ENTRIES, each a field
 * path and a value, never a whole settings object: a whole object built from an older copy
 * erases whatever changed since (the export name, the tile order).
 *
 * Both drivers use these rules, so the same entries mean the same thing in each:
 * - `addEntry` keeps the pending entries free of a parent and its child: a new entry replaces every
 *   pending entry at or below its path; a child arriving after a pending parent folds into the
 *   parent's value; a child removal below a pending removal or a non-map value does nothing. One
 *   accumulated write then leaves the document as the same entries written one by one would, with
 *   two kinds of difference, in each of which one by one leaves an empty map where the accumulated
 *   write leaves what was stored: a set then its own removal (one by one creates the parent map and
 *   then empties it), and a set then a removal under a stored value that is not a map (one by one
 *   replaces that value with a map and then empties it). The accumulated write never writes more
 *   than one by one (Opus-PR242-1 p3 on the emulator: of 300 random sequences, 291 equal, 1 equal
 *   once empty maps are pruned, 8 of the second kind).
 * - `applyEntries` applies entries to a plain object through own properties only.
 * - A path is refused when a segment is empty, has the form `__x__`, or names an `Object.prototype`
 *   member (O33). The SDK refuses the first two; a `deleteField()` at a present `constructor`,
 *   `toString`, `hasOwnProperty` or `valueOf` key never settles and leaves the client throwing on
 *   every later call (firebase 12.12, measured 5/5).
 */

/**
 * The removal marker. An entry whose value is `undefined` is a removal too. A registered symbol, so
 * a marker from another copy of this module (a test that resets modules) is still a removal here.
 */
export const REMOVE: unique symbol = Symbol.for('spert-story-map.settings.remove');

export interface PrefEntry {
  path: readonly string[];
  value: unknown;
}

export const isRemoval = (value: unknown): boolean => value === REMOVE || value === undefined;

type Obj = Record<string, unknown>;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isMap = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const setOwn = (o: Obj, k: string, v: unknown) => {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
};

/** O33: kept as one predicate so the rule can be changed in one place. */
export function isRefusedSegment(segment: string): boolean {
  return segment === '' || /^__.*__$/.test(segment) || segment in Object.prototype;
}

/** A path both drivers will write; otherwise warns and returns false. */
export function isWritablePath(path: readonly string[]): boolean {
  if (path.length > 0 && !path.some(isRefusedSegment)) return true;
  console.warn('[settings] refused a setting path:', JSON.stringify(path));
  return false;
}

/** Set or remove `path` in `target` (mutated), own properties only. A removal creates nothing. */
function applyAt(target: Obj, path: readonly string[], value: unknown): void {
  let cur = target;
  for (const segment of path.slice(0, -1)) {
    const next = own(cur, segment) ? cur[segment] : undefined;
    if (!isMap(next)) {
      if (isRemoval(value)) return;
      const created: Obj = {};
      setOwn(cur, segment, created);
      cur = created;
    } else {
      cur = next;
    }
  }
  const last = path[path.length - 1]!;
  if (isRemoval(value)) {
    if (own(cur, last)) delete cur[last];
  } else {
    setOwn(cur, last, structuredClone(value));
  }
}

/** A copy of `base` with the entries applied, in order. */
export function applyEntries<T extends object>(base: T, entries: readonly PrefEntry[]): T {
  const out = structuredClone(base) as Obj;
  for (const e of entries) applyAt(out, e.path, e.value);
  return out as T;
}

const isPrefix = (a: readonly string[], b: readonly string[]) => a.length <= b.length && a.every((s, i) => s === b[i]);

/** The pending entries after `entry` (see the module comment). A refused path changes nothing. */
export function addEntry(pending: readonly PrefEntry[], entry: PrefEntry): PrefEntry[] {
  if (!isWritablePath(entry.path)) return [...pending];
  const value = isRemoval(entry.value) ? REMOVE : structuredClone(entry.value);
  const parent = pending.find(p => p.path.length < entry.path.length && isPrefix(p.path, entry.path));
  if (parent) {
    if (value === REMOVE && !isMap(parent.value)) return [...pending];
    const folded: Obj = isMap(parent.value) ? structuredClone(parent.value) : {};
    applyAt(folded, entry.path.slice(parent.path.length), value);
    return pending.map(p => (p === parent ? { path: p.path, value: folded } : p));
  }
  return [...pending.filter(p => !isPrefix(entry.path, p.path)), { path: [...entry.path], value }];
}

/**
 * The data and field list for ONE masked write (`setDoc(ref, data, { mergeFields })`). Each value
 * is sanitised first; a removal's value is the sentinel, which is never sanitised.
 */
export function buildMaskedWrite<F>(
  entries: readonly PrefEntry[],
  sanitize: (value: unknown) => unknown,
  removal: () => unknown,
  fieldPath: (segments: readonly string[]) => F,
): { data: Obj; fields: F[] } {
  const data: Obj = {};
  for (const e of entries) {
    let cur = data;
    for (const segment of e.path.slice(0, -1)) {
      if (!own(cur, segment)) setOwn(cur, segment, {});
      cur = cur[segment] as Obj;
    }
    setOwn(cur, e.path[e.path.length - 1]!, isRemoval(e.value) ? removal() : sanitize(e.value));
  }
  return { data, fields: entries.map(e => fieldPath(e.path)) };
}
