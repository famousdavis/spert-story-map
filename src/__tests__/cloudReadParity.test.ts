// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * Where the cloud read and the local read used to give different answers: a size list
 * that cannot be read, and the notice after an import replaces a project.
 *
 * ⚠️ PLANTED IN THE STORED DOCUMENT, NEVER THROUGH IMPORT, which cleans these values, so
 * a fixture built that way reads as clean whatever the driver does.
 *
 * ⚠️ THE STORE BELOW IS THE INSTRUMENT, and it behaves as the emulator did against the
 * real ruleset and SDK: `mergeFields` writes only what it names, and a transaction's
 * callback has finished before the commit, which is where a refused write fails. What a
 * stub cannot show was measured there: an owner and an editor may store the default
 * rows, and a viewer is refused and writes nothing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Product } from '../types';

let stored: Record<string, unknown> = {};
let setDocCalls: { data: Record<string, unknown>; mergeFields: string[] }[] = [];
let failNextSave = false;
let failNextCommit = false;
let snapshotHandler: ((snap: unknown) => void) | null = null;

const denied = () => Object.assign(new Error('denied'), { code: 'permission-denied' });

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  collection: (_db: unknown, col: string) => ({ col }),
  query: (...args: unknown[]) => ({ args }),
  where: (...args: unknown[]) => ({ args }),
  getDoc: async () => docSnap(),
  getDocs: async () => ({ forEach: (fn: (s: unknown) => void) => fn(docSnap()) }),
  setDoc: async (_ref: unknown, data: Record<string, unknown>, opts: { mergeFields: string[] }) => {
    if (failNextSave) { failNextSave = false; throw denied(); }
    setDocCalls.push({ data, mergeFields: opts.mergeFields });
    for (const k of opts.mergeFields) stored[k] = data[k];
  },
  updateDoc: async () => {},
  deleteDoc: async () => {},
  deleteField: () => ({ _deleteField: true }),
  onSnapshot: (_ref: unknown, next: (snap: unknown) => void) => { snapshotHandler = next; return () => {}; },
  arrayUnion: (...args: unknown[]) => ({ _arrayUnion: args }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
    let written: Record<string, unknown> = {};
    await fn({ get: async () => docSnap(), set: (_ref: unknown, data: Record<string, unknown>) => { written = data; } });
    if (failNextCommit) { failNextCommit = false; throw denied(); }
    stored = structuredClone(written);
  },
}));

vi.mock('../lib/firebase', () => ({ db: {} }));

const { createFirestoreDriver } = await import('../lib/firestoreDriver');
const { createLocalStorageDriver } = await import('../lib/storageDriver');
const { importProductFromJSON } = await import('../lib/importExport');
const { getTotalProjectPoints } = await import('../lib/calculations');
const { isGuardedLoad, dismissGuardedLoad } = await import('../lib/cloudLoadNotices');
const { DEFAULT_SIZE_MAPPING } = await import('../lib/constants');

const ID = 'p';
const OWN_SIZES = [{ label: 'M', points: 5 }];
/** What the rib below is worth on the default rows, and not on `OWN_SIZES`. */
const DEFAULT_POINTS = 20;

const docSnap = () => ({ id: ID, data: () => structuredClone(stored), exists: () => true, metadata: { hasPendingWrites: false } });

/** A clean document with one sized rib, so a lost size list shows in the points. */
const goodDoc = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'P', description: '', createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 2, _originRef: 'o',
  sizeMapping: OWN_SIZES, releases: [{ id: 'r1', name: 'R1', order: 1 }], sprints: [],
  themes: [{ id: 't1', name: 'T', order: 1, backboneItems: [{ id: 'b1', name: 'B', order: 1, ribItems: [{
    id: 'k1', name: 'Rib', description: '', order: 1, size: 'M', category: 'core', notes: '',
    releaseAllocations: [{ releaseId: 'r1', percentage: 100 }], progressHistory: [],
  }] }] }],
  _changeLog: [], owner: 'me', members: { me: 'owner' },
  ...overrides,
});

/** The key really gone, which is not the same document as one holding `undefined`. */
const docWithout = (key: string, overrides: Record<string, unknown> = {}) => {
  const d = goodDoc(overrides);
  delete d[key];
  return d;
};

const NON_LISTS: [string, unknown][] = [
  ['a number', 5], ['a string', 'x'], ['true', true], ['an object', {}],
  ['its rows in an object', { 0: OWN_SIZES[0] }], ['null', null],
];
const UNREADABLE: [string, () => Record<string, unknown>][] = [
  ...NON_LISTS.map(([label, value]) => [label, () => goodDoc({ sizeMapping: value })] as [string, () => Record<string, unknown>]),
  ['missing', () => docWithout('sizeMapping')],
];

const driverFor = () => createFirestoreDriver('me');
type Driver = ReturnType<typeof driverFor>;

/** Open the project with the notice cleared, as a fresh page load finds it. */
async function open(driver: Driver): Promise<Product> {
  dismissGuardedLoad(ID);
  return (await driver.loadProduct(ID))!;
}

/** The list, the open and the listener: every seam the guard runs at. */
async function readAtEverySeam(driver: Driver): Promise<Product[]> {
  const [listed] = await driver.loadProductIndex();
  const opened = await driver.loadProduct(ID);
  let heard: Product | undefined;
  driver.onProductChange(ID, product => { heard = product; });
  snapshotHandler!(docSnap());
  return [listed!, opened!, heard!];
}

function storeLocally(document: Record<string, unknown>): void {
  const { owner: _owner, members: _members, ...plain } = document;
  localStorage.setItem(`rp:local:product_${ID}`, JSON.stringify({ id: ID, ...plain }));
}

const asFile = (document: Record<string, unknown>) => {
  const { owner: _owner, members: _members, ...plain } = document;
  return JSON.stringify({ id: ID, ...plain });
};

/** What both import routes hand `replaceProduct`: the real parse, onto this project's id. */
const importedOver = (fields: Record<string, unknown> = {}): Product =>
  ({ ...importProductFromJSON(asFile(goodDoc({ name: 'From file', ...fields }))), id: ID });

beforeEach(() => {
  stored = {};
  setDocCalls = [];
  failNextSave = false;
  failNextCommit = false;
  snapshotHandler = null;
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  dismissGuardedLoad(ID);
  vi.restoreAllMocks();
});

describe('a size list that is not a list', () => {
  it.each(NON_LISTS)('%s reads as the default rows at every seam, and the rib keeps its points', async (_label, value) => {
    stored = goodDoc({ sizeMapping: value });
    for (const product of await readAtEverySeam(driverFor())) {
      expect(product.sizeMapping).toEqual(DEFAULT_SIZE_MAPPING);
      expect(getTotalProjectPoints(product)).toBe(DEFAULT_POINTS);
    }
  });

  it.each(NON_LISTS)('%s raises the notice on opening, and not from the list', async (_label, value) => {
    stored = goodDoc({ sizeMapping: value });
    const driver = driverFor();
    await driver.loadProductIndex();
    expect(isGuardedLoad(ID)).toBe(false);
    await driver.loadProduct(ID);
    expect(isGuardedLoad(ID)).toBe(true);
  });

  it.each(NON_LISTS)('%s is stored as the default rows by the next save, and the notice stops', async (_label, value) => {
    stored = goodDoc({ sizeMapping: value });
    const driver = driverFor();

    const product = await open(driver);
    await driver.saveProductImmediate({ ...product, name: 'P1' });

    expect(stored.sizeMapping).toEqual(DEFAULT_SIZE_MAPPING);
    expect(stored.name).toBe('P1');
    await open(driver);
    expect(isGuardedLoad(ID)).toBe(false);
  });

  it('keeps its value and its notice when the save is refused, as it is for a viewer', async () => {
    stored = goodDoc({ sizeMapping: 5 });
    const driver = driverFor();

    const product = await open(driver);
    expect(product.sizeMapping).toEqual(DEFAULT_SIZE_MAPPING);
    failNextSave = true;
    await driver.saveProductImmediate({ ...product, name: 'P1' });

    expect(stored.sizeMapping).toBe(5);
    // Read here as well as after reopening: `open` raises it again whatever the save did.
    expect(isGuardedLoad(ID)).toBe(true);
    await open(driver);
    expect(isGuardedLoad(ID)).toBe(true);
  });
});

describe('a size list that is missing', () => {
  it('reads as the default rows at every seam, with no notice and nothing in the console', async () => {
    stored = docWithout('sizeMapping');
    for (const product of await readAtEverySeam(driverFor())) {
      expect(product.sizeMapping).toEqual(DEFAULT_SIZE_MAPPING);
      expect(getTotalProjectPoints(product)).toBe(DEFAULT_POINTS);
    }
    expect(isGuardedLoad(ID)).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('is stored as the default rows by the next save, still with no notice', async () => {
    stored = docWithout('sizeMapping');
    const driver = driverFor();

    const product = await open(driver);
    await driver.saveProductImmediate({ ...product, name: 'P1' });

    expect(stored.sizeMapping).toEqual(DEFAULT_SIZE_MAPPING);
    expect(isGuardedLoad(ID)).toBe(false);
  });
});

describe('a size list that is a list', () => {
  it('stays empty when it is empty, at every seam and through a save: removing every row is a user\'s own choice', async () => {
    stored = goodDoc({ sizeMapping: [] });
    const driver = driverFor();
    for (const product of await readAtEverySeam(driver)) expect(product.sizeMapping).toEqual([]);

    const product = await open(driver);
    await driver.saveProductImmediate({ ...product, name: 'P1' });

    expect(stored.sizeMapping).toEqual([]);
    expect(isGuardedLoad(ID)).toBe(false);
  });

  it('keeps its own rows', async () => {
    stored = goodDoc();
    for (const product of await readAtEverySeam(driverFor())) expect(product.sizeMapping).toEqual(OWN_SIZES);
  });

  it('is left as a list when every row is set aside: it was a list, so no default rows', async () => {
    stored = goodDoc({ sizeMapping: [5, 'x'] });
    const product = await open(driverFor());
    expect(product.sizeMapping).toEqual([]);
    expect(isGuardedLoad(ID)).toBe(true);
  });
});

describe('opening a project', () => {
  it.each(UNREADABLE)('writes nothing when the size list is %s', async (_label, document) => {
    stored = document();
    await readAtEverySeam(driverFor());
    expect(setDocCalls).toEqual([]);
    expect(stored).toEqual(document());
  });
});

describe('the cloud, a local read and an import give one answer', () => {
  it.each(UNREADABLE)('when the size list is %s', async (_label, document) => {
    stored = document();
    const cloud = await open(driverFor());
    storeLocally(document());
    const local = (await createLocalStorageDriver().loadProduct(ID))!;
    const imported = importProductFromJSON(asFile(document()));

    expect(cloud.sizeMapping).toEqual(imported.sizeMapping);
    expect(local.sizeMapping).toEqual(imported.sizeMapping);
    expect(getTotalProjectPoints(cloud)).toBe(getTotalProjectPoints(imported));
    expect(getTotalProjectPoints(local)).toBe(getTotalProjectPoints(imported));
  });

  it('when it is empty', async () => {
    stored = goodDoc({ sizeMapping: [] });
    const cloud = await open(driverFor());
    storeLocally(goodDoc({ sizeMapping: [] }));
    const local = (await createLocalStorageDriver().loadProduct(ID))!;
    const imported = importProductFromJSON(asFile(goodDoc({ sizeMapping: [] })));

    for (const product of [cloud, local, imported]) expect(product.sizeMapping).toEqual([]);
  });
});

describe('the notice after a replace', () => {
  const damaged = (overrides: Record<string, unknown> = {}) =>
    goodDoc({ sizeMapping: 5, sprintCadenceWeeks: 'x', ...overrides });

  it('goes once the transaction has committed', async () => {
    stored = damaged();
    const driver = driverFor();
    await open(driver);
    expect(isGuardedLoad(ID)).toBe(true);

    await driver.replaceProduct(importedOver());

    expect(isGuardedLoad(ID)).toBe(false);
    expect(stored.name).toBe('From file');
  });

  it('stays gone when the replace comes back on the listener, and on the next open', async () => {
    stored = damaged();
    const driver = driverFor();
    driver.onProductChange(ID, () => {});
    await driver.loadProduct(ID);

    await driver.replaceProduct(importedOver());
    snapshotHandler!(docSnap());
    expect(isGuardedLoad(ID)).toBe(false);

    await driver.loadProduct(ID);
    expect(isGuardedLoad(ID)).toBe(false);
  });

  it('stays when the commit fails, because nothing has been replaced', async () => {
    stored = damaged();
    const driver = driverFor();
    await open(driver);

    failNextCommit = true;
    await expect(driver.replaceProduct(importedOver())).rejects.toThrow('denied');

    expect(isGuardedLoad(ID)).toBe(true);
    expect(stored.name).toBe('P');
  });

  // A replace keeps these from the stored document. A rule that flagged one would bring
  // the notice back on the listener a moment after the replace cleared it, and no save
  // writes `_originRef`, so it would never clear. There is no such rule today.
  const LATER = '2020-02-02T00:00:00.000Z';
  it.each<[string, () => Record<string, unknown>, Record<string, unknown>]>([
    ['a stored date', () => damaged(), {}],
    ['a bad stored date, with one in the file', () => damaged({ createdAt: 5 }), { createdAt: LATER }],
    ['a bad stored date, with none in the file', () => damaged({ createdAt: 5 }), { createdAt: undefined }],
    ['a number stored as _originRef', () => damaged({ _originRef: 5 }), {}],
    ['an object stored as _originRef', () => damaged({ _originRef: { x: 1 } }), {}],
    ['a number as _originRef in the file, with none stored', () => docWithout('_originRef', damaged()), { _originRef: 5 }],
    ['the aliases an old Duplicate stored', () => damaged({ _owner: 'me', _members: { me: 'owner' } }), {}],
  ])('stays gone with %s', async (_label, document, fields) => {
    stored = document();
    const driver = driverFor();
    driver.onProductChange(ID, () => {});
    await driver.loadProduct(ID);
    expect(isGuardedLoad(ID)).toBe(true);

    await driver.replaceProduct(importedOver(fields));
    snapshotHandler!(docSnap());
    expect(isGuardedLoad(ID)).toBe(false);

    await driver.loadProduct(ID);
    expect(isGuardedLoad(ID)).toBe(false);
  });
});
