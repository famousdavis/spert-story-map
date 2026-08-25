// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * Brief 22 PC-1 / PC-2 / PC-6 — what `ProjectCard` PRINTS for every `updatedAt`
 * shape, end to end from the Firestore project-doc read.
 *
 * WHY THE ASSERTION IS A STRING AND NOT "IT DID NOT THROW". This app never threw.
 * `ProjectCard` rendered `(parseDate(p.updatedAt) || new Date()).toLocaleDateString()`,
 * which survives every shape in the table below — so a "no throw" suite passed
 * 12/12 while the card printed "Invalid Date" five times and fabricated TODAY
 * three times. A subset predicate cannot see a wrong value. Assert the value.
 *
 * WHY IT GOES THROUGH `loadProduct` AND NOT STRAIGHT INTO THE COMPONENT: the
 * rows below travel the same route a real cloud document does.
 *
 * ⚠️ BUT THE RENDER ASSERTIONS ALONE DO NOT PIN THE DRIVER HALF, AND AN EARLIER
 * DRAFT OF THIS COMMENT CLAIMED THEY DID. Measured: deleting all three
 * `normalizeUpdatedAt` calls from `firestoreDriver.ts` left this file at 16/16,
 * because `formatUpdatedAt` normalizes again at the component and the two halves
 * are individually sufficient for the RENDER. The converter half earns its place
 * elsewhere — `ProductLayout`'s "Saved ..." line feeds the same value to
 * `formatRelativeTime` — so it needs an assertion of its own rather than a
 * comment asserting one exists. That is the `describe` block at the bottom.
 *
 * ⚠️ THE CLOCK IS FROZEN, AND THAT IS LOAD-BEARING FOR PC-2. A fabricated
 * current date is indistinguishable from a correct one on the day the fixture
 * is authored: write `updatedAt: undefined` on 2026-08-24, expect "8/24/2026",
 * and the test passes whether the code is right or wrong. Freezing to a date no
 * fixture uses is what makes "did not render today" a real assertion.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// A date no fixture instant falls on, so "rendered today" is always distinguishable.
const FROZEN_NOW = new Date('2026-08-24T12:00:00.000Z');
// Mid-day UTC so the local calendar date is the same in every real timezone.
const INSTANT_ISO = '2026-03-14T10:20:30.000Z';
const INSTANT_MS = Date.parse(INSTANT_ISO);
// Computed from the KNOWN instant, not from the code under test, and locale-safe.
const INSTANT_RENDERED = new Date(INSTANT_MS).toLocaleDateString();
const TODAY_RENDERED = FROZEN_NOW.toLocaleDateString();
const DASH = '—';

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
const { importProductFromJSON } = await import('../lib/importExport');
const ProjectCard = (await import('../components/product/ProjectCard')).default;

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

const NOOP = () => {};
function renderCard(updatedAt?: string) {
  render(
    <ProjectCard
      product={{
        name: 'Shape Under Test', totalItems: 0, totalPoints: 0,
        unsized: 0, pctComplete: 0, updatedAt,
      }}
      isShared={false} isOwner isCloudMode={false}
      isDragging={false} isDropTarget={false}
      onNavigate={NOOP} onRename={NOOP} onShare={NOOP} onExport={NOOP}
      onDuplicate={NOOP} onDelete={NOOP}
      onDragStart={NOOP} onDragOver={NOOP} onDrop={NOOP} onDragEnd={NOOP}
    />,
  );
  // Anchored on the "Updated " prefix so a matching digit elsewhere in the card
  // (points, percent complete) cannot satisfy this.
  return screen.getByText(/^Updated /).textContent!.replace(/^Updated /, '');
}

async function renderFromDoc(updatedAt: unknown) {
  const product = await readThroughDriver(updatedAt);
  return renderCard(product.updatedAt);
}

beforeAll(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(FROZEN_NOW); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => { mockGetDoc.mockReset(); for (const k of Object.keys(store)) delete store[k]; });
afterEach(cleanup);

/**
 * The re-derived shape universe (Brief 22 §1.2), each row measured against the
 * OLD render before this change. `origin` is why the shape can be in a document.
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

describe('PC-1 — every shape renders a specific expected string', () => {
  it.each(RECOVERABLE)('recoverable: %s -> the encoded date', async (_label, shape) => {
    expect(await renderFromDoc(shape)).toBe(INSTANT_RENDERED);
  });

  it.each(NO_INSTANT)('no instant: %s -> em dash', async (_label, shape) => {
    expect(await renderFromDoc(shape)).toBe(DASH);
  });

  it('renders "Invalid Date" for nothing — the old failure mode, five of eleven rows', async () => {
    // Sequential, with a cleanup between each: rendering all eleven into one
    // DOM makes every query ambiguous, which fails as "found multiple" rather
    // than as the assertion this row exists to make.
    const rendered: string[] = [];
    for (const [, shape] of [...RECOVERABLE, ...NO_INSTANT]) {
      rendered.push(await renderFromDoc(shape));
      cleanup();
    }
    expect(rendered).toHaveLength(11); // harness control: every row was actually rendered
    // ⚠️ BOTH failure modes, because they are not interchangeable and checking
    // only the first is how this row passed a falsification it should have
    // failed: with the render reverted but the converter intact, the no-instant
    // shapes stopped printing "Invalid Date" and started printing TODAY instead.
    expect(rendered.filter((r) => r === 'Invalid Date')).toEqual([]);
    expect(rendered.filter((r) => r === TODAY_RENDERED)).toEqual([]);
  });
});

describe('PC-2 — undefined must not fabricate today', () => {
  it('a document with no updatedAt renders the em dash, not the current date', async () => {
    const rendered = await renderFromDoc('__ABSENT__');
    expect(rendered).toBe(DASH);
    // Stated separately and explicitly: this is the defect, and it is the one
    // row that can be broken while every other row passes.
    expect(rendered).not.toBe(TODAY_RENDERED);
  });

  it('the clock really is frozen — otherwise the assertion above is vacuous', () => {
    // Guards the guard: if the freeze silently stopped working, `TODAY_RENDERED`
    // would drift off the frozen date and `not.toBe(TODAY_RENDERED)` would pass
    // for a card that IS printing today.
    expect(new Date().toLocaleDateString()).toBe(TODAY_RENDERED);
    expect(TODAY_RENDERED).not.toBe(INSTANT_RENDERED);
  });
});

describe('PC-6 — the reachable production path: JSON import', () => {
  /** A valid export with no `updatedAt` — what `importProductFromJSON` accepts. */
  const IMPORTABLE = JSON.stringify({
    id: 'imported-1', name: 'Imported Project', description: '',
    createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 2, themes: [],
  });

  it('imports cleanly without updatedAt — validateProduct never required it', () => {
    const p = importProductFromJSON(IMPORTABLE);
    expect(p.name).toBe('Imported Project');   // harness control: the import ran
    expect(p.updatedAt).toBeUndefined();       // the field really is absent
  });

  it('and the card renders the em dash rather than today', () => {
    const p = importProductFromJSON(IMPORTABLE);
    const rendered = renderCard(p.updatedAt);
    expect(rendered).toBe(DASH);
    expect(rendered).not.toBe(TODAY_RENDERED);
  });
});
/**
 * Pins the CONVERTER half independently of the render. Without this block,
 * deleting every `normalizeUpdatedAt` call from `firestoreDriver.ts` passes —
 * measured, not assumed.
 *
 * It matters beyond `ProjectCard`: `useProduct` derives `lastSaved` from the same
 * field and `ProductLayout` renders it through `formatRelativeTime`, which has no
 * normalization of its own. A degraded value reaching the store surfaces there.
 */
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
