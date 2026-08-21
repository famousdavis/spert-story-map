// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Own-key structural diff for the validator observer (Brief 10 §3b.1).
 *
 * Compares the live product (left) against the clone `validateProduct` mutated
 * (right) and reports the paths that moved. Four rules, all load-bearing:
 *
 *   1. Own keys, tested with `Object.prototype.hasOwnProperty`. A key DELETED by
 *      `stripObject` and a key present with value `undefined` are different
 *      results — the deleted case is the dominant signal — so they get different
 *      path strings (`x DELETED` vs. plain `x`).
 *   2. Arrays compare by index; a length change is ONE path (`…length`), never a
 *      per-index cascade.
 *   3. The cycle seen-set tracks the LEFT walk only. Product data should be
 *      acyclic, so a trip is a finding and gets reported.
 *   4. Paths are dotted with array indices: `themes[0].backboneItems[1].ribItems[3].size`.
 *
 * The diff is own-key and therefore prototype-blind, which is what lets §3b pass
 * the live object as the pristine comparand instead of taking a second clone.
 */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const hasOwn = (o: object, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

const at = (path: string, key: string): string => (path ? `${path}.${key}` : key);

const here = (path: string): string => path || '<root>';

/**
 * Report every path at which `left` and `right` differ. Pure; never throws on
 * cyclic input.
 */
export function diff(left: unknown, right: unknown): string[] {
  const out: string[] = [];
  walk(left, right, '', out, new Set<object>());
  return out;
}

function walk(
  l: unknown,
  r: unknown,
  path: string,
  out: string[],
  seen: Set<object>,
): void {
  if (!isObj(l) || !isObj(r)) {
    // Object.is, not ===, so NaN compares equal to itself and a spurious path is
    // not reported for a product that legitimately holds one.
    if (!Object.is(l, r)) out.push(here(path));
    return;
  }

  // ⚠️ DO NOT add an `if (l === r) return;` shortcut above this line. C9's
  // fixture 5 diffs an acyclic object against ITSELF and must return zero paths —
  // that is the check which proves this set is one-sided (a both-sides set reports
  // a spurious cycle there, depending on its check/add ordering). An identity
  // shortcut would return zero paths under every implementation and make the check
  // unable to fail.
  if (seen.has(l)) {
    out.push(`${here(path)} <cycle>`);
    return;
  }
  seen.add(l);

  if (Array.isArray(l)) {
    if (!Array.isArray(r)) out.push(here(path));
    else walkArray(l, r, path, out, seen);
    return;
  }
  if (Array.isArray(r)) {
    out.push(here(path));
    return;
  }
  walkRecord(l, r, path, out, seen);
}

/** Rule 2: a length change is ONE path; matching lengths compare by index. */
function walkArray(
  l: unknown[],
  r: unknown[],
  path: string,
  out: string[],
  seen: Set<object>,
): void {
  if (l.length !== r.length) {
    out.push(at(path, 'length'));
    return;
  }
  for (let i = 0; i < l.length; i++) {
    walk(l[i], r[i], `${path}[${i}]`, out, seen);
  }
}

/** Rule 1: own-key membership, so DELETED and present-with-undefined differ. */
function walkRecord(
  l: Record<string, unknown>,
  r: Record<string, unknown>,
  path: string,
  out: string[],
  seen: Set<object>,
): void {
  const keys = Object.keys(l);
  for (const k of Object.keys(r)) {
    if (!hasOwn(l, k)) keys.push(k);
  }
  for (const k of keys) {
    const p = at(path, k);
    const inL = hasOwn(l, k);
    const inR = hasOwn(r, k);
    if (inL && inR) walk(l[k], r[k], p, out, seen);
    else out.push(`${p} ${inL ? 'DELETED' : 'ADDED'}`);
  }
}
