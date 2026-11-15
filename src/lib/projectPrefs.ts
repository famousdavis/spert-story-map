// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// One person's tile colours and archived products (v0.56.0), SPERT Forecaster's
// `src/shared/lib/project-prefs.ts` at 09c4cda. The map lives in that person's own settings
// (`rp:{ns}:preferences` locally, `spertstorymap_settings/{uid}` in the cloud), never on a product,
// so another member of a shared product sees neither.
//
// It is written only as nested entries, one field at a time (`['projectPrefs', id, 'color']`), never
// as a whole map: a colour set in one tab and an archive set in another on the same product are then
// both kept (Char-RB-1: per field 0/100 lost, per entry 100/100).
//
// An entry can outlive its product on purpose (a product can leave and come back), and an old entry
// is harmless: nothing prunes on load, and counts come from the products, never from the map.

import { REMOVE, isRefusedSegment, type PrefEntry } from './prefEntries';

export type TileColor = 'blue' | 'teal' | 'slate' | 'purple' | 'pink';

/** One product's entry. No colour is the field absent; `archived` is `true` or absent. */
export interface ProjectPref {
  color?: TileColor;
  archived?: true;
}

/** Keyed by product id. */
export type ProjectPrefs = Record<string, ProjectPref>;

export const TILE_COLORS: readonly TileColor[] = ['blue', 'teal', 'slate', 'purple', 'pink'];

/** Forecaster's bound on what a tampered store or document can add. */
export const MAX_PROJECT_PREFS = 1000;

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * An id that can hold no entry: the write's own rule (`isRefusedSegment`: empty, `__x__`, every
 * `Object.prototype` member name), so the page never shows a colour or archive that is never stored.
 */
export function canHoldPref(id: string): boolean {
  return !isRefusedSegment(id);
}

/** Each field on its own, then the entry: a refused colour leaves a valid archive. */
function sanitizeEntry(raw: unknown): ProjectPref | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { color, archived } = raw as { color?: unknown; archived?: unknown };
  const pref: ProjectPref = {};
  if (TILE_COLORS.includes(color as TileColor)) pref.color = color as TileColor;
  if (archived === true) pref.archived = true;
  return pref.color || pref.archived ? pref : null;
}

/**
 * The map as stored, kept only where it can be trusted. Never throws; `{}` when nothing is left.
 * Keeps the first MAX_PROJECT_PREFS entries (two tabs can each add the last one).
 */
export function sanitizeProjectPrefs(raw: unknown): ProjectPrefs {
  const out: ProjectPrefs = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let kept = 0;
  for (const key of Object.keys(raw)) {
    if (kept >= MAX_PROJECT_PREFS) break;
    if (!canHoldPref(key)) continue;
    const pref = sanitizeEntry((raw as Record<string, unknown>)[key]);
    if (!pref) continue;
    Object.defineProperty(out, key, { value: pref, enumerable: true, writable: true, configurable: true });
    kept++;
  }
  return out;
}

/** This product's entry, or an empty one. */
export function prefOf(prefs: ProjectPrefs, id: string): ProjectPref {
  return own(prefs, id) ? prefs[id]! : {};
}

export function isArchived(prefs: ProjectPrefs, id: string): boolean {
  return prefOf(prefs, id).archived === true;
}

/** Whether `id` may gain an entry: it has one already, or the map is under the cap. */
export function hasRoomFor(prefs: ProjectPrefs, id: string): boolean {
  return own(prefs, id) || Object.keys(prefs).length < MAX_PROJECT_PREFS;
}

/** The map with `id`'s entry set to `next` (an empty entry removes the key). */
export function withPref(prefs: ProjectPrefs, id: string, next: ProjectPref): ProjectPrefs {
  const out: ProjectPrefs = { ...prefs };
  const entry: ProjectPref = {};
  if (next.color) entry.color = next.color;
  if (next.archived) entry.archived = true;
  if (entry.color || entry.archived) Object.defineProperty(out, id, { value: entry, enumerable: true, writable: true, configurable: true });
  else delete out[id];
  return out;
}

/** The entries that change `before` into `after` for `id`, one per field. */
export function prefEntries(id: string, before: ProjectPref, after: ProjectPref): PrefEntry[] {
  const entries: PrefEntry[] = [];
  if (before.color !== after.color) entries.push({ path: ['projectPrefs', id, 'color'], value: after.color ?? REMOVE });
  if (before.archived !== after.archived) entries.push({ path: ['projectPrefs', id, 'archived'], value: after.archived ? true : REMOVE });
  return entries;
}

/**
 * The full order with the shown ids in `shownIds`' order: the slots that held a shown product take
 * the new order, and a hidden product keeps its slot (Forecaster's `reorderShown`).
 */
export function reorderShown(full: readonly string[], shownIds: readonly string[]): string[] {
  const shown = new Set(shownIds);
  let next = 0;
  return full.map(id => (shown.has(id) ? shownIds[next++]! : id));
}

/**
 * The full order an order write starts from (R89): every id the stored order holds, in its slot,
 * whether or not this tab lists it, then each of `ids` the stored order lacks, in `ids`' order. So
 * a product made or placed on another device keeps its place through a drop or a clone in a tab
 * that does not list it, and a deleted product's id stays, unseen (`sortByOrder` ignores an id it
 * is not given). A stored value that is not a list reads as none; a repeated id keeps its first slot.
 */
export function withStoredSlots(stored: unknown, ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id === 'string' && !seen.has(id)) { seen.add(id); out.push(id); }
  };
  if (Array.isArray(stored)) stored.forEach(add);
  ids.forEach(add);
  return out;
}
