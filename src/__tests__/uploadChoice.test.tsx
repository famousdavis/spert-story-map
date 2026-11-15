// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
/**
 * v0.56.1 (R71, R-4): choosing Cloud with Local products lists them, none ticked, and uploads only the
 * ticked ones. The real StorageSection over the real migrateLocalToCloud and the masked-write stand-in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  fs: null as unknown as ReturnType<typeof import('./fixtures/mergeFieldsFirestore').createMergeFieldsFirestore>,
  switchMode: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
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
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'u', displayName: 'Una', email: 'u@example.com' }, firebaseAvailable: true }) }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ driver: null, mode: 'local', switchMode: h.switchMode, isCloudAvailable: true }) }));
vi.mock('../hooks/useSignInWithTosGate', () => ({ useSignInWithTosGate: () => ({}) }));

import StorageSection from '../components/settings/StorageSection';
import { uploadRoutes } from './fixtures/uploadRoutes';
import { createNewProduct, saveProductImmediate } from '../lib/storage';

const r = uploadRoutes(h.fs);
const SETTINGS = 'spertstorymap_settings/u';

beforeEach(() => { h.fs.reset(); localStorage.clear(); r.start(); h.switchMode = vi.fn(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); r.stop(); vi.restoreAllMocks(); });

function openList() {
  render(<MemoryRouter><StorageSection /></MemoryRouter>);
  fireEvent.click(screen.getByRole('radio', { name: 'Cloud (sync across devices)' }));
  return screen.getByRole('form', { name: 'Upload Local Products' });
}
const box = (dialog: HTMLElement, name: string) => within(dialog).getByRole('checkbox', { name: new RegExp(`^${name}`) });
const result = (start: string) => screen.getByText((t, el) => el?.tagName === 'P' && t.startsWith(start));
const uploadedNames = () => r.owned().map(d => d.name).sort();

describe('the upload list (R-4)', () => {
  it('lists every Local product, archived ones too, each with when it was last edited, none ticked', async () => {
    await r.create('A');
    const b = await r.create('B');
    localStorage.setItem('rp:u:preferences', JSON.stringify({ projectPrefs: { [b]: { archived: true } } }));
    const dialog = openList();
    expect(within(dialog).getByText('These products are stored in this browser, and anyone who uses it can see them. Tick the ones to upload to your cloud account. The rest stay in this browser.')).toBeTruthy();
    for (const name of ['A', 'B']) expect((box(dialog, name) as HTMLInputElement).checked).toBe(false);
    expect(within(dialog).getAllByText(/^Last edited /)).toHaveLength(2);
    expect(within(dialog).getByRole('checkbox', { name: 'Select all' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Use Cloud without uploading' })).toBeTruthy();
  });

  it('nothing ticked: the cloud is checked and the mode switches; nothing is uploaded and the settings are not written', async () => {
    await r.create('A');
    const dialog = openList();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Use Cloud without uploading' })); });
    expect(h.switchMode).toHaveBeenCalledWith('cloud');
    expect(uploadedNames()).toEqual([]);
    expect(h.fs.docs.has(SETTINGS)).toBe(false);
  });

  it('a subset: only the ticked products go up; the result line names the ones that stayed; the clear names what it removes', async () => {
    const a = await r.create('A');
    const b = await r.create('B');
    await r.create('C');
    const dialog = openList();
    fireEvent.click(box(dialog, 'B'));
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Upload 1 product' })); });
    expect(uploadedNames()).toEqual(['B']);
    expect(result('Uploaded 1 product').textContent).toBe('Uploaded 1 product to the cloud. Not ticked, so kept in this browser only: “A”, “C”.');
    expect(screen.getByText('Remove “B” from this browser? It is now in your cloud account. Everyone who uses this browser will no longer have it here. The products that were not uploaded stay in this browser.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Uploaded Copies' }));
    expect(localStorage.getItem(`rp:local:product_${b}`)).toBeNull();
    expect(localStorage.getItem(`rp:local:product_${a}`)).not.toBeNull();
  });

  it('recognition still counts every Local product: a ticked product sharing its origin with an unticked one is not taken for an earlier upload', async () => {
    const t = createNewProduct('Template');
    saveProductImmediate(t);
    saveProductImmediate({ ...t, id: 'classmate-copy', name: 'Template (classmate)' });
    // An owned cloud product with the same origin and no upload record: rung (c) would skip `t`
    // if the shared-origin check saw only the ticked product.
    h.fs.docs.set('spertstorymap_projects/c1', { ...t, id: undefined, name: 'Cloud T', owner: 'u', members: { u: 'owner' }, _changeLog: [] });
    const dialog = openList();
    fireEvent.click(box(dialog, 'Template$'));
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Upload 1 product' })); });
    expect(result('Uploaded 1 product').textContent).toBe('Uploaded 1 product to the cloud. Not ticked, so kept in this browser only: “Template (classmate)”.');
  });

  it('R95: tile colour, archive and order fall back per product to this browser’s signed-out settings; the export name does not', async () => {
    const a = await r.create('A');
    const b = await r.create('B');
    const c = await r.create('C');
    localStorage.setItem('rp:u:preferences', JSON.stringify({ projectOrder: [a], projectPrefs: { [a]: { color: 'teal' } } }));
    localStorage.setItem('rp:local:preferences', JSON.stringify({
      exportName: 'Signed-out Ana', exportId: 'A-1', projectOrder: [c, b, a],
      projectPrefs: { [a]: { color: 'pink' }, [b]: { color: 'pink', archived: true } },
    }));
    const dialog = openList();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select all' }));
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Upload 3 products' })); });
    const cloudIdOf = (name: string) => r.owned().find(d => d.name === name)?.id ?? `missing ${name}`;
    const doc = h.fs.docs.get(SETTINGS) as { projectOrder?: string[]; projectPrefs?: Record<string, unknown>; exportName?: string; exportId?: string };
    expect(doc.projectOrder).toEqual([cloudIdOf('A'), cloudIdOf('C'), cloudIdOf('B')]);
    expect(doc.projectPrefs).toEqual({ [cloudIdOf('A')]: { color: 'teal' }, [cloudIdOf('B')]: { color: 'pink', archived: true } });
    expect({ n: doc.exportName, i: doc.exportId }).toEqual({ n: undefined, i: undefined });
  });

  it('the export name, identifier and caution switch come from the signed-in person’s own settings, never this browser’s signed-out ones', async () => {
    await r.create('A');
    localStorage.setItem('rp:local:preferences', JSON.stringify({ exportName: 'Signed-out Ana', exportId: 'A-1', suppressLocalStorageWarning: true }));
    let dialog = openList();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select all' }));
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Upload 1 product' })); });
    const first = h.fs.docs.get(SETTINGS) as Record<string, unknown>;
    expect({ n: first.exportName, i: first.exportId, s: first.suppressLocalStorageWarning }).toEqual({ n: undefined, i: undefined, s: undefined });

    cleanup();
    await r.create('B');
    localStorage.setItem('rp:u:preferences', JSON.stringify({ exportName: 'Una', exportId: 'U-1', suppressLocalStorageWarning: false }));
    dialog = openList();
    fireEvent.click(box(dialog, 'B'));
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Upload 1 product' })); });
    const second = h.fs.docs.get(SETTINGS) as Record<string, unknown>;
    expect({ n: second.exportName, i: second.exportId, s: second.suppressLocalStorageWarning }).toEqual({ n: 'Una', i: 'U-1', s: false });
  });
});
