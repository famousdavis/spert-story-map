// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.56.0 R-7 and R-6: the upload copies tile colours and archive, places a retried upload's
 * products in this browser's order, and re-reads the order just before its one settings write. The
 * real `migrateLocalToCloud` over the masked-write stand-in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  fs: null as unknown as ReturnType<typeof import('./fixtures/mergeFieldsFirestore').createMergeFieldsFirestore>,
}));
vi.mock('../lib/firebase', () => ({ db: {}, auth: null, functionsInstance: null, isFirebaseAvailable: true }));
vi.mock('firebase/firestore', async () => {
  const { createMergeFieldsFirestore } = await import('./fixtures/mergeFieldsFirestore');
  h.fs ??= createMergeFieldsFirestore();
  const f = h.fs;
  return {
    doc: f.doc, getDoc: f.getDoc, setDoc: f.setDoc, deleteField: f.deleteField, FieldPath: f.FieldPath,
    getDocs: f.getDocs, getDocFromServer: f.getDocFromServer, getDocsFromServer: f.getDocsFromServer,
    collection: f.collection, query: f.query, where: f.where,
  };
});

import { migrateLocalToCloud } from '../lib/migration';
import { createFirestoreDriver } from '../lib/firestoreDriver';
import { REMOVE } from '../lib/prefEntries';
import { sortByOrder } from '../lib/sortByOrder';
import { req } from './testHelpers';

const SETTINGS = 'spertstorymap_settings/u';
const PROJECTS = 'spertstorymap_projects/';
type Prefs = Record<string, { color?: string; archived?: boolean }>;
const localProduct = (id: string, name: string) => ({ id, name, description: '', createdAt: 'x', updatedAt: 'x', schemaVersion: 2, themes: [], releases: [], sprints: [], sizeMapping: [], _changeLog: [] });

function seedCloud(settings: Record<string, unknown>, ids = ['c1', 'c2']) {
  for (const id of ids) h.fs.docs.set(PROJECTS + id, { name: `Cloud ${id}`, owner: 'u', members: { u: 'owner' } });
  h.fs.docs.set(SETTINGS, settings);
}
/** Local 1..3, shown in the order l3, l1, l2; `projectPrefs` as given. */
function seedLocal(projectPrefs: Prefs) {
  const ps = [localProduct('l1', 'Local 1'), localProduct('l2', 'Local 2'), localProduct('l3', 'Local 3')];
  localStorage.setItem('rp:local:products_index', JSON.stringify(ps.map(p => ({ id: p.id, name: p.name }))));
  for (const p of ps) localStorage.setItem(`rp:local:product_${p.id}`, JSON.stringify(p));
  localStorage.setItem('rp:local:preferences', JSON.stringify({ projectOrder: ['l3', 'l1', 'l2'], projectPrefs }));
}
const settings = () => (h.fs.docs.get(SETTINGS) ?? {}) as { projectOrder?: string[]; projectPrefs?: Prefs; exportName?: string };
const cloudPrefs = () => settings().projectPrefs ?? {};
const localPrefs = () => (JSON.parse(localStorage.getItem('rp:local:preferences') ?? '{}') as { projectPrefs?: Prefs }).projectPrefs;
/** The cloud id the upload gave a local product, by its name. */
const cloudId = (name: string) => req(
  [...h.fs.docs.entries()].find(([p, d]) => p.startsWith(PROJECTS) && d.name === name)?.[0].slice(PROJECTS.length), `cloud ${name}`);
/** The dashboard's tiles: u's products sorted by the stored order. */
function tiles(): string[] {
  const mine = [...h.fs.docs.entries()].filter(([p]) => p.startsWith(PROJECTS))
    .sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, d]) => ({ id: p.slice(PROJECTS.length), name: d.name as string }));
  return sortByOrder(mine, settings().projectOrder).map(t => t.name);
}

// Decreasing ids, so the uploaded products' ids sort Local 3, Local 2, Local 1 (the upload order is
// the index's, l1, l2, l3): never the local tile order the tests expect (Local 3, Local 1, Local 2).
let n = 0;
beforeEach(() => {
  h.fs.reset();
  localStorage.clear();
  n = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(999999999999 - n++).padStart(12, '0')}`);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('R-7: the upload copies each uploaded product\'s colour and archive to its new id', () => {
  it('as one entry per field in its one settings write; the cloud\'s entries and the local ones stay', async () => {
    seedCloud({ projectOrder: ['c1', 'c2'], projectPrefs: { c1: { color: 'blue' } } });
    const local: Prefs = { l1: { color: 'teal' }, l2: { color: 'pink', archived: true }, gone: { color: 'slate' } };
    seedLocal(local);
    const r = await migrateLocalToCloud('u');
    expect(r.uploadedIds).toHaveLength(3);
    expect(cloudPrefs()).toEqual({
      c1: { color: 'blue' },
      [cloudId('Local 1')]: { color: 'teal' },
      [cloudId('Local 2')]: { color: 'pink', archived: true },
    });
    expect(localPrefs(), 'the local entries stay (R69)').toEqual(local);
    const write = req([...h.fs.writes].reverse().find(w => w.path === SETTINGS), 'settings write');
    expect(write.mask?.some(m => m.length === 1 && m[0] === 'projectPrefs'), 'never the whole map').toBe(false);
    expect(write.mask).toContainEqual(['projectPrefs', cloudId('Local 2'), 'archived']);
  });

  it('within the cap: at 1000 entries a product with none gains none', async () => {
    const full: Prefs = {};
    for (let i = 0; i < 999; i++) full[`x${i}`] = { archived: true };
    seedCloud({ projectOrder: ['c1', 'c2'], projectPrefs: full });
    seedLocal({ l1: { color: 'teal' }, l2: { color: 'pink' } });
    await migrateLocalToCloud('u');
    const after = cloudPrefs();
    expect(Object.keys(after)).toHaveLength(1000);
    expect(after[cloudId('Local 1')], 'Local 1 comes first in this browser\'s order').toEqual({ color: 'teal' });
    expect(after[cloudId('Local 2')]).toBeUndefined();
    expect(Object.keys(after)).toContain('x998');
  });
});

describe('R-7: a retry after an upload that stopped before its settings write', () => {
  async function stoppedThenRetried(between: () => void) {
    seedCloud({ projectOrder: ['c1', 'c2'] });
    seedLocal({ l1: { color: 'teal', archived: true }, l2: { color: 'pink', archived: true } });
    h.fs.refuseWhen(path => (path === SETTINGS ? new Error('lost') : null));
    await expect(migrateLocalToCloud('u')).rejects.toThrow('lost');
    h.fs.refuseWhen(null);
    expect(settings().projectPrefs, 'the stopped upload stored no settings').toBeUndefined();
    between();
    return migrateLocalToCloud('u');
  }

  it('copies the first try\'s colours and archive to the products it skips', async () => {
    const r = await stoppedThenRetried(() => {});
    expect(r.uploadedIds).toEqual([]);
    expect(r.skipped.map(s => s.localId).sort()).toEqual(['l1', 'l2', 'l3']);
    expect(cloudPrefs()).toEqual({
      [cloudId('Local 1')]: { color: 'teal', archived: true },
      [cloudId('Local 2')]: { color: 'pink', archived: true },
    });
  });

  it('only where the cloud has no entry at all: a colour set in the cloud since blocks the local archive', async () => {
    await stoppedThenRetried(() => {
      h.fs.docs.set(SETTINGS, { ...settings(), projectPrefs: { [cloudId('Local 1')]: { color: 'slate' } } });
    });
    expect(cloudPrefs()).toEqual({
      [cloudId('Local 1')]: { color: 'slate' },
      [cloudId('Local 2')]: { color: 'pink', archived: true },
    });
  });

  it('places the skipped products in this browser\'s order after the cloud\'s tiles', async () => {
    await stoppedThenRetried(() => {});
    expect(tiles()).toEqual(['Cloud c1', 'Cloud c2', 'Local 3', 'Local 1', 'Local 2']);
  });

  it('a skipped product the cloud order already holds keeps its place there', async () => {
    await stoppedThenRetried(() => {
      h.fs.docs.set(SETTINGS, { projectOrder: [cloudId('Local 2'), 'c1', 'c2'] });
    });
    expect(tiles()).toEqual(['Local 2', 'Cloud c1', 'Cloud c2', 'Local 3', 'Local 1']);
  });
});

describe('R-7: the next upload, after a removal in the cloud', () => {
  // PR #245 review -01: Unarchive and No color each remove one field, and the emptied entry `{}`
  // stays stored. It is an entry: the next upload must not copy the local archive or colour back.
  it.each(['archived', 'color'] as const)('an %s removed in the cloud since leaves an empty entry, which blocks the copy', async field => {
    seedCloud({ projectOrder: ['c1', 'c2'] });
    seedLocal({ l1: field === 'archived' ? { archived: true } : { color: 'teal' } });
    expect((await migrateLocalToCloud('u')).uploadedIds).toHaveLength(3);
    const id = cloudId('Local 1');
    createFirestoreDriver('u').writePreferences([{ path: ['projectPrefs', id, field], value: REMOVE }]);
    await new Promise(r => setTimeout(r, 300));
    expect(cloudPrefs()[id], 'the removal leaves an empty entry').toEqual({});
    const again = await migrateLocalToCloud('u');
    expect(again.skipped.map(s => s.localId).sort()).toEqual(['l1', 'l2', 'l3']);
    expect(cloudPrefs()[id]).toEqual({});
  });
});

describe('R-6: the upload re-reads the stored order just before its settings write', () => {
  it('another device\'s reorder made while the products went up is kept', async () => {
    seedCloud({ projectOrder: ['c1', 'c2'], exportName: 'Alice' });
    seedLocal({});
    let moved = false;
    h.fs.refuseWhen(path => {
      if (!moved && path.startsWith(PROJECTS)) {
        moved = true;
        h.fs.docs.set(SETTINGS, { ...settings(), projectOrder: ['c2', 'c1'] });
      }
      return null;
    });
    await migrateLocalToCloud('u');
    expect(tiles()).toEqual(['Cloud c2', 'Cloud c1', 'Local 3', 'Local 1', 'Local 2']);
    expect(settings().exportName).toBe('Alice');
  });

  it('R89: an id the stored order holds and the list does not keeps its slot', async () => {
    seedCloud({ projectOrder: ['c1', 'elsewhere', 'c2'] });
    seedLocal({});
    await migrateLocalToCloud('u');
    expect(settings().projectOrder?.slice(0, 3)).toEqual(['c1', 'elsewhere', 'c2']);
    expect(tiles()).toEqual(['Cloud c1', 'Cloud c2', 'Local 3', 'Local 1', 'Local 2']);
  });

  it('a failed re-read falls back to the first read, and the settings still go', async () => {
    seedCloud({ projectOrder: ['c2', 'c1'] });
    seedLocal({ l1: { color: 'teal' } });
    let written = 0;
    h.fs.refuseWhen(path => {
      if (path.startsWith(PROJECTS) && ++written === 3) h.fs.failReads(new Error('offline'));
      return null;
    });
    await migrateLocalToCloud('u');
    h.fs.failReads(null);
    expect(tiles()).toEqual(['Cloud c2', 'Cloud c1', 'Local 3', 'Local 1', 'Local 2']);
    expect(cloudPrefs()).toEqual({ [cloudId('Local 1')]: { color: 'teal' } });
  });
});
