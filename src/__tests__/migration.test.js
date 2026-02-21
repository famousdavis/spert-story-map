import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

// Mock localStorage
const store = {};
vi.stubGlobal('localStorage', {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: (key) => { delete store[key]; },
  clear: () => { for (const key of Object.keys(store)) delete store[key]; },
});

// Mock firebase.js
vi.mock('../lib/firebase', () => ({
  db: { type: 'mock-firestore' },
  auth: null,
  isFirebaseAvailable: true,
}));

// Mock firebase/firestore
const mockDocs = new Map();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ _path: `${collection}/${id}` })),
  getDoc: vi.fn(async (ref) => {
    const data = mockDocs.get(ref._path);
    return {
      exists: () => !!data,
      data: () => data || null,
      id: ref._path.split('/').pop(),
    };
  }),
  setDoc: vi.fn(async (ref, data) => {
    mockDocs.set(ref._path, data);
  }),
  getDocs: vi.fn(async () => {
    const docs = [];
    for (const [path, data] of mockDocs) {
      if (path.startsWith('spertstorymap_projects/')) {
        docs.push({
          id: path.split('/').pop(),
          data: () => data,
        });
      }
    }
    return { forEach: (fn) => docs.forEach(fn), docs, empty: docs.length === 0 };
  }),
  collection: vi.fn((_db, name) => ({ _name: name })),
  query: vi.fn((...args) => args[0]),
  where: vi.fn(() => null),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

import { migrateLocalToCloud, migrateCloudToLocal } from '../lib/migration';
import { setDoc, getDoc } from 'firebase/firestore';

beforeEach(() => {
  uuidCounter = 0;
  localStorage.clear();
  mockDocs.clear();
  vi.clearAllMocks();
});

function createLocalProduct(id, name) {
  return {
    id,
    name,
    schemaVersion: 2,
    themes: [],
    releases: [],
    sprints: [],
    sizeMapping: [],
    _changeLog: [],
  };
}

function seedLocalStorage(products) {
  const index = products.map(p => ({ id: p.id, name: p.name, updatedAt: new Date().toISOString() }));
  localStorage.setItem('rp_products_index', JSON.stringify(index));
  for (const p of products) {
    localStorage.setItem(`rp_product_${p.id}`, JSON.stringify(p));
  }
}

// ── migrateLocalToCloud ─────────────────────────────────────────

describe('migrateLocalToCloud', () => {
  it('uploads local products to Firestore', async () => {
    const product = createLocalProduct('proj-1', 'My Project');
    seedLocalStorage([product]);

    const result = await migrateLocalToCloud('user-1');

    expect(result.uploaded).toBe(1);
    expect(result.skipped).toBe(0);
    expect(setDoc).toHaveBeenCalled();
    // Verify owner and members are set
    const call = setDoc.mock.calls.find(c => c[0]._path.includes('proj-1'));
    expect(call[1].owner).toBe('user-1');
    expect(call[1].members).toEqual({ 'user-1': 'owner' });
  });

  it('skips products that already exist in cloud with user as member', async () => {
    const product = createLocalProduct('proj-1', 'My Project');
    seedLocalStorage([product]);
    // Pre-populate Firestore with existing doc
    mockDocs.set('spertstorymap_projects/proj-1', {
      ...product,
      owner: 'user-1',
      members: { 'user-1': 'owner' },
    });

    const result = await migrateLocalToCloud('user-1');

    expect(result.uploaded).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('generates new ID if doc exists but user is not a member', async () => {
    const product = createLocalProduct('proj-1', 'My Project');
    seedLocalStorage([product]);
    // Pre-populate with someone else's project
    mockDocs.set('spertstorymap_projects/proj-1', {
      ...product,
      owner: 'other-user',
      members: { 'other-user': 'owner' },
    });

    const result = await migrateLocalToCloud('user-1');

    expect(result.uploaded).toBe(1);
    expect(result.skipped).toBe(0);
    // Should have used a new ID (uuid-1)
    const call = setDoc.mock.calls.find(c => c[0]._path.includes('uuid-'));
    expect(call).toBeTruthy();
  });

  it('appends cloud-migration to changelog', async () => {
    const product = createLocalProduct('proj-1', 'My Project');
    product._changeLog = [{ t: 1000, op: 'create', entity: 'product' }];
    seedLocalStorage([product]);

    await migrateLocalToCloud('user-1');

    const call = setDoc.mock.calls.find(c => c[0]._path.includes('proj-1'));
    const log = call[1]._changeLog;
    expect(log.length).toBe(2);
    expect(log[1].op).toBe('cloud-migration');
    expect(log[1].uid).toBe('user-1');
  });

  it('migrates preferences', async () => {
    seedLocalStorage([]);
    localStorage.setItem('rp_app_preferences', JSON.stringify({ exportName: 'Alice' }));

    await migrateLocalToCloud('user-1');

    const prefsCall = setDoc.mock.calls.find(c => c[0]._path.includes('spertstorymap_settings'));
    expect(prefsCall[1]).toEqual({ exportName: 'Alice' });
  });

  it('leaves local data in place as backup', async () => {
    const product = createLocalProduct('proj-1', 'My Project');
    seedLocalStorage([product]);

    await migrateLocalToCloud('user-1');

    // Local data should still be there
    expect(localStorage.getItem('rp_product_proj-1')).toBeTruthy();
    expect(localStorage.getItem('rp_products_index')).toBeTruthy();
  });
});

// ── migrateCloudToLocal ─────────────────────────────────────────

describe('migrateCloudToLocal', () => {
  it('downloads owned projects to localStorage', async () => {
    mockDocs.set('spertstorymap_projects/proj-1', {
      name: 'Cloud Project',
      schemaVersion: 2,
      themes: [],
      releases: [],
      sprints: [],
      sizeMapping: [],
      _changeLog: [],
      owner: 'user-1',
      members: { 'user-1': 'owner' },
    });

    const result = await migrateCloudToLocal('user-1');

    expect(result.ownedCount).toBe(1);
    expect(result.sharedCount).toBe(0);
    // Should be saved to localStorage
    const saved = JSON.parse(localStorage.getItem('rp_product_proj-1'));
    expect(saved.name).toBe('Cloud Project');
    // Should not contain Firestore fields
    expect(saved.owner).toBeUndefined();
    expect(saved.members).toBeUndefined();
  });

  it('skips shared projects (counts them but does not download)', async () => {
    mockDocs.set('spertstorymap_projects/proj-shared', {
      name: 'Shared Project',
      schemaVersion: 2,
      themes: [],
      releases: [],
      sprints: [],
      sizeMapping: [],
      _changeLog: [],
      owner: 'other-user',
      members: { 'other-user': 'owner', 'user-1': 'editor' },
    });

    const result = await migrateCloudToLocal('user-1');

    expect(result.ownedCount).toBe(0);
    expect(result.sharedCount).toBe(1);
    expect(localStorage.getItem('rp_product_proj-shared')).toBeNull();
  });

  it('appends local-migration to changelog', async () => {
    mockDocs.set('spertstorymap_projects/proj-1', {
      name: 'Project',
      schemaVersion: 2,
      themes: [],
      releases: [],
      sprints: [],
      sizeMapping: [],
      _changeLog: [{ t: 1000, op: 'create', entity: 'product' }],
      owner: 'user-1',
      members: { 'user-1': 'owner' },
    });

    await migrateCloudToLocal('user-1');

    const saved = JSON.parse(localStorage.getItem('rp_product_proj-1'));
    const log = saved._changeLog;
    expect(log.length).toBe(2);
    expect(log[1].op).toBe('local-migration');
  });
});
