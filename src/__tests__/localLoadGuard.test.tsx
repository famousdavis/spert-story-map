// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * The shape guard on the local read path (`loadProduct` in `storage.ts`).
 *
 * Every fixture is written straight into localStorage, never through a writer: the
 * values under test are ones no writer stores today, reached by an older import.
 *
 * `cloudLoadGuard.test.ts` pins the guard's rules one by one, and this file does not
 * repeat them. It pins what the local seam adds: the read is guarded, it never writes
 * back, and the views the app opens can read the result.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { loadProduct, saveProductImmediate, duplicateProduct } from '../lib/storage';
import { importProductFromJSON } from '../lib/importExport';
import { getProjectTotals, getProgressOverTime, getTotalProjectPoints } from '../lib/calculations';
import { getReconciliationRows, getStrandedRows } from '../lib/reconciliation';
import { buildForecasterExport } from '../lib/exportForForecaster';
import { isRibLocked } from '../lib/ribHelpers';
import { computeLayout } from '../components/storymap/useMapLayout';
import { dismissGuardedLoad, isGuardedLoad } from '../lib/cloudLoadNotices';
import { DEFAULT_SIZE_MAPPING } from '../lib/constants';
import { createSampleProduct } from '../lib/sampleData';
import ProductList from '../pages/ProductList';
import type { Product, RibItem } from '../types';

type Doc = Record<string, unknown>;

const ID = 'p1';
const NAME = 'Stored project';
const KEY = `rp:local:product_${ID}`;

const ALLOCATION = { releaseId: 'r1', percentage: 100 };
const ENTRY = { sprintId: 's1', releaseId: 'r1', percentComplete: 50 };

/** A clean v2 project: one sized rib with a real lock, so a lost list would show. */
function stored(overrides: Doc = {}): Doc {
  return {
    id: ID, name: NAME, schemaVersion: 2, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    sizeMapping: [{ label: 'M', points: 20 }],
    releases: [{ id: 'r1', name: 'R1', order: 1 }],
    sprints: [{ id: 's1', name: 'S1', order: 1, endDate: '2026-01-14' }],
    themes: [{ id: 't1', name: 'T1', order: 1, backboneItems: [{ id: 'b1', name: 'B1', order: 1, ribItems: [{
      id: 'k1', name: 'Rib', order: 1, size: 'M', category: 'core',
      releaseAllocations: [ALLOCATION], progressHistory: [ENTRY],
    }] }] }],
    ...overrides,
  };
}

function seed(id: string, value: unknown): void {
  localStorage.setItem(`rp:local:product_${id}`, JSON.stringify(value));
  const raw = localStorage.getItem('rp:local:products_index');
  const index = raw ? JSON.parse(raw) as { id: string }[] : [];
  localStorage.setItem('rp:local:products_index', JSON.stringify([...index, { id, name: id }]));
}

const ribOf = (product: Product): RibItem => product.themes[0]!.backboneItems[0]!.ribItems[0]!;
const storedNow = (): Doc => JSON.parse(localStorage.getItem(KEY)!) as Doc;

const ROW = { id: 'x', name: 'x', label: 'x', points: 1 };
const SHAPES: [string, unknown][] = [['{}', {}], ['{0: row}', { 0: ROW }], ["'x'", 'x'], ['5', 5], ['true', true]];
const LISTS = ['releases', 'sprints', 'sizeMapping', 'themes'] as const;
const BAD = LISTS.flatMap(field => SHAPES.map(([label, value]) => [field, label, value] as const));

const driver = createLocalStorageDriver();

beforeEach(() => {
  localStorage.clear();
  storage.value = { driver, mode: 'local', storageReady: true };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // jsdom has no matchMedia, and `useDarkMode` reads it.
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  cleanup();
  dismissGuardedLoad(ID);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a stored list of the wrong shape', () => {
  it.each(BAD)('%s as %s reads back as a list, and the other lists stay', async (field, _label, value) => {
    seed(ID, stored({ [field]: value }));
    const [product] = await driver.loadProductIndex();
    const clean = stored();
    expect(product?.[field]).toEqual(field === 'sizeMapping' ? DEFAULT_SIZE_MAPPING : []);
    for (const other of LISTS.filter(f => f !== field)) expect(product?.[other]).toEqual(clean[other]);
  });

  it.each(BAD)('%s as %s can be read by what the views call', async (field, _label, value) => {
    seed(ID, stored({ [field]: value }));
    const product = (await driver.loadProduct(ID))!;
    expect(() => getProjectTotals(product)).not.toThrow();
    expect(() => getProgressOverTime(product)).not.toThrow();
    expect(() => computeLayout(product, [])).not.toThrow();
    expect(() => getReconciliationRows(product)).not.toThrow();
    expect(() => getStrandedRows(product)).not.toThrow();
    expect(() => buildForecasterExport(product)).not.toThrow();
    expect(() => duplicateProduct(product)).not.toThrow();
  });

  // The real page, because `enrichProduct` is private to it and is what threw.
  it.each(BAD)('%s as %s stays on the project list', async (field, _label, value) => {
    seed(ID, stored({ [field]: value }));
    render(<MemoryRouter><ProductList /></MemoryRouter>);
    expect(await screen.findByText(NAME)).toBeTruthy();
    expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).not.toContain('left off the list');
  });

  it('a rib keeps its allocations and records when its release or sprint list goes', () => {
    seed(ID, stored({ releases: {}, sprints: {} }));
    const rib = ribOf(loadProduct(ID)!);
    expect(rib.releaseAllocations).toEqual([ALLOCATION]);
    expect(rib.progressHistory).toEqual([ENTRY]);
  });
});

describe('a local read gives what re-importing the project gives', () => {
  // `themes` is left out: the validator rejects a file with a bad one.
  it.each(BAD.filter(([field]) => field !== 'themes'))('%s as %s', (field, _label, value) => {
    const file = stored({ [field]: value });
    seed(ID, file);
    const product = loadProduct(ID)!;
    const imported = importProductFromJSON(JSON.stringify(file));
    for (const list of ['releases', 'sprints', 'sizeMapping'] as const) expect(product[list]).toEqual(imported[list]);
    expect(ribOf(product).size).toBe(ribOf(imported).size);
    expect(ribOf(product).releaseAllocations).toEqual(ribOf(imported).releaseAllocations);
    expect(ribOf(product).progressHistory).toEqual(ribOf(imported).progressHistory);
    expect(getTotalProjectPoints(product)).toBe(getTotalProjectPoints(imported));
  });
});

describe('sizeMapping', () => {
  const OWN = [{ label: 'M', points: 20 }];

  it.each(SHAPES)('%s has the default rows, so the rib keeps its size and its points', (_label, value) => {
    seed(ID, stored({ sizeMapping: value }));
    const product = loadProduct(ID)!;
    expect(product.sizeMapping).toEqual(DEFAULT_SIZE_MAPPING);
    expect(ribOf(product).size).toBe('M');
    expect(getTotalProjectPoints(product)).toBe(20);
  });

  it('survives an export and an import', () => {
    seed(ID, stored({ sizeMapping: 5 }));
    const again = importProductFromJSON(JSON.stringify(loadProduct(ID)));
    expect(ribOf(again).size).toBe('M');
    expect(getTotalProjectPoints(again)).toBe(20);
  });

  it('leaves a real list alone, an empty one included: removing every row is a user\'s own choice', () => {
    seed(ID, stored({ sizeMapping: OWN }));
    expect(loadProduct(ID)!.sizeMapping).toEqual(OWN);
    localStorage.clear();
    seed(ID, stored({ sizeMapping: [] }));
    expect(loadProduct(ID)!.sizeMapping).toEqual([]);
  });
});

describe('the stored value', () => {
  it('is not written by a list read or by opening the project', async () => {
    seed(ID, stored({ sprints: {}, sizeMapping: 5 }));
    const before = localStorage.getItem(KEY);
    await driver.loadProductIndex();
    await driver.loadProduct(ID);
    driver.flushPendingSaves();
    expect(localStorage.getItem(KEY)).toBe(before);
  });

  it('is repaired by the next save', async () => {
    seed(ID, stored({ sprints: {}, sizeMapping: 5 }));
    saveProductImmediate((await driver.loadProduct(ID))!);
    expect(storedNow().sprints).toEqual([]);
    expect(storedNow().sizeMapping).toEqual(DEFAULT_SIZE_MAPPING);
  });

  it('keeps the bad value through the migration save, which must not persist what the guard sets aside', () => {
    seed(ID, stored({ schemaVersion: undefined, sprints: {} }));
    expect(loadProduct(ID)!.sprints).toEqual([]);
    expect(storedNow().schemaVersion).toBe(2);
    expect(storedNow().sprints).toEqual({});
  });
});

describe('the notice', () => {
  it('is raised by opening the project, and not by listing it', async () => {
    seed(ID, stored({ sprints: {} }));
    await driver.loadProductIndex();
    expect(isGuardedLoad(ID)).toBe(false);
    await driver.loadProduct(ID);
    expect(isGuardedLoad(ID)).toBe(true);
  });

  // The cloud raises nothing for these two, because no cloud save touches them. A local
  // save writes the whole product, so here the notice is true and it clears.
  it.each<[string, Doc, keyof Doc]>([
    ['createdAt', { createdAt: { bad: 1 } }, 'createdAt'],
    ['_changeLog', { _changeLog: ['x', { t: 1, op: 'create' }] }, '_changeLog'],
  ])('is raised for a bad %s, and the next save clears it', async (_label, overrides, key) => {
    seed(ID, stored(overrides));
    saveProductImmediate((await driver.loadProduct(ID))!);
    expect(isGuardedLoad(ID)).toBe(true);
    expect(storedNow()[key]).not.toEqual(overrides[key]);

    dismissGuardedLoad(ID);
    await driver.loadProduct(ID);
    expect(isGuardedLoad(ID)).toBe(false);
  });

  it('is not raised by a clean project', async () => {
    seed(ID, stored());
    await driver.loadProduct(ID);
    expect(isGuardedLoad(ID)).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('is not raised by the sample project, written and read the way the app does', async () => {
    const sample = createSampleProduct();
    saveProductImmediate(sample);
    const read = await driver.loadProduct(sample.id);
    expect(console.warn).not.toHaveBeenCalled();
    expect(read).toEqual(JSON.parse(localStorage.getItem(`rp:local:product_${sample.id}`)!));
  });

  it('goes when an import replaces the project it was about', async () => {
    seed(ID, stored({ sprints: {} }));
    await driver.loadProduct(ID);
    await driver.replaceProduct(stored() as unknown as Product);
    await driver.loadProduct(ID);
    expect(isGuardedLoad(ID)).toBe(false);
  });

  it('is not raised by an old Settings input: cleared, it stored NaN, which JSON writes as null', async () => {
    saveProductImmediate(stored({ sprintCadenceWeeks: NaN }) as unknown as Product);
    expect(storedNow().sprintCadenceWeeks).toBeNull();
    const product = (await driver.loadProduct(ID))!;
    expect(isGuardedLoad(ID)).toBe(false);
    expect('sprintCadenceWeeks' in product).toBe(false);
    // The validator refuses a null cadence, so the key must not reach an export.
    expect(() => importProductFromJSON(JSON.stringify(product))).not.toThrow();
  });
});

describe('a stored value that is not a project', () => {
  const JUNK: [string, unknown][] = [['5', 5], ["'x'", 'x'], ['true', true], ['[]', []], ['[1]', [1]], ['0', 0], ['false', false], ["''", '']];

  it.each(JUNK)('%s reads as no project, as unparseable JSON does', (_label, value) => {
    seed(ID, value);
    expect(loadProduct(ID)).toBeNull();
  });

  it.each(JUNK)('%s does not cost the rest of the list', async (_label, value) => {
    seed(ID, value);
    seed('p2', stored({ id: 'p2' }));
    expect((await driver.loadProductIndex()).map(p => p.id)).toEqual(['p2']);
  });

  it.each(JUNK)('%s still reaches the page with its neighbour on the list', async (_label, value) => {
    seed(ID, value);
    seed('p2', stored({ id: 'p2', name: 'Neighbour' }));
    render(<MemoryRouter><ProductList /></MemoryRouter>);
    expect(await screen.findByText('Neighbour')).toBeTruthy();
  });

  it('an object with no id takes the key\'s, so its card opens and it can be deleted', async () => {
    seed(ID, {});
    const [product] = await driver.loadProductIndex();
    expect(product?.id).toBe(ID);
    expect(product?.themes).toEqual([]);
  });

  it('an id of the wrong type does the same', () => {
    seed(ID, stored({ id: 5 }));
    expect(loadProduct(ID)!.id).toBe(ID);
  });

  it('a rib on a release the list lost still reads as locked: nothing it holds was touched', () => {
    seed(ID, stored({ releases: {} }));
    const product = loadProduct(ID)!;
    expect(isRibLocked(ribOf(product), product.sprints)).toBe(true);
  });
});
