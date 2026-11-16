// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// R73 v0.56.2: export files with long changelogs, as the app writes them. One rib clone in three, so a
// rule that keeps entries for their op alone keeps the wrong ones.
import type { ChangeLogEntry, Product } from '../../types';

export const T0 = 1_700_000_000;

/**
 * A log of `count` entries: create, an upload unit (its predecessor and the upload), a product import,
 * then edits with a rib clone every third entry. Each entry's seq starts with `tag`.
 */
export function fileLog(count: number, tag = 'f'): ChangeLogEntry[] {
  const log: ChangeLogEntry[] = [
    { t: T0, op: 'create', entity: 'product', seq: `${tag}-create` },
    { t: T0 + 1, op: 'add', entity: 'theme', id: 'th1', seq: `${tag}-pred` },
    { t: T0 + 2, op: 'cloud-migration', uid: 'u1', source: 'p-old', seq: `${tag}-upload` },
    { t: T0 + 3, op: 'import', entity: 'product', source: 'file', seq: `${tag}-import` },
  ];
  for (let i = log.length; i < count; i++) {
    log.push(i % 3 === 0
      ? { t: T0 + i, op: 'duplicate', entity: 'rib', id: `c${i}`, source: 'r1', seq: `${tag}-${i}` }
      : { t: T0 + i, op: 'add', entity: 'rib', id: `r${i}`, seq: `${tag}-${i}` });
  }
  return log.slice(0, count);
}

export function fileProduct(id: string, name: string, count: number, tag = 'f'): Product {
  return {
    id, name, description: '', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    schemaVersion: 2, sizeMapping: [{ label: 'M', points: 5 }], releases: [], sprints: [], themes: [],
    sprintCadenceWeeks: 2, _originRef: 'origin-ws', _changeLog: fileLog(count, tag),
  };
}

const seqs = (log: readonly ChangeLogEntry[] | undefined) => (log ?? []).map(e => e.seq);

/** What survives of `tag`'s origin entries in `log`: create, the upload unit whole, the file's import. */
export function originKept(log: readonly ChangeLogEntry[] | undefined, tag = 'f') {
  const s = seqs(log);
  const up = s.indexOf(`${tag}-upload`);
  return {
    create: s.includes(`${tag}-create`),
    unit: up > 0 && s[up - 1] === `${tag}-pred`,
    fileImport: s.includes(`${tag}-import`),
  };
}

export const ALL_KEPT = { create: true, unit: true, fileImport: true };
