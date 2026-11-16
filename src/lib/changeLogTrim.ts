// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ChangeLogEntry } from '../types';

/**
 * The one function that shortens a changelog (v0.56.2, R73, R97, R98). Pure, total, never throws.
 *
 * A log at or under `cap` comes back as the same array. A longer one keeps, in its original order:
 *  1. every origin entry (`isOriginEntry`), and each upload unit whole: a run of `cloud-migration`
 *     entries with the entry just before the run, unless that entry is a marker;
 *  2. the newest other entries, as many as fit;
 *  3. one `compact` marker in place of each stretch of removed entries, counted inside `cap`.
 *     Existing markers are never kept by the newest fill: each joins the stretch it sits in, so a
 *     trim never puts two markers side by side.
 * When the origin entries and their markers alone exceed `cap`, the newest upload unit is kept first,
 * then the other origin entries and units oldest first, each kept or removed whole, stopping at the
 * first that does not fit. A `cap` below 3 keeps the last `cap` entries and adds no marker.
 *
 * Callers: `validateProduct` (an import) and the local store's writes (`storage.ts`). Nothing else
 * trims: memory and the cloud keep every entry.
 */
export function trimChangeLog<T>(log: T[], cap: number): Array<T | ChangeLogEntry> {
  if (!Array.isArray(log) || !Number.isFinite(cap) || log.length <= cap) return log;
  const room = Math.max(0, Math.floor(cap));
  if (room < 3) return log.slice(log.length - room);
  const groups = findGroups(log);
  const mask = fillNewest(log, groups, room) ?? fillOverflow(log.length, groups, room);
  return assemble(log, mask);
}

/** The marker's op. An entry with this op is a marker wherever it came from. */
const MARKER_OP = 'compact';

/** How a product began, each import into it and each copy of it, and each upload (R97, O50). */
function isOriginEntry(entry: unknown): boolean {
  const op = opOf(entry);
  if (op === 'create' || op === 'cloud-migration') return true;
  return (op === 'import' || op === 'duplicate') && asRecord(entry)?.entity === 'product';
}

function isMarker(entry: unknown): boolean {
  return opOf(entry) === MARKER_OP;
}

// ── which entries are kept ─────────────────────────────────────────────

/** A kept block of entries, `start` to `end` inclusive. */
interface Group { start: number; end: number; upload: boolean }

function asRecord(entry: unknown): Record<string, unknown> | null {
  return typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    ? entry as Record<string, unknown>
    : null;
}

function opOf(entry: unknown): string | undefined {
  const op = asRecord(entry)?.op;
  return typeof op === 'string' ? op : undefined;
}

function isUpload(entry: unknown): boolean {
  return opOf(entry) === 'cloud-migration';
}

/** Every origin entry and upload unit, in order. An origin entry just before an upload belongs to its unit. */
function findGroups(log: readonly unknown[]): Group[] {
  const groups: Group[] = [];
  let i = 0;
  while (i < log.length) {
    if (isUpload(log[i])) {
      i = pushUploadUnit(log, i, groups);
    } else {
      if (isOriginEntry(log[i])) groups.push({ start: i, end: i, upload: false });
      i++;
    }
  }
  return groups;
}

/** Adds the unit that starts its run of uploads at `i`; returns the index after the run. */
function pushUploadUnit(log: readonly unknown[], i: number, groups: Group[]): number {
  let end = i;
  while (end + 1 < log.length && isUpload(log[end + 1])) end++;
  let start = i;
  if (i > 0 && !isMarker(log[i - 1])) {
    start = i - 1;
    if (groups[groups.length - 1]?.end === start) groups.pop();
  }
  groups.push({ start, end, upload: true });
  return end + 1;
}

/** Kept entries plus one marker per stretch of removed ones. */
function sizeOf(mask: Uint8Array): number {
  let size = 0;
  let inStretch = false;
  for (const kept of mask) {
    if (kept) {
      size++;
      inStretch = false;
    } else if (!inStretch) {
      size++;
      inStretch = true;
    }
  }
  return size;
}

function maskOf(length: number, groups: readonly Group[]): Uint8Array {
  const mask = new Uint8Array(length);
  for (const g of groups) mask.fill(1, g.start, g.end + 1);
  return mask;
}

function withNewest(mask: Uint8Array, free: readonly number[], count: number): Uint8Array {
  const out = mask.slice();
  for (const i of free.slice(free.length - count)) out[i] = 1;
  return out;
}

/**
 * Every group, then the newest other entries that fit; null when the groups alone do not fit.
 * Adding an older entry never makes the result shorter, so the largest count that fits is found by halving.
 */
function fillNewest(log: readonly unknown[], groups: readonly Group[], cap: number): Uint8Array | null {
  const mask = maskOf(log.length, groups);
  if (sizeOf(mask) > cap) return null;
  const free: number[] = [];
  log.forEach((entry, i) => { if (!mask[i] && !isMarker(entry)) free.push(i); });
  let lo = 0;
  let hi = free.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (sizeOf(withNewest(mask, free, mid)) <= cap) lo = mid;
    else hi = mid - 1;
  }
  return withNewest(mask, free, lo);
}

/** Size of the result keeping only `kept` (sorted, not overlapping) out of `length` entries. */
function groupsSize(kept: readonly Group[], length: number): number {
  let size = 0;
  let next = 0;
  for (const g of kept) {
    if (g.start > next) size++;
    size += g.end - g.start + 1;
    next = g.end + 1;
  }
  return next < length ? size + 1 : size;
}

/** Rule 4 (O51): the newest upload unit, then the rest oldest first, stopping at the first that does not fit. */
function fillOverflow(length: number, groups: readonly Group[], cap: number): Uint8Array {
  const uploads = groups.filter(g => g.upload);
  const newestUpload = uploads[uploads.length - 1];
  const order = newestUpload ? [newestUpload, ...groups.filter(g => g !== newestUpload)] : groups;
  let kept: Group[] = [];
  for (const g of order) {
    const trial = [...kept, g].sort((a, b) => a.start - b.start);
    if (groupsSize(trial, length) > cap) break;
    kept = trial;
  }
  return maskOf(length, kept);
}

// ── the result ─────────────────────────────────────────────────────────

function assemble<T>(log: readonly T[], mask: Uint8Array): Array<T | ChangeLogEntry> {
  const out: Array<T | ChangeLogEntry> = [];
  let stretch: T[] = [];
  log.forEach((entry, i) => {
    if (!mask[i]) {
      stretch.push(entry);
      return;
    }
    if (stretch.length > 0) out.push(markerFor(stretch));
    stretch = [];
    out.push(entry);
  });
  if (stretch.length > 0) out.push(markerFor(stretch));
  return out;
}

/** Longest text a changelog field may hold; import deletes a longer one. */
const FIELD_MAX = 128;

function finiteT(entry: unknown): number | undefined {
  const t = asRecord(entry)?.t;
  return typeof t === 'number' && Number.isFinite(t) ? t : undefined;
}

/** A marker's count, its `source` as a whole number, or 1 when that cannot be read. */
function countOf(marker: unknown): number {
  const source = asRecord(marker)?.source;
  return typeof source === 'string' && /^\d+$/.test(source) ? Number(source) : 1;
}

/** A marker's first time, its `id` as a whole number. */
function firstTimeOf(marker: unknown): number | undefined {
  const id = asRecord(marker)?.id;
  return typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : undefined;
}

/** The earliest of the stretch's first times: each marker's, and the first time after each marker. */
function earliestTime(stretch: readonly unknown[]): number | undefined {
  const times: number[] = [];
  let runStart = true;
  for (const entry of stretch) {
    const time = isMarker(entry) ? firstTimeOf(entry) : finiteT(entry);
    if (time !== undefined && (isMarker(entry) || runStart)) times.push(time);
    if (isMarker(entry)) runStart = true;
    else if (time !== undefined) runStart = false;
  }
  return times.reduce<number | undefined>((min, t) => (min === undefined || t < min ? t : min), undefined);
}

function lastTime(entries: readonly unknown[]): number | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const t = finiteT(entries[i]);
    if (t !== undefined) return t;
  }
  return undefined;
}

/** One marker for a stretch of removed entries and existing markers (O49). */
function markerFor(stretch: readonly unknown[]): ChangeLogEntry {
  const entries = stretch.filter(e => !isMarker(e));
  const markers = stretch.filter(isMarker);
  if (entries.length === 0 && markers.length === 1) return markers[0] as ChangeLogEntry;
  const count = entries.length + markers.reduce<number>((n, m) => n + countOf(m), 0);
  if (entries.length === 0) {
    const last = asRecord(markers[markers.length - 1]) ?? {};
    return makeMarker(finiteT(last) ?? 1, earliestTime(stretch), count, last.seq);
  }
  const t = lastTime(entries) ?? lastTime(markers) ?? 1;
  const lastSeq = asRecord(entries[entries.length - 1])?.seq;
  const seq = `${MARKER_OP}:${typeof lastSeq === 'string' ? lastSeq : String(t)}`.slice(0, FIELD_MAX);
  return makeMarker(t, earliestTime(stretch), count, seq);
}

function makeMarker(t: number, first: number | undefined, count: number, seq: unknown): ChangeLogEntry {
  return {
    t,
    op: MARKER_OP,
    entity: 'product',
    id: String(first ?? t),
    source: String(count),
    ...(typeof seq === 'string' ? { seq } : {}),
  };
}
