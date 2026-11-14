// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.55.15 (R67): a second upload adds nothing that an earlier upload already put in the cloud.
 * Every route counts the documents the user owns after the uploads, through the real
 * `migrateLocalToCloud` over the masked-write stand-in (a get of a missing project is refused, as
 * the rules refuse it). At v0.55.14 a second upload added every product again.
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

import { uploadRoutes, U, O } from './fixtures/uploadRoutes';

const r = uploadRoutes(h.fs);
beforeEach(() => { h.fs.reset(); localStorage.clear(); r.start(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { r.stop(); vi.restoreAllMocks(); });
const twice = async () => { await r.upload(); await r.upload(); };
const lastOwnedId = () => { const all = r.owned(); return all[all.length - 1]!.id; };

describe('a second upload adds nothing already uploaded', () => {
  it('must-find control: a product created here, uploaded twice, is in the cloud once', async () => {
    await r.create('A');
    await twice();
    expect(r.owned()).toHaveLength(1);
  });

  it('a product with no structural edit (no `seq` entry), uploaded twice, is in the cloud once', async () => {
    await r.create('A', false);
    await twice();
    expect(r.owned()).toHaveLength(1);
  });

  it('a product and its clone, uploaded twice, are in the cloud once each', async () => {
    await r.clone(await r.create('A'));
    await twice();
    expect(r.owned()).toHaveLength(2);
  });

  it('a product edited after its upload is not uploaded again', async () => {
    const id = await r.create('A');
    await r.upload();
    r.addWork(id);
    await r.upload();
    expect(r.owned()).toHaveLength(1);
  });

  it("someone else's export, imported and uploaded twice, is in the cloud once", async () => {
    r.put('theirs', { name: 'Theirs', owner: O, members: { [O]: 'owner' }, createdAt: '2026-01-01T00:00:00.000Z', _originRef: 'ws-o', schemaVersion: 2, themes: [], releases: [], sprints: [], sizeMapping: [], _changeLog: [{ t: 1, op: 'create', entity: 'product' }] });
    await r.importFile(r.cloudExport('theirs'));
    await twice();
    expect(r.owned()).toHaveLength(1);
  });

  it('a file imported, and imported again as a copy, uploaded twice: once each', async () => {
    const t = r.localExport(await r.create('F'));
    r.clear();
    await r.importFile(t);
    await r.importFile(t, 'copy');
    await twice();
    expect(r.owned()).toHaveLength(2);
  });

  it('its own cloud export, re-imported after the original is cleared, is not uploaded (by id)', async () => {
    await r.create('A');
    await r.upload();
    const t = r.cloudExport(lastOwnedId());
    r.clear();
    await r.importFile(t);
    await r.upload();
    expect(r.owned()).toHaveLength(1);
  });

  it('its own cloud export, re-imported after the original is renamed, adds nothing', async () => {
    const id = await r.create('A');
    await r.upload();
    r.rename(id, 'A old');
    await r.importFile(r.cloudExport(lastOwnedId()));
    await r.upload();
    expect(r.owned()).toHaveLength(1);
  });

  it('its own cloud export, re-imported after the cloud document is gone, is uploaded', async () => {
    await r.create('A');
    await r.upload();
    const cid = lastOwnedId();
    const t = r.cloudExport(cid);
    r.clear();
    await r.importFile(t);
    r.remove(cid);
    await r.upload();
    expect(r.owned()).toHaveLength(1);
  });

  it('an upload stopped after the first product, retried: 3 products, 3 documents', async () => {
    await r.create('A'); await r.create('B'); await r.create('C');
    let writes = 0;
    h.fs.refuseWhen(p => (p.startsWith('spertstorymap_projects/') && ++writes === 2 ? new Error('network') : null));
    await expect(r.upload()).rejects.toThrow('network');
    h.fs.refuseWhen(null);
    await r.upload();
    expect(r.owned()).toHaveLength(3);
  });

  it('a template re-imported after the clear, with new work, is uploaded (F5)', async () => {
    const tid = await r.create('Template');
    const t = r.localExport(tid);
    r.clear();
    await r.importFile(t); r.addWork(tid);
    await r.upload();
    r.clear();
    await r.importFile(t); r.addWork(tid);
    await r.upload();
    expect(r.owned()).toHaveLength(2);
  });

  it("a teammate's copy holding this user's upload record does not stop an upload (F2b)", async () => {
    await r.create('A');
    await r.upload();
    const cid = lastOwnedId();
    r.put('team', { ...r.doc(cid), name: 'A (Copy)', owner: O, members: { [O]: 'owner', [U]: 'viewer' }, createdAt: '2026-02-02T00:00:00.000Z', _originRef: 'ws-o' });
    r.remove(cid);
    await r.upload();
    expect(r.owned()).toHaveLength(1);
  });

  it('a replace import onto the uploaded document removes the record; the product is still recognised (F3)', async () => {
    const id = await r.create('A');
    await r.upload();
    const cid = lastOwnedId();
    r.replaceOnto(cid, r.localExport(id));
    expect((r.doc(cid)._changeLog as { op: string }[]).some(e => e.op === 'cloud-migration')).toBe(false);
    await r.upload();
    expect(r.owned()).toHaveLength(1);
  });

  it('after a replace import, a product whose creation time and origin another local product shares is uploaded again', async () => {
    const id = await r.create('A');
    await r.twin(id);
    await r.upload();
    const cid = r.owned().find(d => d.name === 'A')!.id;
    r.replaceOnto(cid, r.localExport(id));
    await r.upload();
    expect(r.owned()).toHaveLength(3);
  });
});

describe('uploads made before v0.55.15 (no `source` in the record)', () => {
  it('a product with no structural edit is recognised by its creation time and origin', async () => {
    r.oldUpload(await r.create('A', false));
    await r.upload();
    expect(r.owned()).toHaveLength(1);
  });

  it('a product with a structural edit is recognised by its history', async () => {
    r.oldUpload(await r.create('A'));
    await r.upload();
    expect(r.owned()).toHaveLength(1);
  });

  it('a local import-as-copy of its export is not taken for it (the copy has its own creation time)', async () => {
    const id = await r.create('A');
    r.oldUpload(id);
    await r.importFile(r.localExport(id), 'copy');
    await r.upload();
    expect(r.owned()).toHaveLength(2);
  });
});

describe('what recognition does not accept', () => {
  it('two local products sharing a creation time and origin, uploaded twice, are in the cloud twice, not four times', async () => {
    await r.twin(await r.create('A'));
    await twice();
    expect(r.owned()).toHaveLength(2);
  });

  it('two such products with no `seq` entry, uploaded twice, are in the cloud twice', async () => {
    await r.twin(await r.create('A', false), false);
    await twice();
    expect(r.owned()).toHaveLength(2);
  });

  it('its own cloud export imported as a copy, beside the original, is uploaded once (the copy holds the record)', async () => {
    await r.create('A');
    await r.upload();
    await r.importFile(r.cloudExport(lastOwnedId()), 'copy');
    await twice();
    expect(r.owned()).toHaveLength(2);
  });

  it("an upload record whose `source` names another local product does not skip this one", async () => {
    const p = r.local(await r.create('A'));
    r.put('other', { name: 'Other', owner: U, members: { [U]: 'owner' }, _changeLog: [...p._changeLog!, { op: 'cloud-migration', uid: U, source: 'another-local-id', t: 2, seq: 'q1' }] });
    await r.upload();
    expect(r.owned()).toHaveLength(2);
  });

  it('an upload record written by another user does not skip', async () => {
    const id = await r.create('A');
    const p = r.local(id);
    r.put('other', { name: 'Other', owner: U, members: { [U]: 'owner' }, _changeLog: [...p._changeLog!, { op: 'cloud-migration', uid: O, source: id, t: 2, seq: 'q1' }] });
    await r.upload();
    expect(r.owned()).toHaveLength(2);
  });

  it("someone else's document with this product's creation time and origin does not skip it", async () => {
    const p = r.local(await r.create('A', false));
    r.put('theirs', { name: 'T', owner: O, members: { [O]: 'owner', [U]: 'viewer' }, createdAt: p.createdAt, _originRef: p._originRef, _changeLog: [] });
    await r.upload();
    expect(r.owned()).toHaveLength(1);
  });

  it("someone else's document holding this user's record with this product's history does not skip it", async () => {
    const id = await r.create('A');
    const p = r.local(id);
    r.put('theirs', { name: 'T', owner: O, members: { [O]: 'owner', [U]: 'viewer' }, createdAt: 'x', _originRef: 'x', _changeLog: [...p._changeLog!, { op: 'cloud-migration', uid: U, source: id, t: 2, seq: 'q1' }] });
    await r.upload();
    expect(r.owned()).toHaveLength(1);
  });
});

describe('the server list is read defensively', () => {
  it.each([
    ['a string', 'oops'],
    ['a string and a null entry', ['s', null]],
  ])('a `_changeLog` that is %s, in an owned and a shared document, does not stop the upload', async (_name, log) => {
    r.put('raw-own', { name: 'Raw own', owner: U, members: { [U]: 'owner' }, _changeLog: log });
    r.put('raw-team', { name: 'Raw team', owner: O, members: { [O]: 'owner', [U]: 'editor' }, _changeLog: log });
    await r.create('A');
    await twice();
    expect(r.owned().filter(d => d.name === 'A')).toHaveLength(1);
  });
});
