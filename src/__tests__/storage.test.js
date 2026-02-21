import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createNewProduct,
  duplicateProduct,
  importProductFromJSON,
  exportProduct,
  getWorkspaceId,
  appendChangeLogEntry,
} from '../lib/storage';
import { SCHEMA_VERSION, DEFAULT_SIZE_MAPPING, CHANGELOG_MAX_ENTRIES } from '../lib/constants';

// Mock crypto.randomUUID since we're in node environment
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

// Mock localStorage for node environment
const store = {};
vi.stubGlobal('localStorage', {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: (key) => { delete store[key]; },
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
    expect(result[0].op).toBe('add');
    expect(result[0].entity).toBe('theme');
    expect(result[0].id).toBe('x');
    expect(result[0].t).toBeGreaterThan(0);
  });

  it('handles missing _changeLog', () => {
    const result = appendChangeLogEntry({}, { op: 'create', entity: 'product' });
    expect(result).toHaveLength(1);
  });

  it('preserves existing entries', () => {
    const product = { _changeLog: [{ t: 1000, op: 'create', entity: 'product' }] };
    const result = appendChangeLogEntry(product, { op: 'add', entity: 'theme', id: 't1' });
    expect(result).toHaveLength(2);
    expect(result[0].op).toBe('create');
    expect(result[1].op).toBe('add');
  });

  it('caps at CHANGELOG_MAX_ENTRIES', () => {
    const log = Array.from({ length: CHANGELOG_MAX_ENTRIES }, (_, i) => ({ t: i, op: 'add', entity: 'theme', id: `t${i}` }));
    const product = { _changeLog: log };
    const result = appendChangeLogEntry(product, { op: 'add', entity: 'theme', id: 'new' });
    expect(result).toHaveLength(CHANGELOG_MAX_ENTRIES);
    expect(result[CHANGELOG_MAX_ENTRIES - 1].id).toBe('new');
    // Oldest entry dropped
    expect(result[0].id).toBe('t1');
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
    expect(product._changeLog).toHaveLength(1);
    expect(product._changeLog[0].op).toBe('create');
    expect(product._changeLog[0].entity).toBe('product');
    expect(product._changeLog[0].t).toBeGreaterThan(0);
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
  const original = {
    id: 'orig-id',
    name: 'Original',
    description: 'desc',
    schemaVersion: SCHEMA_VERSION,
    sizeMapping: [...DEFAULT_SIZE_MAPPING],
    sprintCadenceWeeks: 2,
    releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
    sprints: [{ id: 'sp-1', name: 'Sprint 1', order: 1 }],
    themes: [{
      id: 't1',
      name: 'Theme 1',
      order: 1,
      backboneItems: [{
        id: 'b1',
        name: 'Backbone 1',
        order: 1,
        ribItems: [{
          id: 'r1',
          name: 'Rib 1',
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
    // Release IDs should be different
    expect(dup.releases[0].id).not.toBe('rel-1');
    // Sprint IDs should be different
    expect(dup.sprints[0].id).not.toBe('sp-1');
    // Theme/backbone/rib IDs should be different
    const dupRib = dup.themes[0].backboneItems[0].ribItems[0];
    expect(dupRib.id).not.toBe('r1');
    // Rib's allocation should reference the new release ID
    expect(dupRib.releaseAllocations[0].releaseId).toBe(dup.releases[0].id);
    // Progress history should reference the new sprint ID and release ID
    expect(dupRib.progressHistory[0].sprintId).toBe(dup.sprints[0].id);
    expect(dupRib.progressHistory[0].releaseId).toBe(dup.releases[0].id);
  });

  it('remaps releaseCardOrder keys and values', () => {
    const dup = duplicateProduct(original);
    const newRelId = dup.releases[0].id;
    const newRibId = dup.themes[0].backboneItems[0].ribItems[0].id;
    expect(dup.releaseCardOrder[newRelId]).toEqual([newRibId]);
    expect(dup.releaseCardOrder['unassigned']).toEqual([]);
    // Old keys should not exist
    expect(dup.releaseCardOrder['rel-1']).toBeUndefined();
  });

  it('preserves rib data (size, category, name)', () => {
    const dup = duplicateProduct(original);
    const dupRib = dup.themes[0].backboneItems[0].ribItems[0];
    expect(dupRib.name).toBe('Rib 1');
    expect(dupRib.size).toBe('M');
    expect(dupRib.category).toBe('core');
  });

  it('handles multiple releases with cross-references', () => {
    const multi = {
      ...original,
      releases: [
        { id: 'rel-1', name: 'R1', order: 1 },
        { id: 'rel-2', name: 'R2', order: 2 },
        { id: 'rel-3', name: 'R3', order: 3 },
      ],
      themes: [{
        id: 't1', name: 'T1', order: 1,
        backboneItems: [{
          id: 'b1', name: 'B1', order: 1,
          ribItems: [{
            id: 'r1', name: 'Rib', size: 'M', category: 'core', order: 1,
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
    const dupRib = dup.themes[0].backboneItems[0].ribItems[0];
    // Each allocation references consistent new release IDs
    const newRel1 = dup.releases[0].id;
    const newRel2 = dup.releases[1].id;
    expect(dupRib.releaseAllocations[0].releaseId).toBe(newRel1);
    expect(dupRib.releaseAllocations[1].releaseId).toBe(newRel2);
    // Progress also references the same remapped IDs
    expect(dupRib.progressHistory[0].releaseId).toBe(newRel1);
    expect(dupRib.progressHistory[1].releaseId).toBe(newRel2);
    // Card order keys remapped
    expect(dup.releaseCardOrder[newRel1]).toBeDefined();
    expect(dup.releaseCardOrder[newRel2]).toBeDefined();
  });

  it('handles empty releaseCardOrder', () => {
    const noOrder = { ...original };
    delete noOrder.releaseCardOrder;
    const dup = duplicateProduct(noOrder);
    expect(dup.releaseCardOrder).toEqual({});
  });

  it('handles progressHistory entries without releaseId (legacy)', () => {
    const legacy = {
      ...original,
      themes: [{
        id: 't1', name: 'T1', order: 1,
        backboneItems: [{
          id: 'b1', name: 'B1', order: 1,
          ribItems: [{
            id: 'r1', name: 'Rib', size: 'M', category: 'core', order: 1,
            releaseAllocations: [],
            progressHistory: [
              { sprintId: 'sp-1', percentComplete: 50 },
            ],
          }],
        }],
      }],
    };
    const dup = duplicateProduct(legacy);
    const entry = dup.themes[0].backboneItems[0].ribItems[0].progressHistory[0];
    expect(entry.sprintId).toBe(dup.sprints[0].id);
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
    expect(dup._changeLog).toHaveLength(1);
    expect(dup._changeLog[0].op).toBe('duplicate');
    expect(dup._changeLog[0].entity).toBe('product');
    expect(dup._changeLog[0].source).toBe('orig-id');
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
    expect(() => importProductFromJSON(JSON.stringify({}))).toThrow('missing required fields');
    expect(() => importProductFromJSON(JSON.stringify({ id: 'x' }))).toThrow('missing required fields');
    expect(() => importProductFromJSON(JSON.stringify({ id: 'x', name: 'N' }))).toThrow('missing required fields');
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
    expect(() => importProductFromJSON(json)).toThrow('theme missing id or backboneItems');
  });

  it('throws for theme missing id', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', schemaVersion: SCHEMA_VERSION,
      themes: [{ backboneItems: [] }],
    });
    expect(() => importProductFromJSON(json)).toThrow('theme missing id or backboneItems');
  });

  it('throws for backbone missing ribItems', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', schemaVersion: SCHEMA_VERSION,
      themes: [{ id: 't1', backboneItems: [{ id: 'b1' }] }],
    });
    expect(() => importProductFromJSON(json)).toThrow('backbone missing id or ribItems');
  });

  it('throws for backbone missing id', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', schemaVersion: SCHEMA_VERSION,
      themes: [{ id: 't1', backboneItems: [{ ribItems: [] }] }],
    });
    expect(() => importProductFromJSON(json)).toThrow('backbone missing id or ribItems');
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
    expect(result.themes[0].backboneItems[0].ribItems).toHaveLength(1);
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
    expect(result._changeLog).toHaveLength(2);
    expect(result._changeLog[1].op).toBe('import');
    expect(result._changeLog[1].source).toBe('file');
  });

  it('creates _changeLog with import event if none existed', () => {
    const json = JSON.stringify({
      id: 'x', name: 'N', themes: [], schemaVersion: SCHEMA_VERSION,
    });
    const result = importProductFromJSON(json);
    expect(result._changeLog).toHaveLength(1);
    expect(result._changeLog[0].op).toBe('import');
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

// --- exportProduct ---
describe('exportProduct', () => {
  let capturedBlob;

  beforeEach(() => {
    capturedBlob = null;
    // Mock DOM APIs for export
    vi.stubGlobal('URL', {
      createObjectURL: (blob) => { capturedBlob = blob; return 'blob:mock'; },
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('document', {
      createElement: () => ({ click: vi.fn(), set href(_) {}, set download(_) {} }),
    });
  });

  it('uses storageRefOverride for _storageRef when provided', async () => {
    const product = { id: 'p1', name: 'Test', themes: [] };
    exportProduct(product, 'firebase-uid-789');
    const text = await capturedBlob.text();
    const data = JSON.parse(text);
    expect(data._storageRef).toBe('firebase-uid-789');
  });

  it('falls back to getWorkspaceId() when storageRefOverride is not provided', async () => {
    const product = { id: 'p1', name: 'Test', themes: [] };
    exportProduct(product);
    const text = await capturedBlob.text();
    const data = JSON.parse(text);
    expect(data._storageRef).toBe(getWorkspaceId());
  });
});
