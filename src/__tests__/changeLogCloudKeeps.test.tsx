// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
// R73 v0.56.2, R-5 and R-6 (R99, R102): no export trims and no cloud driver trims (review
// Opus-PR247-1-04). The real Firestore driver, `useProduct` and `DataSection` over a stubbed SDK, in
// `changeLogReplaceUndo.test.tsx`'s style: a 600-entry document is held whole in memory, grows by
// one with an append, exports whole from the Data section, and a create or replace stores every
// entry it is handed. Also the changelog write that fails: its entries are sent again by the next
// save, because the baseline only advances once `arrayUnion` has landed.
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DataSection from '../components/settings/DataSection';
import { useProduct } from '../hooks/useProduct';
import { createFirestoreDriver } from '../lib/firestoreDriver';
import { appendChangeLogEntry } from '../lib/storage';
import { PROJECTS_COL } from '../lib/firestoreCollections';
import type { ChangeLogEntry, Product, ProductUpdater, StorageDriver } from '../types';
import { ALL_KEPT, fileLog, fileProduct, originKept } from './fixtures/changeLogFiles';
import { req } from './testHelpers';

const UID = 'me';
const COUNT = 600;
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

let storage: { driver: StorageDriver; mode: 'cloud'; storageReady: boolean };
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage }));

function docSnap(id: string, data: Record<string, unknown>) {
  return { id, data: () => structuredClone(data), exists: () => true, metadata: { hasPendingWrites: false } };
}
const missing = (id: string) => ({ id, data: () => undefined, exists: () => false, metadata: { hasPendingWrites: false } });

function cloudDoc(count: number): Record<string, unknown> {
  return {
    name: 'Cloud', description: '', schemaVersion: 2, owner: UID, members: { [UID]: 'owner' },
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', _originRef: 'o',
    sizeMapping: [{ label: 'M', points: 5 }], releases: [], sprints: [], themes: [], _changeLog: fileLog(count),
  };
}

/** Every entry the driver sent through `arrayUnion`, in order. */
const sentEntries = () => mockUpdateDoc.mock.calls.flatMap(
  c => ((c[1] as { _changeLog?: { _arrayUnion: ChangeLogEntry[] } })._changeLog?._arrayUnion ?? []),
);

const bridge: { product: Product | null; update: ((u: ProductUpdater) => void) | null } = { product: null, update: null };

function Host({ driver }: { driver: StorageDriver }) {
  const { product, updateProduct } = useProduct('p1');
  useEffect(() => { bridge.product = product; bridge.update = updateProduct; });
  if (!product) return null;
  return <DataSection product={product} driver={driver} updateProduct={updateProduct} />;
}

beforeEach(() => {
  mockGetDoc.mockReset(); mockSetDoc.mockReset(); mockUpdateDoc.mockReset(); mockTxSet.mockReset();
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  storedDoc = cloudDoc(COUNT);
  // The product document; anything else (the settings read behind an export) does not exist.
  mockGetDoc.mockImplementation(async (ref: { col: string; id: string }) =>
    (ref.col === PROJECTS_COL ? docSnap(ref.id, storedDoc) : missing(ref.id)));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); bridge.product = null; bridge.update = null; });

describe('a cloud product keeps its whole change log in memory and in its Data export', () => {
  it('the driver loads all 600 entries', async () => {
    const loaded = await createFirestoreDriver(UID).loadProduct('p1');
    expect(loaded?._changeLog).toHaveLength(COUNT);
    expect(loaded?._changeLog).toEqual(storedDoc._changeLog);
  });

  it('memory holds 600, then 601 after an append; the save sends that one entry; the export holds 601', async () => {
    const driver = createFirestoreDriver(UID);
    storage = { driver, mode: 'cloud', storageReady: true };
    render(<MemoryRouter><Host driver={driver} /></MemoryRouter>);
    await waitFor(() => expect(bridge.product?._changeLog).toHaveLength(COUNT));

    act(() => {
      bridge.update?.(p => ({ ...p, _changeLog: appendChangeLogEntry(p, { op: 'add', entity: 'theme', id: 'mine' }) }));
    });
    expect(bridge.product?._changeLog).toHaveLength(COUNT + 1);
    expect(originKept(bridge.product?._changeLog)).toEqual(ALL_KEPT);

    await act(async () => { driver.flushPendingSaves(); await new Promise(r => setTimeout(r, 0)); });
    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());
    expect(sentEntries().map(e => e.id)).toEqual(['mine']);

    // jsdom has no object URLs: swapped in and put back by hand, as dataSection.test.tsx does.
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:export');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      await userEvent.click(screen.getByRole('button', { name: 'Export as JSON' }));
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
      const blob = req(createObjectURL.mock.calls[0]?.[0], 'export blob');
      const exported = JSON.parse(await blob.text()) as Product;
      expect(exported._changeLog).toHaveLength(COUNT + 1);
      expect(exported._changeLog).toEqual(bridge.product?._changeLog);
      expect(originKept(exported._changeLog)).toEqual(ALL_KEPT);
    } finally {
      click.mockRestore();
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    }
  });
});

describe('a cloud create or replace stores every entry it is handed', () => {
  it('createProduct', async () => {
    const product = fileProduct('n1', 'New', COUNT);
    await createFirestoreDriver(UID).createProduct(product, { throwOnError: true });
    const payload = mockSetDoc.mock.calls[0]?.[1] as Product | undefined;
    expect(payload?._changeLog).toHaveLength(COUNT);
    expect(payload?._changeLog).toEqual(product._changeLog);
  });

  it('replaceProduct', async () => {
    const product = fileProduct('p1', 'From file', COUNT, 'g');
    await createFirestoreDriver(UID).replaceProduct(product);
    const payload = mockTxSet.mock.calls[0]?.[1] as Product | undefined;
    expect(payload?._changeLog).toHaveLength(COUNT);
    expect(payload?._changeLog).toEqual(product._changeLog);
  });
});

describe('a changelog write that fails', () => {
  it('leaves its entries unsent, so the next save sends them again', async () => {
    storedDoc = cloudDoc(10);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const driver = createFirestoreDriver(UID);
    const loaded = req(await driver.loadProduct('p1'), 'loaded product');
    const first: Product = { ...loaded, _changeLog: appendChangeLogEntry(loaded, { op: 'add', entity: 'theme', id: 'a' }) };
    mockUpdateDoc.mockRejectedValueOnce(new Error('offline'));
    await driver.saveProductImmediate(first);
    expect(error).toHaveBeenCalledWith('Firestore write error:', 'offline');

    const second: Product = { ...first, _changeLog: appendChangeLogEntry(first, { op: 'add', entity: 'theme', id: 'b' }) };
    await driver.saveProductImmediate(second);
    const lastCall = mockUpdateDoc.mock.calls[mockUpdateDoc.mock.calls.length - 1];
    const resent = (lastCall?.[1] as { _changeLog: { _arrayUnion: ChangeLogEntry[] } })._changeLog._arrayUnion;
    expect(resent.map(e => e.id)).toEqual(['a', 'b']);
  });
});
