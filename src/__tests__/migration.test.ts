// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';

// v0.55.15 (R67): ported to the masked-write stand-in. The previous mocks answered a get of a missing
// project with "missing" (the rules refuse it) and always listed no cloud products, so they could not
// show what the upload decides from the server list.
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
import { isGuardedLoad } from '../lib/cloudLoadNotices';
import type { ChangeLogEntry, Product } from '../types';

const P = 'spertstorymap_projects/';
beforeEach(() => {
  h.fs.reset();
  localStorage.clear();
});

function createLocalProduct(id: string, name: string): Product {
  return {
    id,
    name,
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 2,
    themes: [],
    releases: [],
    sprints: [],
    sizeMapping: [],
    _changeLog: [],
  };
}

function seedLocalStorage(products: Array<{ id: string; name: string }>) {
  // v0.33.0 namespaced shape. Migration always reads from the 'local'
  // namespace (anonymous-session data) because the user must be signed
  // out at the time pre-migration data was captured.
  const index = products.map(p => ({ id: p.id, name: p.name, updatedAt: new Date().toISOString() }));
  localStorage.setItem('rp:local:products_index', JSON.stringify(index));
  for (const p of products) {
    localStorage.setItem(`rp:local:product_${p.id}`, JSON.stringify(p));
  }
}

// ── migrateLocalToCloud ─────────────────────────────────────────

/** The uploaded documents: every project document the stand-in holds that the seed did not. */
function written(seeded: string[] = []): Record<string, unknown>[] {
  return [...h.fs.docs.entries()].filter(([p]) => p.startsWith(P) && !seeded.includes(p.slice(P.length))).map(([, d]) => d);
}
function writtenNamed(name: string): Record<string, unknown> {
  const d = written().find(x => x.name === name);
  if (!d) throw new Error(`no uploaded document named "${name}"`);
  return d;
}

describe('migrateLocalToCloud', () => {
  it('uploads local products to Firestore, under a new id', async () => {
    const product = createLocalProduct('proj-1', 'My Project');
    seedLocalStorage([product]);

    const result = await migrateLocalToCloud('user-1');

    expect(result.uploadedIds).toEqual(['proj-1']);
    expect(result.skipped).toEqual([]);
    expect(h.fs.docs.has(`${P}proj-1`)).toBe(false);
    // Verify owner and members are set
    const call = writtenNamed('My Project');
    expect(call.owner).toBe('user-1');
    expect(call.members).toEqual({ 'user-1': 'owner' });
  });

  it('uploads what the local read guard leaves, so one bad project does not stop the rest', async () => {
    const bad = { ...createLocalProduct('proj-1', 'Bad'), sprints: {}, _changeLog: {} };
    seedLocalStorage([bad, createLocalProduct('proj-2', 'Good')]);

    const result = await migrateLocalToCloud('user-1');

    expect(result.uploadedIds).toHaveLength(2);
    expect(writtenNamed('Bad').sprints).toEqual([]);
    // "Local data is left in place as a backup": the upload wrote nothing back.
    expect(JSON.parse(localStorage.getItem('rp:local:product_proj-1')!).sprints).toEqual({});
    expect(isGuardedLoad('proj-1')).toBe(false);
  });

  it('skips products that already exist in cloud with user as member', async () => {
    const product = createLocalProduct('proj-1', 'My Project');
    seedLocalStorage([product]);
    // Pre-populate Firestore with existing doc
    h.fs.docs.set(`${P}proj-1`, { ...product, owner: 'user-1', members: { 'user-1': 'owner' } });

    const result = await migrateLocalToCloud('user-1');

    expect(result.uploadedIds).toEqual([]);
    expect(result.skipped).toEqual([{ localId: 'proj-1', name: 'My Project', cloudName: 'My Project' }]);
    expect(written(['proj-1'])).toHaveLength(0);
  });

  it('generates new ID if doc exists but user is not a member', async () => {
    const product = createLocalProduct('proj-1', 'My Project');
    seedLocalStorage([product]);
    // Pre-populate with someone else's project
    h.fs.docs.set(`${P}proj-1`, { ...product, owner: 'other-user', members: { 'other-user': 'owner' } });

    const result = await migrateLocalToCloud('user-1');

    expect(result.uploadedIds).toEqual(['proj-1']);
    expect(result.skipped).toEqual([]);
    // Someone else's document is untouched; the upload is a new document.
    expect(h.fs.docs.get(`${P}proj-1`)!.owner).toBe('other-user');
    expect(written(['proj-1'])).toHaveLength(1);
  });

  it('appends cloud-migration to changelog, with the local id as its source', async () => {
    const product = createLocalProduct('proj-1', 'My Project');
    product._changeLog = [{ t: 1000, op: 'create', entity: 'product' }] as ChangeLogEntry[];
    seedLocalStorage([product]);

    await migrateLocalToCloud('user-1');

    const log = writtenNamed('My Project')._changeLog as ChangeLogEntry[];
    expect(log.length).toBe(2);
    expect(log[1]?.op).toBe('cloud-migration');
    expect(log[1]?.uid).toBe('user-1');
    expect(log[1]?.source).toBe('proj-1');
    expect(Object.keys(log[1] ?? {}).sort()).toEqual(['op', 'seq', 'source', 't', 'uid']);
  });

  it('migrates preferences', async () => {
    seedLocalStorage([]);
    // v0.33.0 namespaced shape — pre-migration prefs live at rp:local:preferences.
    localStorage.setItem('rp:local:preferences', JSON.stringify({ exportName: 'Alice' }));

    await migrateLocalToCloud('user-1');

    // v0.55.14 (R-6, R64): one masked write, the tile order plus a name the cloud lacks.
    expect(h.fs.docs.get('spertstorymap_settings/user-1')).toEqual({ projectOrder: [], exportName: 'Alice' });
  });

  it('leaves local data in place as backup', async () => {
    const product = createLocalProduct('proj-1', 'My Project');
    seedLocalStorage([product]);

    await migrateLocalToCloud('user-1');

    // Local data should still be there (v0.33.0 namespaced shape)
    expect(localStorage.getItem('rp:local:product_proj-1')).toBeTruthy();
    expect(localStorage.getItem('rp:local:products_index')).toBeTruthy();
  });
});

// ── migrateCloudToLocal removed (v0.15.0) ──────────────────────
// Cloud is now source of truth. Use "Download All as JSON" for data portability.
