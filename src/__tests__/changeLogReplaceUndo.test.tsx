// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
// R73 v0.56.2, R-4 (R101, O52). An import that replaces a product clears undo and redo in the tab that
// made it, so Ctrl+Z on the Map brings nothing back and no save writes a pre-import entry. Through the
// real `useProduct`, `DataSection`, `StoryMapView` and driver (fixtures/productHost's undo is a no-op).
// The cloud leg runs the real Firestore driver over a stubbed SDK.
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import StoryMapView from '../pages/StoryMapView';
import DataSection from '../components/settings/DataSection';
import { useProduct } from '../hooks/useProduct';
import { createLocalStorageDriver } from '../lib/storageDriver';
import { createFirestoreDriver } from '../lib/firestoreDriver';
import { appendChangeLogEntry } from '../lib/storage';
import type { ChangeLogEntry, Product, ProductUpdater, StorageDriver } from '../types';
import { fileLog, fileProduct } from './fixtures/changeLogFiles';

const UID = 'me';
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockTxSet = vi.fn();
let storedDoc: Record<string, unknown> = {};

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  collection: (_db: unknown, col: string) => ({ col }),
  query: (...args: unknown[]) => ({ args }),
  where: (...args: unknown[]) => ({ args }),
  getDoc: (...a: unknown[]) => mockGetDoc(...a),
  getDocs: vi.fn(),
  setDoc: (...a: unknown[]) => mockSetDoc(...a),
  updateDoc: (...a: unknown[]) => mockUpdateDoc(...a),
  deleteDoc: vi.fn(),
  deleteField: () => ({ _deleteField: true }),
  onSnapshot: () => () => {},
  arrayUnion: (...args: unknown[]) => ({ _arrayUnion: args }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) =>
    fn({ get: async () => docSnap('p1', storedDoc), set: (...a: unknown[]) => mockTxSet(...a) }),
  FieldPath: class { constructor(..._s: string[]) {} },
}));
vi.mock('../lib/firebase', () => ({ db: {}, isFirebaseAvailable: false, auth: null, functionsInstance: null }));

let storage: { driver: StorageDriver; mode: 'local' | 'cloud'; storageReady: boolean };
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage }));

function docSnap(id: string, data: Record<string, unknown>) {
  return { id, data: () => structuredClone(data), exists: () => true, metadata: { hasPendingWrites: false } };
}

const bridge: { product: Product | null; update: ((u: ProductUpdater) => void) | null } = { product: null, update: null };

function Host({ driver }: { driver: StorageDriver }) {
  const { product, updateProduct, undo, redo } = useProduct('p1');
  useEffect(() => { bridge.product = product; bridge.update = updateProduct; });
  if (!product) return null;
  return (
    <>
      <DataSection product={product} driver={driver} updateProduct={updateProduct} />
      <Routes>
        <Route element={<Outlet context={{ product, updateProduct, undo, redo }} />}>
          <Route path="*" element={<StoryMapView />} />
        </Route>
      </Routes>
    </>
  );
}

const name = () => bridge.product?.name;
const key = (init: KeyboardEventInit) => act(() => { fireEvent.keyDown(document.body, init); });
const editTo = (to: string) => act(() => {
  bridge.update?.(p => ({ ...p, name: to, _changeLog: appendChangeLogEntry(p, { op: 'update', entity: 'product' }) }));
});

async function mountAndImport(driver: StorageDriver) {
  render(<MemoryRouter><Host driver={driver} /></MemoryRouter>);
  await waitFor(() => expect(name()).toBe('Before'));
  editTo('Edited');
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File([JSON.stringify(fileProduct('x', 'From file', 300))], 'f.json'));
  await userEvent.click(await screen.findByRole('button', { name: /replace all data/i }));
  await waitFor(() => expect(name()).toBe('From file'));
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  localStorage.clear();
  mockGetDoc.mockReset(); mockSetDoc.mockReset(); mockUpdateDoc.mockReset(); mockTxSet.mockReset();
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); bridge.product = null; bridge.update = null; });

describe('after a Data replace, undo and redo bring nothing back', () => {
  it('Local: Ctrl+Z and redo do nothing; the stored product stays the imported one', async () => {
    const driver = createLocalStorageDriver();
    storage = { driver, mode: 'local', storageReady: true };
    await driver.createProduct(fileProduct('p1', 'Before', 40, 'pre'));
    await mountAndImport(driver);

    key({ key: 'z', ctrlKey: true });
    expect(name()).toBe('From file');
    key({ key: 'Z', ctrlKey: true, shiftKey: true });
    expect(name()).toBe('From file');
    driver.flushPendingSaves();
    expect((await driver.loadProduct('p1'))?.name).toBe('From file');

    // the next edit is undoable, and only back to the imported product
    editTo('After');
    key({ key: 'z', ctrlKey: true });
    expect(name()).toBe('From file');
    key({ key: 'z', ctrlKey: true });
    expect(name()).toBe('From file');
  });

  it('Cloud: Ctrl+Z does nothing, and no save sends a pre-import entry', async () => {
    const preLog = fileLog(600, 'pre');
    storedDoc = {
      name: 'Before', description: '', schemaVersion: 2, owner: UID, members: { [UID]: 'owner' },
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', _originRef: 'o',
      sizeMapping: [{ label: 'M', points: 5 }], releases: [], sprints: [], themes: [], _changeLog: preLog,
    };
    mockGetDoc.mockResolvedValue(docSnap('p1', storedDoc));
    const driver = createFirestoreDriver(UID);
    storage = { driver, mode: 'cloud', storageReady: true };
    await mountAndImport(driver);

    key({ key: 'z', ctrlKey: true });
    await act(async () => { driver.flushPendingSaves(); await Promise.resolve(); });
    await new Promise(r => setTimeout(r, 300));
    const sent = mockUpdateDoc.mock.calls.flatMap(
      c => ((c[1] as { _changeLog?: { _arrayUnion: ChangeLogEntry[] } })._changeLog?._arrayUnion ?? []),
    );
    expect(sent.filter(e => String(e.seq).startsWith('pre-'))).toEqual([]);
    expect(name()).toBe('From file');
    expect(mockTxSet).toHaveBeenCalledTimes(1);
  });
});

describe('a cloud save already in flight when a replace lands (O52)', () => {
  it('sends only the entries that were new when it started', async () => {
    const preLog = fileLog(600, 'pre');
    storedDoc = {
      name: 'Before', description: '', schemaVersion: 2, owner: UID, members: { [UID]: 'owner' },
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', _originRef: 'o',
      sizeMapping: [], releases: [], sprints: [], themes: [], _changeLog: preLog,
    };
    mockGetDoc.mockResolvedValue(docSnap('p1', storedDoc));
    const driver = createFirestoreDriver(UID);
    const loaded = await driver.loadProduct('p1');
    if (!loaded) throw new Error('not loaded');
    const edited: Product = { ...loaded, _changeLog: appendChangeLogEntry(loaded, { op: 'add', entity: 'theme', id: 'mine' }) };

    let release!: () => void;
    mockSetDoc.mockImplementationOnce(() => new Promise<void>(res => { release = res; }));
    const saving = driver.saveProductImmediate(edited);
    await Promise.resolve();
    await driver.replaceProduct({ ...fileProduct('p1', 'From file', 600), id: 'p1' });
    release();
    await saving;

    const sent = mockUpdateDoc.mock.calls.flatMap(
      c => ((c[1] as { _changeLog?: { _arrayUnion: ChangeLogEntry[] } })._changeLog?._arrayUnion ?? []),
    );
    expect(sent.map(e => e.id)).toEqual(['mine']);
  });
});
