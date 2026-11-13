// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * The Firestore read path normalizes `updatedAt` before anything renders it.
 *
 * Moved here unchanged from `projectCardUpdatedAt.test.tsx` (v0.55.0), where it sat
 * beside the project card's date tests. The card no longer shows a date, but this
 * block never depended on the card: it pins the CONVERTER half on its own.
 * Without it, deleting every `normalizeUpdatedAt` call from `firestoreDriver.ts`
 * passes — measured, not assumed, when it was written.
 *
 * It matters beyond the project list: `useProduct` derives `lastSaved` from the
 * same field and `ProductLayout` renders it through `formatRelativeTime`, which
 * has no normalization of its own. A degraded value reaching the store surfaces
 * there.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mid-day UTC so the local calendar date is the same in every real timezone.
const INSTANT_ISO = '2026-03-14T10:20:30.000Z';
const INSTANT_MS = Date.parse(INSTANT_ISO);

const mockGetDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  collection: (_db: unknown, col: string) => ({ col }),
  query: (...args: unknown[]) => ({ args }),
  where: (...args: unknown[]) => ({ args }),
  getDoc: (...a: unknown[]) => mockGetDoc(...a),
  getDocs: vi.fn().mockResolvedValue({ docs: [], forEach: () => {} }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  deleteField: () => ({ _deleteField: true }),
  onSnapshot: vi.fn(() => () => {}),
  arrayUnion: (...args: unknown[]) => ({ _arrayUnion: args }),
  serverTimestamp: () => ({ _methodName: 'serverTimestamp' }),
  runTransaction: vi.fn(),
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

/** A complete stored project doc, with `updatedAt` swapped for the shape under test. */
function docWith(updatedAt: unknown): Record<string, unknown> {
  const d: Record<string, unknown> = {
    name: 'Shape Under Test',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 2,
    sizeMapping: [{ label: 'M', points: 3 }],
    releases: [], sprints: [], themes: [],
    owner: 'uid-1', members: { 'uid-1': 'owner' },
  };
  // Absent is not the same as present-and-undefined: a document that never
  // carried the field is exactly the case `undefined` is standing in for.
  if (updatedAt !== '__ABSENT__') d.updatedAt = updatedAt;
  return d;
}

/** The route a real cloud document takes: Firestore read -> Product. */
async function readThroughDriver(updatedAt: unknown) {
  mockGetDoc.mockResolvedValue({
    exists: () => true,
    id: 'p1',
    data: () => docWith(updatedAt),
  });
  const product = await createFirestoreDriver('uid-1').loadProduct('p1');
  if (!product) throw new Error('harness control: loadProduct returned null');
  return product;
}

beforeEach(() => { mockGetDoc.mockReset(); for (const k of Object.keys(store)) delete store[k]; });

/**
 * The re-derived shape universe (Brief 22 §1.2). `origin` is why the shape can be
 * in a document.
 */
const RECOVERABLE: [string, unknown][] = [
  ['ISO string — post-Brief-19 writes', INSTANT_ISO],
  ['client Timestamp — pre-Brief-19 cloud docs', { toDate: () => new Date(INSTANT_MS) }],
  ['number, epoch ms — the Cloud Function Date.now() era', INSTANT_MS],
  ['{seconds,nanoseconds} — sanitizer-degraded Timestamp', { seconds: INSTANT_MS / 1000, nanoseconds: 0 }],
  ['{_seconds,_nanoseconds} — Admin SDK serialization', { _seconds: INSTANT_MS / 1000, _nanoseconds: 0 }],
];

const NO_INSTANT: [string, unknown][] = [
  ['{_methodName:serverTimestamp} — the leaked sentinel', { _methodName: 'serverTimestamp' }],
  ['{} — empty map', {}],
  ['unparseable string', 'not-a-date'],
  ["'' — empty string", ''],
  ['null', null],
  ['field absent from the document', '__ABSENT__'],
];

describe('the Firestore read path normalizes before anything renders', () => {
  it.each(RECOVERABLE)('recoverable: %s -> ISO 8601 in the store', async (_label, shape) => {
    const product = await readThroughDriver(shape);
    expect(product.updatedAt).toBe(new Date(INSTANT_MS).toISOString());
  });

  it.each(NO_INSTANT)('no instant: %s -> undefined in the store', async (_label, shape) => {
    const product = await readThroughDriver(shape);
    expect(product.updatedAt).toBeUndefined();
  });

  it('never leaves a non-string, non-undefined value in the store', async () => {
    const seen: unknown[] = [];
    for (const [, shape] of [...RECOVERABLE, ...NO_INSTANT]) {
      seen.push((await readThroughDriver(shape)).updatedAt);
    }
    expect(seen).toHaveLength(11); // harness control: it looked 11 times
    for (const v of seen) {
      expect(v === undefined || typeof v === 'string').toBe(true);
    }
  });
});
