// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.55.15 (R67): the ways a local product reaches an upload, over the masked-write stand-in
 * (`mergeFieldsFirestore`). The test file mocks `firebase/firestore` with the stand-in and passes it
 * in; everything else is the real local driver, import, copy and clone. A clock faked for `Date`
 * only (no timers) gives each product its own `createdAt` unless a route shares one on purpose.
 */
import { vi } from 'vitest';
import type { createMergeFieldsFirestore } from './mergeFieldsFirestore';
import {
  createNewProduct, duplicateProduct, appendChangeLogEntry, loadProduct, saveProductImmediate, clearAllLocalProducts,
} from '../../lib/storage';
import { createLocalStorageDriver } from '../../lib/storageDriver';
import { parseImportFile, detectConflicts, buildDefaultDecisions, applyImport } from '../../lib/import-utils';
import { migrateLocalToCloud } from '../../lib/migration';
import type { Product } from '../../types';

type Fs = ReturnType<typeof createMergeFieldsFirestore>;
type Doc = Record<string, unknown>;
export const U = 'u';
export const O = 'o';
const P = 'spertstorymap_projects/';

export function uploadRoutes(fs: Fs) {
  const drv = () => createLocalStorageDriver();
  let clock = Date.parse('2026-11-14T12:00:00.000Z');
  const tick = () => { clock += 1000; vi.setSystemTime(clock); };
  const local = (id: string) => {
    const p = loadProduct(id, 'local', false);
    if (!p) throw new Error(`no local product ${id}`);
    return p;
  };
  const owned = (): (Doc & { id: string })[] => [...fs.docs.entries()].filter(([p, d]) => p.startsWith(P) && d.owner === U).map(([p, d]) => ({ ...d, id: p.slice(P.length) }));
  const doc = (id: string) => fs.docs.get(P + id) as Doc;

  return {
    tick, local, owned, doc,
    start() { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(clock); },
    stop() { vi.useRealTimers(); },
    upload: () => migrateLocalToCloud(U),
    /** A product made with New Product; `structural` adds a theme, whose changelog entry carries a `seq`. */
    async create(name: string, structural = true): Promise<string> {
      tick();
      let p = createNewProduct(name);
      if (structural) p = { ...p, _changeLog: appendChangeLogEntry(p, { op: 'add', entity: 'theme', id: 't1' }) };
      await drv().createProduct(p, { throwOnError: true });
      return p.id;
    },
    /** A structural edit made in this browser (one changelog entry with a `seq`). */
    addWork(id: string) {
      const p = local(id);
      saveProductImmediate({ ...p, description: `${p.description}+`, _changeLog: appendChangeLogEntry(p, { op: 'add', entity: 'rib', id: `r${clock}` }) });
    },
    rename(id: string, name: string) { saveProductImmediate({ ...local(id), name }); },
    async clone(id: string): Promise<string> {
      tick();
      const dup = { ...duplicateProduct(local(id)), name: `${local(id).name} (Copy)` };
      await drv().createProduct(dup);
      return dup.id;
    },
    /** A second local product holding the same `_originRef` and `createdAt` (as copies made in one millisecond do). */
    async twin(id: string, structural = true): Promise<string> {
      const p = local(id);
      const t: Product = { ...p, id: `twin-${id}`, name: `${p.name} twin` };
      if (structural) t._changeLog = appendChangeLogEntry(p, { op: 'add', entity: 'theme', id: 't2' });
      await drv().createProduct(t, { throwOnError: true });
      return t.id;
    },
    localExport: (id: string) => JSON.stringify({ ...local(id), _storageRef: 'ws-export' }),
    cloudExport(cid: string) {
      const { owner: _o, members: _m, ...rest } = doc(cid);
      return JSON.stringify({ id: cid, ...rest, _storageRef: 'ws-export' });
    },
    async importFile(text: string, action?: 'copy' | 'replace' | 'skip') {
      tick();
      const parsed = parseImportFile(text);
      if (!parsed.ok) throw new Error(parsed.error);
      const existing = await drv().loadProductIndex() as unknown as Product[];
      const decisions = buildDefaultDecisions(detectConflicts(parsed.products, existing)).map(d => (action ? { ...d, action } : d));
      return applyImport(drv(), { products: parsed.products, fileName: 'f.json' }, decisions);
    },
    clear: () => clearAllLocalProducts('local'),
    /** What the cloud `replaceProduct` stores (measured on the emulator): the file's content and log, the stored owner,
     *  members, `createdAt` and `_originRef`. */
    replaceOnto(cid: string, text: string) {
      const parsed = parseImportFile(text);
      if (!parsed.ok || !parsed.products[0]) throw new Error('parse');
      const { id: _id, ...file } = parsed.products[0];
      const stored = doc(cid);
      fs.docs.set(P + cid, { ...file, owner: stored.owner, members: stored.members, createdAt: stored.createdAt, _originRef: stored._originRef });
    },
    /** A cloud document as an upload before v0.55.15 wrote it: a `cloud-migration` entry with no `source`. */
    oldUpload(id: string, cid = `old-${id}`) {
      const { id: _id, ...rest } = local(id);
      fs.docs.set(P + cid, { ...rest, _changeLog: appendChangeLogEntry(rest, { op: 'cloud-migration', uid: U }), owner: U, members: { [U]: 'owner' } });
      return cid;
    },
    put(id: string, data: Doc) { fs.docs.set(P + id, data); },
    remove(cid: string) { fs.docs.delete(P + cid); },
  };
}
