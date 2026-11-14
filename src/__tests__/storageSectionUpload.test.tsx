// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.55.15 (R-3, R72): the real `StorageSection` over the real `migrateLocalToCloud` and the
 * masked-write stand-in. The upload says what it did, with its status as an explicit value, and the
 * clear offered after it removes only the products that upload sent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
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

const r = uploadRoutes(h.fs);
const KEPT = 'This browser still has its own copy of each, which may differ from the cloud version.';
const ASK = 'Your uploaded products are now in the cloud. Clear their copies from this browser?';
const STAY = 'The products that were not uploaded stay in this browser.';

beforeEach(() => { h.fs.reset(); localStorage.clear(); r.start(); h.switchMode = vi.fn(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); r.stop(); vi.restoreAllMocks(); });

async function uploadThroughTheDialog() {
  render(<MemoryRouter><StorageSection /></MemoryRouter>);
  fireEvent.click(screen.getByRole('radio', { name: 'Cloud (sync across devices)' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Upload' })); });
}
const result = (start: string) => screen.getByText((t, el) => el?.tagName === 'P' && t.startsWith(start));
const localIndex = () => JSON.parse(localStorage.getItem('rp:local:products_index') ?? '[]').map((e: { name: string }) => e.name);

describe('StorageSection upload', () => {
  it('everything uploaded: the ok line, then a clear that removes the uploaded products', async () => {
    const a = await r.create('A');
    await uploadThroughTheDialog();
    const line = result('Uploaded 1 product to the cloud.');
    expect(line.textContent).toBe('Uploaded 1 product to the cloud.');
    expect(line.className).toContain('text-green-600');
    expect(screen.getByText(ASK)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Local Data' }));
    expect(localStorage.getItem(`rp:local:product_${a}`)).toBeNull();
    expect(localIndex()).toEqual([]);
  });

  it('a product edited after its upload is named, kept, and not removed by the clear', async () => {
    const a = await r.create('A');
    await r.upload();
    r.addWork(a);
    const b = await r.create('B');
    await uploadThroughTheDialog();
    const line = result('Uploaded 1 product to the cloud.');
    expect(line.textContent).toBe(`Uploaded 1 product to the cloud. Already in the cloud, so not uploaded again: “A”. ${KEPT}`);
    expect(line.className).toContain('text-amber-700');
    expect(screen.getByText(`${ASK} ${STAY}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Local Data' }));
    expect(localStorage.getItem(`rp:local:product_${b}`)).toBeNull();
    expect(localStorage.getItem(`rp:local:product_${a}`)).not.toBeNull();
    expect(localIndex()).toEqual(['A']);
  });

  it('nothing new to upload: a notice, and no clear offer', async () => {
    await r.create('A');
    await r.upload();
    await uploadThroughTheDialog();
    const line = result('No new products to upload.');
    expect(line.className).toContain('text-amber-700');
    expect(screen.queryByText(ASK, { exact: false })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear Local Data' })).toBeNull();
  });

  it('an unreadable product is counted and stays; the rest are uploaded', async () => {
    await r.create('A');
    localStorage.setItem('rp:local:products_index', JSON.stringify([...JSON.parse(localStorage.getItem('rp:local:products_index')!), { id: 'gone', name: 'Gone' }]));
    await uploadThroughTheDialog();
    expect(result('Uploaded 1 product').textContent).toBe('Uploaded 1 product to the cloud. 1 product could not be read and was not uploaded.');
    expect(screen.getByText(`${ASK} ${STAY}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Local Data' }));
    expect(localIndex()).toEqual(['Gone']);
  });

  it('an upload that stops: the error line, no mode switch and no clear offer', async () => {
    await r.create('A'); await r.create('B');
    let writes = 0;
    h.fs.refuseWhen(p => (p.startsWith('spertstorymap_projects/') && ++writes === 2 ? new Error('network') : null));
    await uploadThroughTheDialog();
    const line = result('The upload stopped');
    expect(line.textContent).toBe('The upload stopped before it finished. Products it had already uploaded are in the cloud, and uploading again will not add them twice.');
    expect(line.className).toContain('text-red-500');
    expect(h.switchMode).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Clear Local Data' })).toBeNull();
  });
});
