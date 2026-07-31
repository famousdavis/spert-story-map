// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createNewProduct,
  duplicateProduct,
  importProductFromJSON,
  exportProduct,
  getWorkspaceId,
  appendChangeLogEntry,
  clearAllLocalProducts,
  saveProduct,
  saveProductImmediate,
  loadProductIndex,
  loadProduct,
  cancelPendingSaves,
} from '../lib/storage';
import { SCHEMA_VERSION, DEFAULT_SIZE_MAPPING, CHANGELOG_MAX_ENTRIES } from '../lib/constants';
import { req } from './testHelpers';
import type { Product, ChangeLogEntry, ProgressEntry } from '../types';

// Mock crypto.randomUUID since we're in node environment
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

// Mock localStorage for node environment
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: unknown) => { store[key] = String(value); },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const key of Object.keys(store)) delete store[key]; },
});

beforeEach(() => {
  uuidCounter = 0;
  localStorage.clear();
});

// --- getWorkspaceId ---
describe('getWorkspaceId', () => {
  it('generates and persists a UUID on first call', () => {
    const id = getWorkspaceId();
    expect(id).toBeTruthy();
    expect(localStorage.getItem('rp_workspace_id')).toBe(id);
  });

  it('returns the same ID on subsequent calls', () => {
    const id1 = getWorkspaceId();
    const id2 = getWorkspaceId();
    expect(id1).toBe(id2);
  });

  it('returns existing ID from localStorage', () => {
    localStorage.setItem('rp_workspace_id', 'pre-existing-id');
    expect(getWorkspaceId()).toBe('pre-existing-id');
  });
});

// --- appendChangeLogEntry ---
describe('appendChangeLogEntry', () => {
  it('appends entry with timestamp', () => {
    const product = { _changeLog: [] };
    const result = appendChangeLogEntry(product, { op: 'add', entity: 'theme', id: 'x' });
    expect(result).toHaveLength(1);
    expect(result[0]?.op).toBe('add');
    expect(result[0]?.entity).toBe('theme');
    expect(result[0]?.id).toBe('x');
    expect(result[0]?.t).toBeGreaterThan(0);
  });

  it('handles missing _changeLog', () => {
    const result = appendChangeLogEntry({}, { op: 'create', entity: 'product' });
    expect(result).toHaveLength(1);
  });

  it('preserves existing entries', () => {
    const product: Pick<Product, '_changeLog'> = { _changeLog: [{ t: 1000, op: 'create', entity: 'product' }] };
    const result = appendChangeLogEntry(product, { op: 'add', entity: 'theme', id: 't1' });
    expect(result).toHaveLength(2);
    expect(result[0]?.op).toBe('create');
    expect(result[1]?.op).toBe('add');
  });

  it('caps at CHANGELOG_MAX_ENTRIES', () => {
    const log: ChangeLogEntry[] = Array.from({ length: CHANGELOG_MAX_ENTRIES }, (_, i) => ({ t: i, op: 'add', entity: 'theme', id: `t${i}` }));
    const product: Pick<Product, '_changeLog'> = { _changeLog: log };
    const result = appendChangeLogEntry(product, { op: 'add', entity: 'theme', id: 'new' });
    expect(result).toHaveLength(CHANGELOG_MAX_ENTRIES);
    expect(result[CHANGELOG_MAX_ENTRIES - 1]?.id).toBe('new');
    // Oldest entry dropped
    expect(result[0]?.id).toBe('t1');
  });
});

// --- createNewProduct ---
describe('createNewProduct', () => {
  it('creates a product with required fields', () => {
    const product = createNewProduct('Test Project', 'A description');
    expect(product.name).toBe('Test Project');
    expect(product.description).toBe('A description');
    expect(product.id).toBeTruthy();
    expect(product.schemaVersion).toBe(SCHEMA_VERSION);
    expect(product.sizeMapping).toEqual(DEFAULT_SIZE_MAPPING);
    expect(product.releases).toEqual([]);
    expect(product.sprints).toEqual([]);
    expect(product.themes).toEqual([]);
    expect(product.sprintCadenceWeeks).toBe(2);
  });

  it('defaults description to empty string', () => {
    const product = createNewProduct('Name Only');
    expect(product.description).toBe('');
  });

  it('sets timestamps', () => {
    const product = createNewProduct('Test');
    expect(product.createdAt).toBeTruthy();
    expect(product.updatedAt).toBeTruthy();
    expect(product.createdAt).toBe(product.updatedAt);
  });

  it('sets _originRef to current workspace ID', () => {
    const product = createNewProduct('Test');
    expect(product._originRef).toBeTruthy();
    expect(product._originRef).toBe(getWorkspaceId());
  });

  it('initializes _changeLog with create event', () => {
    const product = createNewProduct('Test');
    const log = req(product._changeLog, '_changeLog');
    expect(log).toHaveLength(1);
    expect(log[0]?.op).toBe('create');
    expect(log[0]?.entity).toBe('product');
    expect(log[0]?.t).toBeGreaterThan(0);
  });

  it('uses workspaceIdOverride for _originRef when provided', () => {
    const product = createNewProduct('Test', '', 'firebase-uid-123');
    expect(product._originRef).toBe('firebase-uid-123');
  });

  it('falls back to getWorkspaceId() when workspaceIdOverride is not provided', () => {
    const product = createNewProduct('Test', '');
    expect(product._originRef).toBe(getWorkspaceId());
  });
});

// --- duplicateProduct ---
describe('duplicateProduct', () => {
  // Annotated Product: duplicateProduct takes one, and the annotation also
  // contextually types `_changeLog`'s `op` (which otherwise widens to string).
  const original: Product = {
    id: 'orig-id',
    name: 'Original',
    description: 'desc',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    schemaVersion: SCHEMA_VERSION,
    sizeMapping: [...DEFAULT_SIZE_MAPPING],
    sprintCadenceWeeks: 2,
    releases: [{ id: 'rel-1', name: 'Release 1', description: '', order: 1, targetDate: null }],
    sprints: [{ id: 'sp-1', name: 'Sprint 1', order: 1, endDate: null }],
    themes: [{
      id: 't1',
      name: 'Theme 1',
      order: 1,
      backboneItems: [{
        id: 'b1',
        name: 'Backbone 1',
        description: '',
        order: 1,
        ribItems: [{
          id: 'r1',
          name: 'Rib 1',
          description: '',
          size: 'M',
          category: 'core',
          order: 1,
          releaseAllocations: [{ releaseId: 'rel-1', percentage: 100, memo: '' }],
          progressHistory: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 50 }],
        }],
      }],
    }],
    releaseCardOrder: { 'rel-1': ['r1'], 'unassigned': [] },
    _originRef: 'source-browser-id',
    _changeLog: [{ t: 1000, op: 'create', entity: 'product' }],
  };

  it('creates a new product with different ID', () => {
    const dup = duplicateProduct(original);
    expect(dup.id).not.toBe(original.id);
  });

  it('appends (Copy) to name', () => {
    const dup = duplicateProduct(original);
    expect(dup.name).toBe('Original (Copy)');
  });

  it('remaps all IDs consistently', () => {
    const dup = duplicateProduct(original);
    // Bind every cross-reference BEFORE asserting. Optional chaining is wrong
    // here: `expect(a?.x).not.toBe('rel-1')` passes when `a` is missing, and
    // `expect(a?.x).toBe(b?.y)` is `undefined === undefined` when both are —
    // so a duplicate that DROPPED releases/sprints/allocations entirely would
    // satisfy every line below. That is precisely the regression this test
    // exists to catch, so each value must be required into scope first.
    const dupRelease = req(dup.releases[0], 'dup.releases[0]');
    const dupSprint = req(dup.sprints[0], 'dup.sprints[0]');
    const dupRib = req(dup.themes[0]?.backboneItems[0]?.ribItems[0], 'dupRib');
    const dupAlloc = req(dupRib.releaseAllocations[0], 'dupRib.releaseAllocations[0]');
    const dupProgress = req(dupRib.progressHistory[0], 'dupRib.progressHistory[0]');

    // Release / sprint / rib IDs should all be different
    expect(dupRelease.id).not.toBe('rel-1');
    expect(dupSprint.id).not.toBe('sp-1');
    expect(dupRib.id).not.toBe('r1');
    // Rib's allocation should reference the new release ID
    expect(dupAlloc.releaseId).toBe(dupRelease.id);
    // Progress history should reference the new sprint ID and release ID
    expect(dupProgress.sprintId).toBe(dupSprint.id);
    expect(dupProgress.releaseId).toBe(dupRelease.id);
  });

  it('remaps releaseCardOrder keys and values', () => {
    const dup = duplicateProduct(original);
    const newRelId = req(dup.releases[0], 'dup.releases[0]').id;
    const newRibId = req(dup.themes[0]?.backboneItems[0]?.ribItems[0], 'dupRib').id;
    const order = req(dup.releaseCardOrder, 'dup.releaseCardOrder');
    expect(order[newRelId]).toEqual([newRibId]);
    expect(order['unassigned']).toEqual([]);
    // Old keys should not exist. Bound, not `?.` — toBeUndefined() passes on
    // undefined, so a missing map would satisfy this for the wrong reason.
    expect(order['rel-1']).toBeUndefined();
  });

  it('preserves rib data (size, category, name)', () => {
    const dup = duplicateProduct(original);
    const dupRib = req(dup.themes[0]?.backboneItems[0]?.ribItems[0], 'dupRib');
    expect(dupRib.name).toBe('Rib 1');
    expect(dupRib.size).toBe('M');
    expect(dupRib.category).toBe('core');
  });

  it('handles multiple releases with cross-references', () => {
    const multi: Product = {
      ...original,
      releases: [
        { id: 'rel-1', name: 'R1', description: '', order: 1, targetDate: null },
        { id: 'rel-2', name: 'R2', description: '', order: 2, targetDate: null },
        { id: 'rel-3', name: 'R3', description: '', order: 3, targetDate: null },
      ],
      themes: [{
        id: 't1', name: 'T1', order: 1,
        backboneItems: [{
          id: 'b1', name: 'B1', description: '', order: 1,
          ribItems: [{
            id: 'r1', name: 'Rib', description: '', size: 'M', category: 'core', order: 1,
            releaseAllocations: [
              { releaseId: 'rel-1', percentage: 40 },
              { releaseId: 'rel-2', percentage: 60 },
            ],
            progressHistory: [
              { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 20 },
              { sprintId: 'sp-1', releaseId: 'rel-2', percentComplete: 30 },
            ],
          }],
        }],
      }],
      releaseCardOrder: { 'rel-1': ['r1'], 'rel-2': ['r1'] },
    };

    const dup = duplicateProduct(multi);
    const dupRib = req(dup.themes[0]?.backboneItems[0]?.ribItems[0], 'dupRib');
    // Each allocation references consistent new release IDs
    const newRel1 = dup.releases[0]?.id;
    const newRel2 = dup.releases[1]?.id;
    expect(dupRib.releaseAllocations[0]?.releaseId).toBe(newRel1);
    expect(dupRib.releaseAllocations[1]?.releaseId).toBe(newRel2);
    // Progress also references the same remapped IDs
    expect(dupRib.progressHistory[0]?.releaseId).toBe(newRel1);
    expect(dupRib.progressHistory[1]?.releaseId).toBe(newRel2);
    // Card order keys remapped
    const order = req(dup.releaseCardOrder, 'dup.releaseCardOrder');
    expect(order[req(newRel1, 'newRel1')]).toBeDefined();
    expect(order[req(newRel2, 'newRel2')]).toBeDefined();
  });

  it('handles empty releaseCardOrder', () => {
    const noOrder = { ...original };
    delete noOrder.releaseCardOrder;
    const dup = duplicateProduct(noOrder);
    expect(dup.releaseCardOrder).toEqual({});
  });

  it('handles progressHistory entries without releaseId (legacy)', () => {
    const legacy: Product = {
      ...original,
      themes: [{
        id: 't1', name: 'T1', order: 1,
        backboneItems: [{
          id: 'b1', name: 'B1', description: '', order: 1,
          ribItems: [{
            id: 'r1', name: 'Rib', description: '', size: 'M', category: 'core', order: 1,
            releaseAllocations: [],
            // DELIBERATELY missing releaseId — that is the whole point of this
            // test (pre-v2 entries predate per-release progress). Cast rather
            // than completed, so the fixture keeps describing legacy data.
            progressHistory: [
              { sprintId: 'sp-1', percentComplete: 50 } as unknown as ProgressEntry,
            ],
          }],
        }],
      }],
    };
    const dup = duplicateProduct(legacy);
    const entry = req(dup.themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory[0], 'entry');
    expect(entry.sprintId).toBe(dup.sprints[0]?.id);
    // No releaseId should be added
    expect(entry.releaseId).toBeUndefined();
  });

  it('handles product with no themes', () => {
    const empty = {
      ...original,
      themes: [],
      releaseCardOrder: {},
    };
    const dup = duplicateProduct(empty);
    expect(dup.themes).toEqual([]);
    expect(dup.releases.length).toBe(1);
    expect(dup.sprints.length).toBe(1);
    expect(dup.id).not.toBe(empty.id);
  });

  it('sets fresh _originRef to current workspace', () => {
    const dup = duplicateProduct(original);
    expect(dup._originRef).toBe(getWorkspaceId());
    expect(dup._originRef).not.toBe(original._originRef);
  });

  it('initializes fresh _changeLog with duplicate event', () => {
    const dup = duplicateProduct(original);
    const log = req(dup._changeLog, '_changeLog');
    expect(log).toHaveLength(1);
    expect(log[0]?.op).toBe('duplicate');
    expect(log[0]?.entity).toBe('product');
    expect(log[0]?.source).toBe('orig-id');
  });

  it('uses workspaceIdOverride for _originRef when provided', () => {
    const dup = duplicateProduct(original, 'firebase-uid-456');
    expect(dup._originRef).toBe('firebase-uid-456');
  });

  it('falls back to getWorkspaceId() when workspaceIdOverride is not provided', () => {
    const dup = duplicateProduct(original);
    expect(dup._originRef).toBe(getWorkspaceId());
  });
});

// --- importProductFromJSON ---
describe('importProductFromJSON', () => {
  it('parses valid JSON and returns product', () => {
    const json = JSON.stringify({
      id: 'test-id',
      name: 'Test',
      themes: [],
      schemaVersion: SCHEMA_VERSION,
    });
    const result = importProductFromJSON(json);
    expect(result.id).toBe('test-id');
    expect(result.name).toBe('Test');
  });

  it('throws for missing required fields', () => {
    expect(() => importProductFromJSON(JSON.stringify({}))).toThrow('Product id');
    expect(() => importProductFromJSON(JSON.stringify({ id: 'x' }))).toThrow('Product name');
    expect(() => importProductFromJSON(JSON.stringify({ id: 'x', name: 'N' }))).toThrow('themes must be an array');
  });

  it('adds default sizeMapping if missing', () => {
    const json = JSON.stringify({
      id: 'test-id',
      name: 'Test',
      themes: [],
      schemaVersion: SCHEMA_VERSION,
    });
    const result = importProductFromJSON(json);
    expect(result.sizeMapping).toEqual(DEFAULT_SIZE_MAPPING);
  });

  it('adds empty releases and sprints if missing', () => {
    const json = JSON.stringify({
      id: 'test-id',
      name: 'Test',
      themes: [],
      schemaVersion: SCHEMA_VERSION,
    });
    const result = importProductFromJSON(json);
    expect(result.releases).toEqual([]);
    expect(result.sprints).toEqual([]);
  });

  it('throws for invalid JSON', () => {
    expect(() => importProductFromJSON('not json')).toThrow();
  });

  it('throws for theme missing backboneItems', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', schemaVersion: SCHEMA_VERSION,
      themes: [{ id: 't1' }],
    });
    expect(() => importProductFromJSON(json)).toThrow('backboneItems must be an array');
  });

  it('throws for theme missing id', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', schemaVersion: SCHEMA_VERSION,
      themes: [{ backboneItems: [] }],
    });
    expect(() => importProductFromJSON(json)).toThrow('Theme id must be a valid string');
  });

  it('throws for backbone missing ribItems', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', schemaVersion: SCHEMA_VERSION,
      themes: [{ id: 't1', backboneItems: [{ id: 'b1' }] }],
    });
    expect(() => importProductFromJSON(json)).toThrow('ribItems must be an array');
  });

  it('throws for backbone missing id', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', schemaVersion: SCHEMA_VERSION,
      themes: [{ id: 't1', backboneItems: [{ ribItems: [] }] }],
    });
    expect(() => importProductFromJSON(json)).toThrow('Backbone id must be a valid string');
  });

  it('accepts valid nested structure', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', schemaVersion: SCHEMA_VERSION,
      themes: [{
        id: 't1',
        backboneItems: [{
          id: 'b1',
          ribItems: [{ id: 'r1', name: 'Rib', size: 'M', category: 'core', releaseAllocations: [], progressHistory: [] }],
        }],
      }],
    });
    const result = importProductFromJSON(json);
    expect(result.themes[0]?.backboneItems[0]?.ribItems).toHaveLength(1);
  });

  it('preserves _originRef from imported data', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', themes: [], schemaVersion: SCHEMA_VERSION,
      _originRef: 'original-browser-uuid',
    });
    const result = importProductFromJSON(json);
    expect(result._originRef).toBe('original-browser-uuid');
  });

  it('backfills _originRef if missing from imported data', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', themes: [], schemaVersion: SCHEMA_VERSION,
    });
    const result = importProductFromJSON(json);
    expect(result._originRef).toBe(getWorkspaceId());
  });

  it('appends import event to _changeLog', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', themes: [], schemaVersion: SCHEMA_VERSION,
      _changeLog: [{ t: 1000, op: 'create', entity: 'product' }],
    });
    const result = importProductFromJSON(json);
    const log = req(result._changeLog, '_changeLog');
    expect(log).toHaveLength(2);
    expect(log[1]?.op).toBe('import');
    expect(log[1]?.source).toBe('file');
  });

  it('creates _changeLog with import event if none existed', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', themes: [], schemaVersion: SCHEMA_VERSION,
    });
    const result = importProductFromJSON(json);
    const log = req(result._changeLog, '_changeLog');
    expect(log).toHaveLength(1);
    expect(log[0]?.op).toBe('import');
  });

  it('strips _storageRef and attribution fields on import', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', themes: [], schemaVersion: SCHEMA_VERSION,
      _storageRef: 'some-ref',
      _exportedBy: 'Alice',
      _exportedById: '12345',
    });
    const result = importProductFromJSON(json);
    expect(result._storageRef).toBeUndefined();
    expect(result._exportedBy).toBeUndefined();
    expect(result._exportedById).toBeUndefined();
  });
});

// --- clearAllLocalProducts ---
describe('clearAllLocalProducts', () => {
  it('removes all products and the index', () => {
    const p1 = createNewProduct('Product 1');
    const p2 = createNewProduct('Product 2');
    saveProductImmediate(p1);
    saveProductImmediate(p2);

    expect(loadProductIndex()).toHaveLength(2);
    expect(loadProduct(p1.id)).toBeTruthy();
    expect(loadProduct(p2.id)).toBeTruthy();

    clearAllLocalProducts();

    expect(loadProductIndex()).toEqual([]);
    expect(loadProduct(p1.id)).toBeNull();
    expect(loadProduct(p2.id)).toBeNull();
  });

  it('is safe to call with no products', () => {
    expect(() => clearAllLocalProducts()).not.toThrow();
    expect(loadProductIndex()).toEqual([]);
  });
});

// --- cancelPendingSaves ---
describe('cancelPendingSaves', () => {
  it('prevents a debounced saveProduct from writing to localStorage', () => {
    vi.useFakeTimers();
    try {
      const p = createNewProduct('Doomed Product');
      // Schedule a debounced save — this should NOT reach localStorage.
      saveProduct(p);
      // Cancel before the 500ms debounce fires.
      cancelPendingSaves();
      // Fast-forward past the debounce window.
      vi.advanceTimersByTime(1000);
      // Product document was never written.
      expect(loadProduct(p.id)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('is safe to call with no pending saves', () => {
    expect(() => cancelPendingSaves()).not.toThrow();
  });
});

// --- exportProduct ---
describe('exportProduct', () => {
  let capturedBlob: Blob | null = null;

  // exportProduct now takes a driver as the second argument and reads
  // attribution prefs via driver.loadPreferences(). The minimal stub
  // returns {} so the export still produces a file but stamps no
  // attribution — these tests focus on _storageRef behaviour.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial StorageDriver shape; only loadPreferences is exercised
  const mockDriver = { loadPreferences: () => Promise.resolve({}) } as any;

  beforeEach(() => {
    capturedBlob = null;
    // Mock DOM APIs for export
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => { capturedBlob = blob; return 'blob:mock'; },
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('document', {
      createElement: () => ({ click: vi.fn(), set href(_: string) {}, set download(_: string) {} }),
    });
  });

  it('uses storageRefOverride for _storageRef when provided', async () => {
    const product = { id: 'p1', name: 'Test', themes: [] } as unknown as Product;
    await exportProduct(product, mockDriver, 'firebase-uid-789');
    const text = await req(capturedBlob, 'capturedBlob').text();
    const data = JSON.parse(text);
    expect(data._storageRef).toBe('firebase-uid-789');
  });

  it('falls back to getWorkspaceId() when storageRefOverride is not provided', async () => {
    const product = { id: 'p1', name: 'Test', themes: [] } as unknown as Product;
    await exportProduct(product, mockDriver);
    const text = await req(capturedBlob, 'capturedBlob').text();
    const data = JSON.parse(text);
    expect(data._storageRef).toBe(getWorkspaceId());
  });

  it('uses cachedPrefs when provided (batch-export path)', async () => {
    const product = { id: 'p1', name: 'Test', themes: [] } as unknown as Product;
    await exportProduct(product, mockDriver, undefined, { exportName: 'Alice', exportId: 'UF001' });
    const text = await req(capturedBlob, 'capturedBlob').text();
    const data = JSON.parse(text);
    expect(data._exportedBy).toBe('Alice');
    expect(data._exportedById).toBe('UF001');
  });
});
