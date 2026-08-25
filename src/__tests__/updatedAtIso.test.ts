// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * PC-2 (Brief 19) — every project-collection write emits an ISO 8601 string.
 *
 * ⚠️ SITES, NOT MODULES. This repo has FOUR `updatedAt` write sites across two
 * modules, and one test per module would satisfy a per-module reading while
 * leaving a site unconverted — which is exactly the defect Brief 19 fixes, and
 * exactly what `migration.ts` did: it was missed in the first pass while its
 * identical twin in Scheduler was caught. Each site gets its own entry point:
 *
 *   doSaveProduct      (firestoreDriver.ts) — via saveProductImmediate
 *   createProduct      (firestoreDriver.ts)
 *   replaceProduct     (firestoreDriver.ts)
 *   migrateLocalToCloud (migration.ts)      — the one v1 missed
 *
 * ⚠️ THE SHAPE IS THE ASSERTION, NOT THE TYPE. `typeof === 'string'` passes for
 * "now", and it is the ISO shape specifically that makes lexicographic order
 * chronological. Before this change these sites wrote a `serverTimestamp()`
 * sentinel — an object — so a type check would have failed too; but the regex
 * is what keeps the condition meaningful against a future well-meant
 * `new Date().toString()`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const ISO_8601_MS_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockTxSet = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  collection: (_db: unknown, col: string) => ({ col }),
  query: (...args: unknown[]) => ({ args }),
  where: (...args: unknown[]) => ({ args }),
  getDoc: (...a: unknown[]) => mockGetDoc(...a),
  getDocs: (...a: unknown[]) => mockGetDocs(...a),
  setDoc: (...a: unknown[]) => mockSetDoc(...a),
  updateDoc: (...a: unknown[]) => mockUpdateDoc(...a),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  deleteField: () => ({ _deleteField: true }),
  onSnapshot: vi.fn(() => () => {}),
  arrayUnion: (...args: unknown[]) => ({ _arrayUnion: args }),
  runTransaction: async (
    _db: unknown,
    fn: (tx: { get: () => Promise<unknown>; set: unknown }) => Promise<void>,
  ) => fn({ get: async () => ({ exists: () => false, data: () => ({}) }), set: mockTxSet }),
  // Deliberately still exported: removing it from the mock would make an
  // accidental reintroduction fail with a module error rather than with this
  // suite's assertion, which is a worse signal.
  serverTimestamp: () => ({ _methodName: 'serverTimestamp' }),
}));

vi.mock('../lib/firebase', () => ({ db: {} }));

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: unknown) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() { return Object.keys(store).length; },
});

const { createFirestoreDriver } = await import('../lib/firestoreDriver');
const { migrateLocalToCloud } = await import('../lib/migration');
const { createNewProduct, saveProductImmediate } = await import('../lib/storage');

const UID = 'uid-pc2';

function product() {
  const p = createNewProduct('PC-2 Product');
  return p;
}

/** The `updatedAt` of the most recent write, whichever mock carried it. */
function lastWrittenUpdatedAt(): unknown {
  const calls = [
    ...mockSetDoc.mock.calls,
    ...mockTxSet.mock.calls,
  ];
  for (let i = calls.length - 1; i >= 0; i--) {
    const payload = calls[i]?.[1] as Record<string, unknown> | undefined;
    if (payload && 'updatedAt' in payload) return payload.updatedAt;
  }
  return undefined;
}

function expectIso(value: unknown) {
  expect(typeof value).toBe('string');
  expect(value as string).toMatch(ISO_8601_MS_UTC);
  // Round-trips to the instant it encodes — rules out a well-formed string
  // that does not actually denote the time it claims to.
  expect(new Date(value as string).toISOString()).toBe(value);
}

beforeEach(() => {
  mockSetDoc.mockClear();
  mockUpdateDoc.mockClear();
  mockTxSet.mockClear();
  mockGetDoc.mockReset();
  mockGetDocs.mockReset();
  mockGetDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
  mockGetDocs.mockResolvedValue({ docs: [] });
  for (const k of Object.keys(store)) delete store[k];
});

describe('project writes emit ISO 8601 updatedAt (PC-2)', () => {
  it('site 1 — doSaveProduct, via saveProductImmediate', async () => {
    const driver = createFirestoreDriver(UID);
    await driver.saveProductImmediate(product());
    expectIso(lastWrittenUpdatedAt());
  });

  it('site 2 — createProduct', async () => {
    const driver = createFirestoreDriver(UID);
    await driver.createProduct(product());
    expectIso(lastWrittenUpdatedAt());
  });

  it('site 3 — replaceProduct', async () => {
    const driver = createFirestoreDriver(UID);
    await driver.replaceProduct(product());
    expectIso(lastWrittenUpdatedAt());
  });

  it('site 4 — migrateLocalToCloud, the local->cloud path v1 missed', async () => {
    // ⚠️ Without this site, a user migrating local->cloud silently re-acquires
    // the old shape after everything else is converted. Latent, not loud.
    const p = product();
    saveProductImmediate(p);
    await migrateLocalToCloud(UID);
    expectIso(lastWrittenUpdatedAt());
  });

  it('no project write anywhere emits an unresolved serverTimestamp sentinel', async () => {
    const driver = createFirestoreDriver(UID);
    await driver.createProduct(product());
    await driver.saveProductImmediate(product());
    await driver.replaceProduct(product());

    const payloads = [...mockSetDoc.mock.calls, ...mockTxSet.mock.calls]
      .map((c) => c?.[1] as Record<string, unknown> | undefined)
      .filter((p): p is Record<string, unknown> => !!p);
    expect(payloads.length).toBeGreaterThan(0); // harness control: it looked
    for (const payload of payloads) {
      expect(payload.updatedAt).not.toEqual({ _methodName: 'serverTimestamp' });
    }
  });
});
