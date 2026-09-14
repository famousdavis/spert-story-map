// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.53.7 — what `createProduct` and `replaceProduct` may put on the wire.
 *
 * ⚠️ THE TWO HALVES ARE OPPOSITE, AND THAT IS THE POINT. `createProduct` STRIPS
 * the `_owner`/`_members` aliases; `replaceProduct` CARRIES THEM FORWARD. An
 * implementer who reads "strip the alias junk" and applies it to both re-breaks
 * the very defect this release fixes, because `replaceProduct`'s `tx.set` is
 * UNMERGED — omitting a key the stored document has is a REMOVAL, a removal
 * counts in `diff().affectedKeys()`, and `allow update`'s `hasOnly()` denies it.
 *
 * ⚠️ THESE ASSERTIONS READ THE REAL DRIVER. The prior instrument for this was an
 * emulator probe that built its payload BY HAND, so it never executed
 * `replaceProduct` and passed under both implementations — it could not refuse
 * the mistake it existed to catch. Every expectation below is taken off
 * `mockTxSet` / `mockSetDoc`, i.e. off what the driver actually passed to
 * Firestore.
 *
 * ⚠️ `toBeUndefined()` PASSES ON A MISSING KEY, so an absence is asserted with
 * `'k' in payload` — `expect(payload._owner).toBeUndefined()` would also pass if
 * the whole payload were empty, or if the driver threw and we asserted on a
 * stale call. Presence of a control key is asserted alongside every absence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Product } from '../types';

const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockTxSet = vi.fn();

/** The stored pre-image `replaceProduct`'s transaction reads. Per-test. */
let existingDoc: Record<string, unknown> | null = null;

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  collection: (_db: unknown, col: string) => ({ col }),
  query: (...args: unknown[]) => ({ args }),
  where: (...args: unknown[]) => ({ args }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: (...a: unknown[]) => mockSetDoc(...a),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  deleteField: () => ({ _deleteField: true }),
  onSnapshot: vi.fn(() => () => {}),
  arrayUnion: (...args: unknown[]) => ({ _arrayUnion: args }),
  runTransaction: async (
    _db: unknown,
    fn: (tx: { get: () => Promise<unknown>; set: unknown }) => Promise<void>,
  ) => fn({
    get: async () => ({
      exists: () => existingDoc !== null,
      data: () => existingDoc ?? {},
    }),
    set: mockTxSet,
  }),
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
const { createNewProduct } = await import('../lib/storage');

const UID = 'uid-hygiene';
const OTHER = 'uid-someone-else';

/** The five fields neither surface may originate. */
const FORBIDDEN_AT_CREATE = [
  '_owner', '_members', '_storageRef', '_exportedBy', '_exportedById',
] as const;

/**
 * A product shaped like the one a cloud-mode Duplicate produces: the aliases are
 * re-attached on read (firestoreDriver loadProduct / loadProductIndex /
 * onProductChange) and `duplicateProduct` spreads the loaded product wholesale.
 */
function duplicatedCloudProduct(): Product {
  const p = createNewProduct('Hygiene Product') as Product & Record<string, unknown>;
  p._owner = OTHER;
  p._members = { [OTHER]: 'owner' };
  p._storageRef = 'workspace-abc';
  p._exportedBy = 'A Student';
  p._exportedById = '12345678';
  // Not written by any production path (loadProduct destructures the canonical
  // pair out into the aliases), but present here so the assertions below have
  // power over the ORDER of the create payload's object literal: `owner: uid`
  // must come after the `...data` spread, or a product carrying a foreign owner
  // would overwrite the caller's — which `allow create` then denies.
  p.owner = OTHER;
  p.members = { [OTHER]: 'owner' };
  return p as Product;
}

function lastPayload(mock: typeof mockSetDoc): Record<string, unknown> {
  expect(mock.mock.calls.length, 'the driver performed a write').toBeGreaterThan(0);
  const calls = mock.mock.calls;
  const payload = calls[calls.length - 1]?.[1] as Record<string, unknown> | undefined;
  expect(payload, 'the write carried a payload').toBeDefined();
  return payload!;
}

beforeEach(() => {
  mockSetDoc.mockClear();
  mockTxSet.mockClear();
  existingDoc = null;
});

describe('createProduct — strips five fields and only five', () => {
  it('omits every alias and export-attribution field', async () => {
    const driver = createFirestoreDriver(UID);
    await driver.createProduct(duplicatedCloudProduct());
    const payload = lastPayload(mockSetDoc);

    for (const field of FORBIDDEN_AT_CREATE) {
      expect(field in payload, `${field} must not reach Firestore at create`).toBe(false);
    }
    // Control on the same payload: a field that MUST survive. Without this the
    // loop above is satisfied by an empty object.
    expect(payload.name, 'control — a real field survived the strip').toBe('Hygiene Product');
  });

  it('still writes owner and members, which allow create binds against', async () => {
    const driver = createFirestoreDriver(UID);
    await driver.createProduct(duplicatedCloudProduct());
    const payload = lastPayload(mockSetDoc);

    // The rule requires owner == caller and members[caller] == 'owner'. Stripping
    // these the way doSaveProduct does would make every create denied.
    expect(payload.owner).toBe(UID);
    expect(payload.members).toEqual({ [UID]: 'owner' });
    // And the source product's foreign owner must not have survived into them.
    expect(payload.owner).not.toBe(OTHER);
  });

  it('⚠️ still writes _changeLog — doSaveProduct strips it and createProduct must NOT', async () => {
    // The trap this test exists for: `_changeLog` is the academic-integrity audit
    // trail, and createProduct calls resetChangeLogBaseline() with it immediately
    // after the write — recording those entries as already-on-server. Strip it and
    // the create-time entry is never written AND never re-sent by arrayUnion, so
    // the provenance is lost silently and permanently.
    const p = duplicatedCloudProduct();
    const driver = createFirestoreDriver(UID);
    await driver.createProduct(p);
    const payload = lastPayload(mockSetDoc);

    expect('_changeLog' in payload, '_changeLog must reach Firestore at create').toBe(true);
    expect(Array.isArray(payload._changeLog)).toBe(true);
    expect((payload._changeLog as unknown[]).length).toBeGreaterThan(0);
    // _originRef is the other provenance field and is equally not-stripped.
    expect(payload._originRef).toBe(p._originRef);
  });
});

describe('replaceProduct — carries stored aliases forward, never introduces them', () => {
  it('A6: CARRIES _owner/_members forward when the stored document has them', async () => {
    // A pre-v0.53.7 Duplicate-created document. Omitting these keys is a REMOVAL,
    // and the update rule denies a removal — which is what made these documents
    // permanently un-replaceable by import.
    existingDoc = {
      owner: UID,
      members: { [UID]: 'owner' },
      createdAt: '2026-01-01T00:00:00.000Z',
      _originRef: 'workspace-original',
      _owner: UID,
      _members: { [UID]: 'owner' },
    };

    const driver = createFirestoreDriver(UID);
    await driver.replaceProduct(createNewProduct('Replacement'));
    const payload = lastPayload(mockTxSet);

    expect('_owner' in payload, '_owner must be carried forward').toBe(true);
    expect('_members' in payload, '_members must be carried forward').toBe(true);
    expect(payload._owner).toBe(UID);
    expect(payload._members).toEqual({ [UID]: 'owner' });
    // The four fields already preserved before this release, as a control that the
    // transaction really read the pre-image rather than defaulting.
    expect(payload.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(payload._originRef).toBe('workspace-original');
  });

  it('A6b: OMITS them entirely when the stored document does not have them', async () => {
    // The common path. `existing._owner ?? data._owner` would be `undefined` here —
    // validateProduct drops the aliases, so data._owner is always absent — and
    // firebase.ts does not set ignoreUndefinedProperties, so that form throws
    // "Unsupported field value: undefined" on every replace onto a clean document.
    existingDoc = {
      owner: UID,
      members: { [UID]: 'owner' },
      createdAt: '2026-02-02T00:00:00.000Z',
      _originRef: 'workspace-clean',
    };

    const driver = createFirestoreDriver(UID);
    await driver.replaceProduct(createNewProduct('Replacement'));
    const payload = lastPayload(mockTxSet);

    // `in`, not toBeUndefined(): an explicit `_owner: undefined` is what throws,
    // and toBeUndefined() cannot tell it from an absent key.
    expect('_owner' in payload, '_owner must not be introduced').toBe(false);
    expect('_members' in payload, '_members must not be introduced').toBe(false);
    expect(payload._originRef, 'control — the pre-image was read').toBe('workspace-clean');
  });

  it('A6b: omits them on a document that does not exist yet', async () => {
    existingDoc = null;

    const driver = createFirestoreDriver(UID);
    await driver.replaceProduct(createNewProduct('Brand New'));
    const payload = lastPayload(mockTxSet);

    expect('_owner' in payload).toBe(false);
    expect('_members' in payload).toBe(false);
    // Falls back to the caller, which is the pre-existing behaviour.
    expect(payload.owner).toBe(UID);
    expect(payload.members).toEqual({ [UID]: 'owner' });
  });
});
