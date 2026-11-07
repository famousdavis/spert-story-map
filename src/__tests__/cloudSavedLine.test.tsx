// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * The `Saved …` line in the project header, in cloud mode.
 *
 * ⚠️ THROUGH THE REAL LAYOUT, `useProduct` AND DRIVER. Only the Firestore SDK is
 * stubbed, and the stub is what the real SDK did on the emulator: a client's own save
 * reaches no `onSnapshot` callback here, because none ever fires for it. See the
 * listener's comment in `firestoreDriver.ts` for why that is, and why it must stay so.
 */

import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import type { Product, ProductUpdater, StorageDriver } from '../types';
import ProductLayout from '../components/layout/ProductLayout';
import { createFirestoreDriver } from '../lib/firestoreDriver';
import { createLocalStorageDriver } from '../lib/storageDriver';

const UID = 'me-uid';
const NOW = Date.parse('2026-06-01T12:00:00.000Z');
const BANNER = 'Changes may not have saved. Check your connection.';
const iso = (ms: number) => new Date(ms).toISOString();

const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockOnSnapshot = vi.fn();

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
  onSnapshot: (...a: unknown[]) => mockOnSnapshot(...a),
  arrayUnion: (...args: unknown[]) => ({ _arrayUnion: args }),
  runTransaction: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({ db: {}, isFirebaseAvailable: false, auth: null, functionsInstance: null }));

let storage: { driver: StorageDriver; mode: 'cloud'; storageReady: boolean };
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: { uid: UID } }) }));

const stored = (over: Record<string, unknown> = {}) => ({
  name: 'Capstone', description: '', schemaVersion: 2, owner: UID, members: { [UID]: 'owner' },
  updatedAt: iso(NOW - 90_000), sizeMapping: [{ label: 'M', points: 5 }], releases: [], sprints: [],
  themes: [], _changeLog: [], ...over,
});
const docSnap = (id: string, data: Record<string, unknown>) => ({
  id, data: () => structuredClone(data), exists: () => true, metadata: { hasPendingWrites: false },
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(res => { resolve = res; });
  return { promise, resolve };
}

interface Outlet { product: Product; updateProduct: (updater: ProductUpdater) => void }
let page: Outlet;
function Page() {
  const outlet = useOutletContext<Outlet>();
  useEffect(() => { page = outlet; });
  return null;
}

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const line = () => screen.getByText(/^Saved /).textContent;
const edit = (fn: (p: Product) => Product) => act(async () => { page.updateProduct(fn); });
const append = (text: string) => (p: Product) => ({ ...p, description: p.description + text });

/** Opens the project as the app does. `edit` then starts the driver's 200ms debounce. */
async function open(id = 'p1', prepare?: (driver: StorageDriver) => void) {
  mockGetDoc.mockResolvedValue(docSnap(id, stored()));
  const driver = createFirestoreDriver(UID);
  prepare?.(driver);
  storage = { driver, mode: 'cloud', storageReady: true };
  render(
    <MemoryRouter initialEntries={[`/product/${id}/structure`]}>
      <Routes>
        <Route path="/product/:productId" element={<ProductLayout />}>
          <Route path="structure" element={<Page />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  await tick(0);
  return { driver };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  mockGetDoc.mockReset();
  mockSetDoc.mockReset().mockResolvedValue(undefined);
  mockUpdateDoc.mockReset().mockResolvedValue(undefined);
  mockOnSnapshot.mockReset().mockReturnValue(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a save of your own', () => {
  it('moves the line when the write lands, not when it starts', async () => {
    await open();
    expect(line()).toBe('Saved 1m ago');

    const write = deferred();
    mockSetDoc.mockReturnValueOnce(write.promise);
    await edit(append('x'));
    await tick(200);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    // Offline, a write stays exactly here, so this is also the offline line.
    expect(line()).toBe('Saved 1m ago');

    await act(async () => { write.resolve(); });
    expect(line()).toBe('Saved just now');
  });

  it('shows the time the document holds, not the time the ack arrived', async () => {
    await open();
    const write = deferred();
    mockSetDoc.mockReturnValueOnce(write.promise);
    await edit(append('x'));
    await tick(200);

    await tick(30_000);
    await act(async () => { write.resolve(); });

    expect(line()).toBe('Saved 30s ago');
    expect(mockSetDoc.mock.calls[0]?.[1]).toMatchObject({ updatedAt: iso(NOW + 200) });
  });

  it('leaves the line alone when the write is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await open();
    mockSetDoc.mockRejectedValueOnce(Object.assign(new Error('no'), { code: 'permission-denied' }));
    await edit(append('x'));
    await tick(200);

    expect(screen.getByText(BANNER)).toBeInTheDocument();
    expect(line()).toBe('Saved 1m ago');
  });

  it('moves the line when the project saved and only the changelog write failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await open();
    mockUpdateDoc.mockRejectedValueOnce(new Error('no'));
    await edit(p => ({ ...p, _changeLog: [{ t: 1, op: 'x' } as never] }));
    await tick(200);

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(screen.getByText(BANNER)).toBeInTheDocument();
    expect(line()).toBe('Saved just now');
  });

  it('moves once for edits the debounce folds into one write', async () => {
    await open();
    await edit(append('a'));
    await tick(100);
    await edit(append('b'));
    await tick(100);
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(line()).toBe('Saved 1m ago');

    await tick(100);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(line()).toBe('Saved just now');
  });

  it('leaves the line alone when another project is the one that saved', async () => {
    const { driver } = await open();
    await act(async () => { await driver.saveProductImmediate({ ...page.product, id: 'other' }); });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(line()).toBe('Saved 1m ago');
  });

  it('never touches the project: an edit made while the write was in flight stays', async () => {
    await open();
    const write = deferred();
    mockSetDoc.mockReturnValueOnce(write.promise);
    await edit(append('a'));
    await tick(200);
    await edit(append('b'));

    await act(async () => { write.resolve(); });

    expect(line()).toBe('Saved just now');
    expect(page.product.description).toBe('ab');
  });
});

describe('the listener', () => {
  it('still moves the line for a colleague', async () => {
    await open();
    const next = mockOnSnapshot.mock.calls[0]?.[1] as (snap: unknown) => void;
    await act(async () => { next(docSnap('p1', stored({ updatedAt: iso(NOW - 20_000) }))); });
    expect(line()).toBe('Saved 20s ago');
  });

  // The stub cannot show the harm, so this pins the shape. With metadata changes on, an
  // edit made before the ack of an earlier save went from memory and from the document in
  // 20 of 20 rounds, real SDK on the emulator, against 0 of 20 without.
  it('takes no metadata changes: its second argument is the callback', async () => {
    await open();
    expect(typeof mockOnSnapshot.mock.calls[0]?.[1]).toBe('function');
  });
});

describe('onProductSaved', () => {
  const product = () => ({ ...stored(), id: 'p1' }) as unknown as Product;

  it('reports the id and the updatedAt the write carried', async () => {
    const driver = createFirestoreDriver(UID);
    const heard = vi.fn();
    driver.onProductSaved(heard);
    await driver.saveProductImmediate(product());
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith('p1', iso(NOW));
    expect(mockSetDoc.mock.calls[0]?.[1]).toMatchObject({ updatedAt: iso(NOW) });
  });

  it('stops after unsubscribing', async () => {
    const driver = createFirestoreDriver(UID);
    const heard = vi.fn();
    driver.onProductSaved(heard)();
    await driver.saveProductImmediate(product());
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(heard).not.toHaveBeenCalled();
  });

  it('a subscriber that throws costs neither the changelog write, nor the others, nor a banner', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const driver = createFirestoreDriver(UID);
    const heard = vi.fn();
    const failed = vi.fn();
    driver.onSaveError(failed);
    driver.onProductSaved(() => { throw new Error('subscriber'); });
    driver.onProductSaved(heard);

    await driver.saveProductImmediate({ ...product(), _changeLog: [{ t: 1, op: 'x' } as never] });

    expect(heard).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
  });

  it('the page lets go of it on the way out', async () => {
    const unsubscribed = vi.fn();
    await open('p1', driver => {
      const real = driver.onProductSaved.bind(driver);
      driver.onProductSaved = cb => {
        const off = real(cb);
        return () => { unsubscribed(); off(); };
      };
    });
    expect(unsubscribed).not.toHaveBeenCalled();
    cleanup();
    expect(unsubscribed).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on the local driver', () => {
    const heard = vi.fn();
    const off = createLocalStorageDriver().onProductSaved(heard);
    expect(off).toBeTypeOf('function');
    off();
    expect(heard).not.toHaveBeenCalled();
  });
});
