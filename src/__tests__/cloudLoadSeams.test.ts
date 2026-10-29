// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The three cloud read seams in `firestoreDriver.ts` — the project list
 * (`loadProductIndex`), opening a project (`loadProduct`) and the live listener
 * (`onProductChange`) — against documents another user can write.
 *
 * ⚠️ THROUGH THE REAL DRIVER, NOT THE GUARD ALONE. What failed before was the
 * seam: `migrateToV2` iterating a non-list inside `snap.forEach`, and the
 * changelog baseline calling `.map` on a non-list, both took the WHOLE list
 * down for every project on it. A guard tested in isolation passes whether or
 * not the seam calls it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
let snapshotHandler: ((snap: unknown) => void) | null = null;

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  collection: (_db: unknown, col: string) => ({ col }),
  query: (...args: unknown[]) => ({ args }),
  where: (...args: unknown[]) => ({ args }),
  getDoc: (...a: unknown[]) => mockGetDoc(...a),
  getDocs: (...a: unknown[]) => mockGetDocs(...a),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  deleteField: () => ({ _deleteField: true }),
  onSnapshot: (_ref: unknown, next: (snap: unknown) => void) => { snapshotHandler = next; return () => {}; },
  arrayUnion: (...args: unknown[]) => ({ _arrayUnion: args }),
  runTransaction: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({ db: {} }));

const { createFirestoreDriver } = await import('../lib/firestoreDriver');
const { isGuardedLoad, dismissGuardedLoad } = await import('../lib/cloudLoadNotices');
const { getAllRibItems, getTotalProjectPoints, getProjectPercentComplete } = await import('../lib/calculations');

const UID = 'victim-uid';
const HOSTILE = 'HOSTILE-VALUE';

const docSnap = (id: string, data: Record<string, unknown>) => ({ id, data: () => structuredClone(data), exists: () => true, metadata: { hasPendingWrites: false } });

function goodDoc(name: string) {
  return {
    name, description: '', schemaVersion: 2, owner: 'someone', members: { someone: 'owner', [UID]: 'editor' },
    sizeMapping: [{ label: 'M', points: 5 }], releases: [{ id: 'r1', name: 'R1', order: 1 }], sprints: [],
    themes: [{ id: 't', name: 'T', order: 1, backboneItems: [{ id: 'b', name: 'B', order: 1, ribItems: [
      { id: 'k', name: 'Rib', description: '', order: 1, size: 'M', category: 'core', releaseAllocations: [{ releaseId: 'r1', percentage: 100 }], progressHistory: [] },
    ] }] }],
    _changeLog: [{ t: 1, op: 'create' }],
  };
}

/** Shape damage at the top level: a name a React child cannot be, no lists. */
const shapeHostile = { ...goodDoc('x'), name: { evil: HOSTILE }, themes: 5, _changeLog: 7, releases: 'x' };

/** Damage that only bites when the v1→v2 migration runs (schemaVersion < 2). */
const migrationHostile = {
  ...goodDoc('m'), schemaVersion: 1,
  themes: [{ id: 't', name: 'T', order: 1, backboneItems: [{ id: 'b', name: 'B', order: 1, ribItems: [
    { id: 'k1', name: 'Bad', description: '', order: 1, size: 'M', category: 'core', releaseAllocations: 5, progressHistory: { evil: HOSTILE } },
    { id: 'k2', name: 'Good', description: '', order: 2, size: 'M', category: 'core', releaseAllocations: [{ releaseId: 'r1', percentage: 100 }], progressHistory: [{ sprintId: 's1', percentComplete: 30 }] },
  ] }] }],
};

const summarise = (p: Parameters<typeof getAllRibItems>[0]) =>
  [getAllRibItems(p).length, getTotalProjectPoints(p), getProjectPercentComplete(p)];

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mockGetDoc.mockReset();
  mockGetDocs.mockReset();
  snapshotHandler = null;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  for (const id of ['a', 'h1', 'h2', 'b']) dismissGuardedLoad(id);
});

describe('project list (loadProductIndex)', () => {
  it('lists every project, hostile ones included, and each can be summarised', async () => {
    const snaps = [docSnap('a', goodDoc('A')), docSnap('h1', shapeHostile), docSnap('h2', migrationHostile), docSnap('b', goodDoc('B'))];
    mockGetDocs.mockResolvedValue({ forEach: (fn: (s: unknown) => void) => snaps.forEach(fn) });

    const products = await createFirestoreDriver(UID).loadProductIndex();

    expect(products.map(p => p.id)).toEqual(['a', 'h1', 'h2', 'b']);
    for (const p of products) expect(() => summarise(p)).not.toThrow();
    const h1 = products[1];
    expect(h1?.name).toBe('');
    expect(h1?.themes).toEqual([]);
    // The authorisation aliases are re-attached AFTER the guard, untouched.
    expect(h1?._owner).toBe('someone');
    expect(h1?._members).toEqual({ someone: 'owner', [UID]: 'editor' });
    // The migration still ran for the valid rib beside the bad one.
    const h2Ribs = products[2]?.themes[0]?.backboneItems[0]?.ribItems;
    expect(h2Ribs?.map(r => r.id)).toEqual(['k1', 'k2']);
    expect(h2Ribs?.[1]?.progressHistory).toEqual([{ sprintId: 's1', releaseId: 'r1', percentComplete: 30 }]);
  });

  it('logs rule ids, never the value, and raises no notice from the list', async () => {
    const snaps = [docSnap('h1', shapeHostile)];
    mockGetDocs.mockResolvedValue({ forEach: (fn: (s: unknown) => void) => snaps.forEach(fn) });
    await createFirestoreDriver(UID).loadProductIndex();
    const logged = warn.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(logged).toContain('product.name');
    expect(logged).not.toContain(HOSTILE);
    expect(isGuardedLoad('h1')).toBe(false);
  });

  it('a clean list warns about nothing', async () => {
    const snaps = [docSnap('a', goodDoc('A'))];
    mockGetDocs.mockResolvedValue({ forEach: (fn: (s: unknown) => void) => snaps.forEach(fn) });
    await createFirestoreDriver(UID).loadProductIndex();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('opening a project (loadProduct) and the live listener (onProductChange)', () => {
  it('opens a hostile project with the damage set aside, and raises the notice', async () => {
    mockGetDoc.mockResolvedValue(docSnap('h2', migrationHostile));
    const p = await createFirestoreDriver(UID).loadProduct('h2');
    expect(p).not.toBeNull();
    expect(() => summarise(p!)).not.toThrow();
    expect(isGuardedLoad('h2')).toBe(true);
  });

  it('opens a clean project with no notice', async () => {
    mockGetDoc.mockResolvedValue(docSnap('a', goodDoc('A')));
    const p = await createFirestoreDriver(UID).loadProduct('a');
    expect(p?.name).toBe('A');
    expect(isGuardedLoad('a')).toBe(false);
  });

  it('delivers a guarded product from a hostile snapshot rather than throwing into the SDK', () => {
    const cb = vi.fn();
    createFirestoreDriver(UID).onProductChange('h1', cb);
    expect(() => snapshotHandler!(docSnap('h1', shapeHostile))).not.toThrow();
    expect(cb).toHaveBeenCalledTimes(1);
    const delivered = cb.mock.calls[0]![0];
    expect(delivered.name).toBe('');
    expect(delivered._members).toEqual({ someone: 'owner', [UID]: 'editor' });
    expect(isGuardedLoad('h1')).toBe(true);
  });
});
