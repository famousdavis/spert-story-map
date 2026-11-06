// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * A value `guardCloudProduct` sets aside that no save repaired. At v0.53.25 these
 * raised `CloudLoadNotice` on every open, and again after every dismiss, and the
 * value stayed in the document for good.
 *
 * ⚠️ PLANTED IN THE STORED DOCUMENT, NEVER THROUGH IMPORT. Since v0.53.25 import cleans
 * these values, so a fixture built that way reads as clean whatever the driver does.
 *
 * ⚠️ THE STORE BELOW IS THE INSTRUMENT, and it behaves as the emulator did, against the
 * real ruleset and the real SDK: `mergeFields` writes only what it names, naming a
 * key the data lacks throws, `deleteField()` removes the key, and `arrayUnion`
 * overwrites a non-list and appends to a list. What a stub cannot show, that an
 * editor who is not the owner may send these deletes and a viewer may not, was
 * measured there: four keys, three roles.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChangeLogEntry, Product } from '../types';

const DELETE = { _deleteField: true };

let stored: Record<string, unknown> = {};
let setDocCalls: { data: Record<string, unknown>; mergeFields: string[] }[] = [];
let failNextSave = false;
let snapshotHandler: ((snap: unknown) => void) | null = null;

const applyMerge = (data: Record<string, unknown>, mergeFields: string[]) => {
  for (const k of mergeFields) {
    if (!(k in data)) throw new Error(`Field '${k}' is specified in your field mask but missing from your input data.`);
    if (data[k] === DELETE) delete stored[k];
    else stored[k] = data[k];
  }
};

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  collection: (_db: unknown, col: string) => ({ col }),
  query: (...args: unknown[]) => ({ args }),
  where: (...args: unknown[]) => ({ args }),
  getDoc: async () => docSnap(),
  getDocs: async () => ({ forEach: (fn: (s: unknown) => void) => fn(docSnap()) }),
  setDoc: async (_ref: unknown, data: Record<string, unknown>, opts: { mergeFields: string[] }) => {
    if (failNextSave) { failNextSave = false; throw new Error('offline'); }
    setDocCalls.push({ data, mergeFields: opts.mergeFields });
    applyMerge(data, opts.mergeFields);
  },
  updateDoc: async (_ref: unknown, data: { _changeLog: { _arrayUnion: unknown[] } }) => {
    const current = stored._changeLog;
    stored._changeLog = [...(Array.isArray(current) ? current : []), ...data._changeLog._arrayUnion];
  },
  deleteDoc: async () => {},
  deleteField: () => DELETE,
  onSnapshot: (_ref: unknown, next: (snap: unknown) => void) => { snapshotHandler = next; return () => {}; },
  arrayUnion: (...args: unknown[]) => ({ _arrayUnion: args }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
    await fn({ get: async () => docSnap(), set: (_ref: unknown, data: Record<string, unknown>) => { stored = structuredClone(data); } });
  },
}));

vi.mock('../lib/firebase', () => ({ db: {} }));

const { createFirestoreDriver } = await import('../lib/firestoreDriver');
const { isGuardedLoad, dismissGuardedLoad } = await import('../lib/cloudLoadNotices');

const ID = 'p';
const ENTRY = { t: 1000, op: 'create', entity: 'product' };
const GOOD_ORDER = { r1: ['k'] };

const docSnap = () => ({ id: ID, data: () => structuredClone(stored), exists: () => true, metadata: { hasPendingWrites: false } });

/** A clean document, with none of the optional keys unless a test adds one. */
const goodDoc = (overrides: Record<string, unknown> = {}) => ({
  name: 'P', description: 'd', createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 2, _originRef: 'o',
  sizeMapping: [{ label: 'M', points: 5 }], releases: [{ id: 'r1', name: 'R1', order: 1 }], sprints: [], themes: [],
  _changeLog: [ENTRY], owner: 'them', members: { them: 'owner', me: 'editor' },
  ...overrides,
});

const driverFor = () => createFirestoreDriver('me');
type Driver = ReturnType<typeof driverFor>;

/** Open the project with the notice cleared, as a fresh page load finds it. */
async function open(driver: Driver): Promise<Product> {
  dismissGuardedLoad(ID);
  return (await driver.loadProduct(ID))!;
}

const rename = (driver: Driver, product: Product, name: string) => driver.saveProductImmediate({ ...product, name });
const deletesIn = (call: { data: Record<string, unknown> }) => Object.keys(call.data).filter(k => call.data[k] === DELETE);

beforeEach(() => {
  stored = {};
  setDocCalls = [];
  failNextSave = false;
  snapshotHandler = null;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  dismissGuardedLoad(ID);
  vi.restoreAllMocks();
});

describe('a key the guard removes, which a save owns', () => {
  it.each<[string, string, unknown]>([
    ['sprintCadenceWeeks as a string', 'sprintCadenceWeeks', 'x'],
    ['releaseCardOrder as a number', 'releaseCardOrder', 5],
    ['releaseCardOrder as a list', 'releaseCardOrder', []],
    ['releaseCardOrder as a string', 'releaseCardOrder', 'x'],
    ['releaseCardOrder as null', 'releaseCardOrder', null],
    ['sizingCardOrder as a string', 'sizingCardOrder', 'x'],
    ['sizingCardOrder as a number', 'sizingCardOrder', 5],
    ['cardColorLabels as a number', 'cardColorLabels', 5],
  ])('%s: the notice shows, the next save removes the value, and the notice stops', async (_label, key, value) => {
    stored = goodDoc({ [key]: value });
    const driver = driverFor();

    const first = await open(driver);
    expect(isGuardedLoad(ID)).toBe(true);
    await rename(driver, first, 'P1');

    expect(key in stored).toBe(false);
    expect(stored.name).toBe('P1');
    await open(driver);
    expect(isGuardedLoad(ID)).toBe(false);
  });

  it('removes it only once', async () => {
    stored = goodDoc({ releaseCardOrder: 5 });
    const driver = driverFor();
    const product = await open(driver);

    await rename(driver, product, 'P1');
    await rename(driver, product, 'P2');

    expect(setDocCalls.map(deletesIn)).toEqual([['releaseCardOrder'], []]);
  });

  it('tries again after a save that failed', async () => {
    stored = goodDoc({ releaseCardOrder: 5 });
    const driver = driverFor();
    const errors: unknown[] = [];
    driver.onSaveError(e => errors.push(e));
    const product = await open(driver);

    failNextSave = true;
    await rename(driver, product, 'P1');
    expect(errors).toHaveLength(1);
    expect(stored.releaseCardOrder).toBe(5);

    await rename(driver, product, 'P2');
    expect('releaseCardOrder' in stored).toBe(false);
  });

  it('saves the key instead when the user has rewritten it since the read', async () => {
    stored = goodDoc({ releaseCardOrder: 5 });
    const driver = driverFor();
    const product = await open(driver);

    await driver.saveProductImmediate({ ...product, releaseCardOrder: GOOD_ORDER });

    expect(stored.releaseCardOrder).toEqual(GOOD_ORDER);
  });

  it('is repaired from a project read off the list, too', async () => {
    stored = goodDoc({ releaseCardOrder: 5 });
    const driver = driverFor();
    const [product] = await driver.loadProductIndex();

    await rename(driver, product!, 'P1');

    expect('releaseCardOrder' in stored).toBe(false);
  });

  it('removes nothing once a later read finds the key good: another editor stored it', async () => {
    stored = goodDoc({ releaseCardOrder: 5 });
    const driver = driverFor();
    driver.onProductChange(ID, () => {});
    const product = await open(driver);

    stored.releaseCardOrder = GOOD_ORDER;
    snapshotHandler!(docSnap());
    await rename(driver, product, 'P1');

    expect(stored.releaseCardOrder).toEqual(GOOD_ORDER);
  });

  it('removes nothing once an import has replaced the document', async () => {
    stored = goodDoc({ releaseCardOrder: 5 });
    const driver = driverFor();
    const product = await open(driver);

    await driver.replaceProduct({ ...product, releaseCardOrder: GOOD_ORDER });
    await rename(driver, product, 'P1');

    expect(setDocCalls.flatMap(deletesIn)).toEqual([]);
  });

  it('stays dismissed once the save has repaired it, when the next snapshot arrives', async () => {
    stored = goodDoc({ releaseCardOrder: 5 });
    const driver = driverFor();
    driver.onProductChange(ID, () => {});
    const product = await open(driver);
    await rename(driver, product, 'P1');

    dismissGuardedLoad(ID);
    snapshotHandler!(docSnap());

    expect(isGuardedLoad(ID)).toBe(false);
  });
});

describe('a key that is only missing', () => {
  it('is never removed: an older project lacks these, and another editor may have stored one since', async () => {
    stored = goodDoc();
    const driver = driverFor();
    const product = await open(driver);

    stored.releaseCardOrder = GOOD_ORDER;
    stored.sprintCadenceWeeks = 3;
    await rename(driver, product, 'P1');

    expect(stored.releaseCardOrder).toEqual(GOOD_ORDER);
    expect(stored.sprintCadenceWeeks).toBe(3);
    expect(setDocCalls.flatMap(deletesIn)).toEqual([]);
  });
});

describe('a field no save touches', () => {
  it.each<[string, string, unknown, string]>([
    ['createdAt as an object', 'createdAt', { bad: 1 }, 'product.createdAt'],
    ['_changeLog holding a bare string', '_changeLog', ['x', ENTRY], '_changeLog'],
    ['_changeLog that is not a list', '_changeLog', 7, '_changeLog'],
  ])('%s: no notice on any open, the value stays, and the console still names it', async (_label, key, value, rule) => {
    stored = goodDoc({ [key]: value });
    const driver = driverFor();

    for (const name of ['P1', 'P2', 'P3']) {
      const product = await open(driver);
      expect(isGuardedLoad(ID)).toBe(false);
      await rename(driver, product, name);
      expect(stored[key]).toEqual(value);
    }

    expect(setDocCalls.flatMap(c => c.mergeFields)).not.toContain(key);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(rule));
  });

  it('stays dismissed in a session: a later snapshot does not bring the notice back', async () => {
    stored = goodDoc({ createdAt: { bad: 1 }, _changeLog: ['x', ENTRY] });
    const driver = driverFor();
    driver.onProductChange(ID, () => {});
    await open(driver);

    snapshotHandler!(docSnap());

    expect(isGuardedLoad(ID)).toBe(false);
  });

  it('a new log entry only ever appends: the real entries and the bare one are all still there', async () => {
    stored = goodDoc({ _changeLog: ['x', ENTRY] });
    const driver = driverFor();
    const product = await open(driver);
    const added: ChangeLogEntry = { t: 2000, op: 'add', entity: 'rib', seq: 'q' };

    await driver.saveProductImmediate({ ...product, _changeLog: [...product._changeLog!, added] });

    expect(stored._changeLog).toEqual(['x', ENTRY, added]);
  });
});

describe('both kinds together', () => {
  it('raises the notice, removes the key, and leaves the date', async () => {
    stored = goodDoc({ createdAt: { bad: 1 }, releaseCardOrder: 5 });
    const driver = driverFor();

    const product = await open(driver);
    expect(isGuardedLoad(ID)).toBe(true);
    await rename(driver, product, 'P1');

    expect('releaseCardOrder' in stored).toBe(false);
    expect(stored.createdAt).toEqual({ bad: 1 });
  });
});

describe('a value the guard resets', () => {
  it('needs no removal: its key is in the save, as it always was', async () => {
    stored = goodDoc({ description: {} });
    const driver = driverFor();

    const product = await open(driver);
    expect(isGuardedLoad(ID)).toBe(true);
    await rename(driver, product, 'P1');

    expect(stored.description).toBe('');
    expect(setDocCalls.flatMap(deletesIn)).toEqual([]);
    await open(driver);
    expect(isGuardedLoad(ID)).toBe(false);
  });
});
