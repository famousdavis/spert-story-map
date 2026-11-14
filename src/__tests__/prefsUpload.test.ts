// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.55.14 R-6 (R63, R64): uploading local products keeps the cloud's tile order and settings.
 * The real `migrateLocalToCloud` over the masked-write stand-in, whose get of a missing project is
 * refused as the rules refuse it, so every uploaded product gets a new id (as in production).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { sortByOrder } from '../lib/sortByOrder';

const SETTINGS = 'spertstorymap_settings/u';
const cloudProduct = (name: string, members: Record<string, string> = { u: 'owner' }) => ({ name, members, owner: Object.keys(members)[0] });
const localProduct = (id: string, name: string) => ({ id, name, description: '', createdAt: 'x', updatedAt: 'x', schemaVersion: 2, themes: [], releases: [], sprints: [], sizeMapping: [], _changeLog: [] });

function seedCloud(settings: Record<string, unknown> | null) {
  // ids chosen so the query's id order is not the stored order; t1 is shared with u; x9 is not u's
  const docs: Record<string, ReturnType<typeof cloudProduct>> = {
    c3: cloudProduct('Cloud 3'), c1: cloudProduct('Cloud 1'), c2: cloudProduct('Cloud 2'),
    t1: cloudProduct('Team 1', { other: 'owner', u: 'editor' }), x9: cloudProduct('Not mine', { other: 'owner' }),
  };
  for (const [id, d] of Object.entries(docs)) h.fs.docs.set(`spertstorymap_projects/${id}`, d);
  if (settings) h.fs.docs.set(SETTINGS, settings);
}
function seedLocal(prefs: Record<string, unknown>) {
  const ps = [localProduct('l1', 'Local 1'), localProduct('l2', 'Local 2'), localProduct('l3', 'Local 3')];
  localStorage.setItem('rp:local:products_index', JSON.stringify(ps.map(p => ({ id: p.id, name: p.name }))));
  for (const p of ps) localStorage.setItem(`rp:local:product_${p.id}`, JSON.stringify(p));
  localStorage.setItem('rp:local:preferences', JSON.stringify(prefs));
}
/** The dashboard's tiles: every product u is a member of, sorted by the stored order. */
function tiles(): string[] {
  const order = h.fs.docs.get(SETTINGS)?.projectOrder as string[] | undefined;
  const mine = [...h.fs.docs.entries()].filter(([p, d]) => p.startsWith('spertstorymap_projects/') && (d.members as Record<string, string>).u)
    .sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, d]) => ({ id: p.split('/').pop()!, name: d.name as string }));
  return sortByOrder(mine, order).map(t => t.name);
}
const LOCAL_PREFS = { projectOrder: ['l3', 'l1'], exportName: 'Bob Jones', exportId: 'UF-9999', suppressLocalStorageWarning: true };
const UPLOADED_IN_LOCAL_TILE_ORDER = ['Local 3', 'Local 1', 'Local 2'];

beforeEach(() => { h.fs.reset(); localStorage.clear(); });

describe('the upload keeps the cloud tile order and adds the uploaded products after it', () => {
  it.each([
    ['a cloud order that leaves products unlisted', { projectOrder: ['c2', 'gone'] }],
    ['no projectOrder in the cloud', { exportName: 'Alice' }],
    ['no settings document at all', null],
  ])('%s', async (_name, settings) => {
    seedCloud(settings);
    seedLocal(LOCAL_PREFS);
    const before = tiles();
    const r = await migrateLocalToCloud('u');
    const after = tiles();
    expect(r.uploaded).toBe(3);
    expect(after.slice(0, 4)).toEqual(before);
    expect(after.slice(4)).toEqual(UPLOADED_IN_LOCAL_TILE_ORDER);
    // every uploaded product gets a new id (the get of a missing project is refused)
    expect([...h.fs.docs.keys()].some(k => /\/l[123]$/.test(k))).toBe(false);
  });
});

describe('R64: the cloud keeps the settings it has', () => {
  it('a cloud name and identifier are kept; a blank one is filled from this browser; a local blank never overwrites', async () => {
    seedCloud({ exportName: 'Alice Smith', exportId: '   ', suppressLocalStorageWarning: false });
    seedLocal({ ...LOCAL_PREFS, exportName: '' });
    await migrateLocalToCloud('u');
    expect(h.fs.docs.get(SETTINGS)).toMatchObject({ exportName: 'Alice Smith', exportId: 'UF-9999', suppressLocalStorageWarning: false });
  });

  it('a local blank name never overwrites a cloud one, and a missing cloud switch is filled', async () => {
    seedCloud({ exportName: 'Alice Smith' });
    seedLocal({ exportName: '  ', suppressLocalStorageWarning: true });
    await migrateLocalToCloud('u');
    expect(h.fs.docs.get(SETTINGS)).toMatchObject({ exportName: 'Alice Smith', suppressLocalStorageWarning: true });
    expect('exportId' in (h.fs.docs.get(SETTINGS) ?? {})).toBe(false);
  });

  it('nothing is uploaded under _hasUploadedToCloud', async () => {
    seedCloud(null);
    seedLocal({ ...LOCAL_PREFS, _hasUploadedToCloud: true });
    await migrateLocalToCloud('u');
    expect('_hasUploadedToCloud' in (h.fs.docs.get(SETTINGS) ?? {})).toBe(false);
  });
});

describe('reads that fail stop the upload before any product is written', () => {
  it('offline (reads from cache only): nothing is written', async () => {
    seedCloud({ projectOrder: ['c2'] });
    seedLocal(LOCAL_PREFS);
    h.fs.setOffline(true);
    await expect(migrateLocalToCloud('u')).rejects.toThrow();
    expect(h.fs.writes).toHaveLength(0);
    expect(h.fs.docs.get(SETTINGS)).toEqual({ projectOrder: ['c2'] });
  });
});
