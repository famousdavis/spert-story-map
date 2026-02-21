import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLocalStorageDriver } from '../lib/storageDriver';

// Mock storage.js — each function is a vi.fn()
vi.mock('../lib/storage', () => ({
  loadProductIndex: vi.fn(() => [{ id: 'p1', name: 'Test', updatedAt: '2025-01-01' }]),
  loadProduct: vi.fn((id) => ({ id, name: 'Loaded Product' })),
  saveProduct: vi.fn(),
  saveProductImmediate: vi.fn(),
  deleteProduct: vi.fn(),
  loadPreferences: vi.fn(() => ({ exportName: 'Alice' })),
  savePreferences: vi.fn(),
  getWorkspaceId: vi.fn(() => 'ws-uuid-123'),
  flushPendingSaves: vi.fn(),
  onSaveError: vi.fn(),
  migrateToV2: vi.fn((p) => p),
}));

// Mock firebase.js — prevent real Firebase initialization
vi.mock('../lib/firebase', () => ({
  db: null,
  auth: null,
  isFirebaseAvailable: false,
}));

// Mock firebase/firestore — prevent import errors
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(),
}));

import * as storage from '../lib/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── LocalStorageDriver ────────────────────────────────────────────

describe('createLocalStorageDriver', () => {
  it('has mode "local"', () => {
    const driver = createLocalStorageDriver();
    expect(driver.mode).toBe('local');
  });

  it('loadProductIndex loads full product data for each index entry', async () => {
    const driver = createLocalStorageDriver();
    const result = await driver.loadProductIndex();
    expect(storage.loadProductIndex).toHaveBeenCalledOnce();
    // Loads each product via loadProduct (uniform with cloud driver)
    expect(storage.loadProduct).toHaveBeenCalledWith('p1');
    expect(result).toEqual([{ id: 'p1', name: 'Loaded Product' }]);
  });

  it('loadProductIndex filters out null products', async () => {
    storage.loadProduct.mockReturnValueOnce(null);
    const driver = createLocalStorageDriver();
    const result = await driver.loadProductIndex();
    expect(result).toEqual([]);
  });

  it('loadProduct delegates with id and returns a promise', async () => {
    const driver = createLocalStorageDriver();
    const result = await driver.loadProduct('abc');
    expect(storage.loadProduct).toHaveBeenCalledWith('abc');
    expect(result).toEqual({ id: 'abc', name: 'Loaded Product' });
  });

  it('createProduct delegates to saveProductImmediate', async () => {
    const driver = createLocalStorageDriver();
    const product = { id: 'p1', name: 'New Product' };
    await driver.createProduct(product);
    expect(storage.saveProductImmediate).toHaveBeenCalledWith(product);
  });

  it('saveProduct delegates and returns a resolved promise', async () => {
    const driver = createLocalStorageDriver();
    const product = { id: 'p1', name: 'Save Me' };
    await driver.saveProduct(product);
    expect(storage.saveProduct).toHaveBeenCalledWith(product);
  });

  it('saveProductImmediate delegates and returns a resolved promise', async () => {
    const driver = createLocalStorageDriver();
    const product = { id: 'p1', name: 'Save Now' };
    await driver.saveProductImmediate(product);
    expect(storage.saveProductImmediate).toHaveBeenCalledWith(product);
  });

  it('deleteProduct delegates with id', async () => {
    const driver = createLocalStorageDriver();
    await driver.deleteProduct('xyz');
    expect(storage.deleteProduct).toHaveBeenCalledWith('xyz');
  });

  it('loadPreferences delegates and returns a promise', async () => {
    const driver = createLocalStorageDriver();
    const result = await driver.loadPreferences();
    expect(storage.loadPreferences).toHaveBeenCalledOnce();
    expect(result).toEqual({ exportName: 'Alice' });
  });

  it('savePreferences delegates', () => {
    const driver = createLocalStorageDriver();
    const prefs = { exportName: 'Bob' };
    driver.savePreferences(prefs);
    expect(storage.savePreferences).toHaveBeenCalledWith(prefs);
  });

  it('getWorkspaceId delegates', () => {
    const driver = createLocalStorageDriver();
    expect(driver.getWorkspaceId()).toBe('ws-uuid-123');
    expect(storage.getWorkspaceId).toHaveBeenCalledOnce();
  });

  it('flushPendingSaves delegates', () => {
    const driver = createLocalStorageDriver();
    driver.flushPendingSaves();
    expect(storage.flushPendingSaves).toHaveBeenCalledOnce();
  });

  it('onSaveError delegates', () => {
    const driver = createLocalStorageDriver();
    const cb = vi.fn();
    driver.onSaveError(cb);
    expect(storage.onSaveError).toHaveBeenCalledWith(cb);
  });

  it('onProductChange returns a no-op unsubscribe function', () => {
    const driver = createLocalStorageDriver();
    const cb = vi.fn();
    const unsub = driver.onProductChange('p1', cb);
    expect(typeof unsub).toBe('function');
    unsub();
    expect(cb).not.toHaveBeenCalled();
  });
});
