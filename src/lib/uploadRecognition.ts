// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Does the cloud already hold this local product from an earlier upload? (v0.55.15, R67, O37)
 *
 * The server list is read RAW (the rules check field names only, and before v0.53.25 the app could
 * store a `_changeLog` that is not a list of objects), so nothing here assumes a shape: a log that
 * is not a list counts as empty and an entry that is not an object is skipped. In this order:
 * - (a) the local id is a cloud product the user is a member of (the list holds only those);
 * - (b) a product the user OWNS holds this user's `cloud-migration` entry, and the entry just before
 *   it has a `seq` the local log also holds (it descends from what was uploaded). An entry with a
 *   `source` must name the local id, and with no `seq` before it the `source` alone decides. An entry
 *   without `source` (an upload before v0.55.15) also needs the same `createdAt`: an import-as-copy
 *   holds the lineage but has its own creation time;
 * - (c) only on an owned product where (b) had nothing to decide (no such entry, or only entries with
 *   no `source` and no `seq` before them: a replace import removed the record, or an old upload of a
 *   product with no `seq` entry): the same `_originRef` and `createdAt`, when no other local product
 *   shares them. An import keeps the file's pair, so letting (c) see a product (b) decided on would
 *   skip a re-imported template (pre-flight PF-01).
 */
import type { Product } from '../types';

/** A product as the members query returned it; `data` is unchecked. */
export interface CloudRow { id: string; data: unknown }
export interface UploadMatch { cloudId: string; cloudName: string }

type Entry = Record<string, unknown>;
interface UploadRecord { source: unknown; seqBefore: string | null }
interface OwnedRow { row: CloudRow; records: UploadRecord[]; createdAt: unknown; origin: string | null }
export interface CloudIndex { byId: Map<string, CloudRow>; owned: OwnedRow[] }

const isEntry = (v: unknown): v is Entry => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** A document's `_changeLog`, read defensively. */
export function logEntries(data: unknown): Entry[] {
  const log = isEntry(data) ? data._changeLog : undefined;
  return Array.isArray(log) ? log.filter(isEntry) : [];
}

/** `_originRef` and `createdAt` as one key, or null unless both are non-empty text. */
export function originKey(data: unknown): string | null {
  if (!isEntry(data) || !isText(data._originRef) || !isText(data.createdAt)) return null;
  return JSON.stringify([data._originRef, data.createdAt]);
}

/** The origin keys more than one of these local products holds (unreadable ones are null). */
export function sharedOriginKeys(products: readonly (Product | null)[]): Set<string> {
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const p of products) {
    const key = originKey(p);
    if (key === null) continue;
    if (seen.has(key)) shared.add(key);
    seen.add(key);
  }
  return shared;
}

/** This user's `cloud-migration` entries in a log, each with the `seq` of the entry just before it. */
function uploadRecords(entries: Entry[], uid: string): UploadRecord[] {
  const records: UploadRecord[] = [];
  entries.forEach((entry, i) => {
    if (entry.op !== 'cloud-migration' || entry.uid !== uid) return;
    const before = entries[i - 1]?.seq;
    records.push({ source: entry.source, seqBefore: isText(before) ? before : null });
  });
  return records;
}

/** The server list, read once: rows by id, and the user's own products with their upload records. */
export function indexCloud(rows: readonly CloudRow[], uid: string): CloudIndex {
  const owned: OwnedRow[] = [];
  for (const row of rows) {
    if (!isEntry(row.data) || row.data.owner !== uid) continue;
    owned.push({ row, records: uploadRecords(logEntries(row.data), uid), createdAt: row.data.createdAt, origin: originKey(row.data) });
  }
  return { byId: new Map(rows.map(r => [r.id, r])), owned };
}

/** (b) for one record: does it say this local product is what was uploaded? */
function recordMatches(record: UploadRecord, owned: OwnedRow, local: Product, localSeqs: ReadonlySet<string>): boolean {
  const lineage = record.seqBefore !== null && localSeqs.has(record.seqBefore);
  if (record.source === undefined) return lineage && owned.createdAt === local.createdAt;
  return record.source === local.id && (record.seqBefore === null || lineage);
}

function findByHistory(local: Product, index: CloudIndex): OwnedRow | undefined {
  const localSeqs = new Set(logEntries(local).map(e => e.seq).filter(isText));
  return index.owned.find(o => o.records.some(r => recordMatches(r, o, local, localSeqs)));
}

/** (b) had nothing to decide on this product: no record, or only records with no `source` and no `seq` before. */
const undecided = (o: OwnedRow) => o.records.every(r => r.source === undefined && r.seqBefore === null);

function findByOrigin(local: Product, index: CloudIndex, shared: ReadonlySet<string>): OwnedRow | undefined {
  const key = originKey(local);
  if (key === null || shared.has(key)) return undefined;
  return index.owned.find(o => o.origin === key && undecided(o));
}

/** The cloud product an earlier upload made of `local`, or null when it must be uploaded. */
export function findEarlierUpload(local: Product, index: CloudIndex, shared: ReadonlySet<string>): UploadMatch | null {
  const row = index.byId.get(local.id) ?? (findByHistory(local, index) ?? findByOrigin(local, index, shared))?.row;
  if (!row) return null;
  return { cloudId: row.id, cloudName: isEntry(row.data) && typeof row.data.name === 'string' ? row.data.name : '' };
}
