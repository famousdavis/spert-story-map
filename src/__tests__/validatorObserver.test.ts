// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Brief 10 §8 falsification checks, at the §8a harness levels.
 *
 * C1 seam · C2 internal · C3 internal · C4 seam + internal · C6 internal ·
 * C8 direct invocation · C9 unit on `diff`.
 * (C5 is a repo-level byte comparison; C7 is a manual browser check.)
 *
 * ⚠️ THIS FILE IS THE ONE PLACE PERMITTED TO REGISTER THE OBSERVER (§3a), and it
 * MUST `afterEach(clearObserver)`. It is deliberately absent from
 * `vitest.stryker.config.ts` (§7 mechanism 2), so Stryker never runs it, never
 * registers, and `storage.test.ts` / `migration.test.ts` keep executing against an
 * unregistered slot — zero new killing power over `validateProduct.ts` by
 * construction rather than by hygiene. DO NOT add this file to that config.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage before importing anything that touches it at module scope.
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: unknown) => { store[key] = String(value); },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() { return Object.keys(store).length; },
});

const { loadProduct, migrateToV2, createNewProduct, saveProductImmediate } =
  await import('../lib/storage');
const { registerObserver, clearObserver, runObserver } =
  await import('../lib/validatorObserverRegistry');
const { observe, measure, classify, assertIdentity, capProximities } =
  await import('../lib/validatorObserver');
const { diff } = await import('../lib/validatorObserverDiff');
const { stripFirestoreFields } = await import('../lib/firestoreDriver');
const { SCHEMA_VERSION } = await import('../lib/constants');

import type { Product } from '../types';

// --- fixtures ---------------------------------------------------------------

/** Divergent by construction: one dangling allocation and one dangling progress
 *  entry, so `validateProduct` REPAIRS rather than throws (C2's requirement) while
 *  still carrying the release AND sprint C3's dangling case needs (`:385` wraps the
 *  whole allocation reassignment, so with zero releases it never fires). */
function danglingFixture(id = 'p-dangling'): Product {
  return {
    id,
    name: 'Dangling',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: SCHEMA_VERSION,
    sizeMapping: [{ label: 'M', points: 20 }],
    releases: [{ id: 'rel-1', name: 'R1', order: 1, targetDate: null }],
    sprints: [{ id: 'spr-1', name: 'S1', order: 1, endDate: null }],
    themes: [{
      id: 't1', name: 'T', order: 1, backboneItems: [{
        id: 'b1', name: 'B', order: 1, ribItems: [{
          id: 'r1', name: 'R', order: 1, description: '', notes: '',
          size: 'M', category: 'core',
          releaseAllocations: [
            { releaseId: 'rel-1', percentage: 100, memo: '' },
            { releaseId: 'GHOST-REL', percentage: 50, memo: '' },
          ],
          progressHistory: [
            { sprintId: 'spr-1', releaseId: 'rel-1', percentComplete: 50 },
            { sprintId: 'GHOST-SPR', releaseId: 'rel-1', percentComplete: 10 },
          ],
        }],
      }],
    }],
  } as unknown as Product;
}

function pristineFixture(name = 'Pristine'): Product {
  return createNewProduct(name);
}

/** A console call: the leading label, then whatever payload followed it. */
type Call = [label: unknown, ...rest: unknown[]];

interface Spies {
  infoCalls: () => Call[];
  warnCalls: () => Call[];
  errorCalls: () => Call[];
  texts: () => string[];
}

function spyConsole(): Spies {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const calls = (spy: typeof info): Call[] => spy.mock.calls as unknown as Call[];
  return {
    infoCalls: () => calls(info),
    warnCalls: () => calls(warn),
    errorCalls: () => calls(error),
    texts: () => [...calls(info), ...calls(warn), ...calls(error)].map(c => String(c[0])),
  };
}

/** The payload of the first call whose label contains `needle`, if any. */
function payloadOf(calls: Call[], needle: string): Record<string, unknown> | undefined {
  const hit = calls.find(c => String(c[0]).includes(needle));
  return hit?.[1] as Record<string, unknown> | undefined;
}

let uid = 0;
/** Fresh id per call so §3e's classification dedupe never hides a later assertion. */
const nextId = () => `p-${++uid}-${Math.floor(performance.now() * 1000)}`;

beforeEach(() => { uid += 100; });
afterEach(() => {
  clearObserver();          // ⚠️ MANDATORY — §3a
  vi.restoreAllMocks();
});

// --- C9 — the diff spec holds (unit on `diff` alone) ------------------------

describe('C9 — diff spec', () => {
  it('1. distinguishes a DELETED key from a key present with value undefined', () => {
    expect(diff({ a: 1, b: 2 }, { b: 2 })).toEqual(['a DELETED']);
    expect(diff({ a: 1, b: 2 }, { a: undefined, b: 2 })).toEqual(['a']);
    // The two results must not collide.
    expect(diff({ a: 1 }, {})).not.toEqual(diff({ a: 1 }, { a: undefined }));
  });

  it('2. reports an array length change as ONE path, not a per-index cascade', () => {
    expect(diff({ xs: [1, 2, 3] }, { xs: [1] })).toEqual(['xs.length']);
  });

  it('3. reports a cycle on product.description without recursing forever', () => {
    // `description` is one of the eight allowlisted top-level fields with zero
    // asserts, so it survives the :529-533 strip loop. `self` would not: the
    // walker would report `self DELETED` and never reach the cycle.
    const left: Record<string, unknown> = { id: 'p', description: null };
    left.description = left;
    const right: Record<string, unknown> = { id: 'p', description: null };
    right.description = right;
    const paths = diff(left, right);
    expect(paths).toEqual(['description <cycle>']);
  });

  it('4. renders a nested array element path with dotted keys and indices', () => {
    const left = { themes: [{ backboneItems: [{ ribItems: [{}, {}, {}, { size: 'M' }] }] }] };
    const right = structuredClone(left) as typeof left;
    right.themes[0]!.backboneItems[0]!.ribItems[3]!.size = '';
    expect(diff(left, right)).toEqual(['themes[0].backboneItems[0].ribItems[3].size']);
  });

  it('5. returns ZERO paths for an acyclic object diffed against ITSELF', () => {
    // This is what holds §3b.1's one-sided seen-set. A both-sides set that does
    // `check a → add a → check b → add b` reports a spurious cycle here, and
    // fixture 3 passes identically under all four implementations.
    const x = { a: { b: [1, 2, { c: 'd' }] }, e: null };
    expect(diff(x, x)).toEqual([]);
  });
});

// --- C8 — didMigrate is correct at both seams (direct invocation) -----------

describe('C8 — didMigrate at both seams', () => {
  const body = (schemaVersion: unknown) => ({
    id: 'p', name: 'P', themes: [], releases: [], sprints: [], schemaVersion,
  });

  /** Cloud: migrateToV2(stripFirestoreFields({ id, ...data })), capture off `data`. */
  const cloudPair = (schemaVersion: unknown) => {
    const data = body(schemaVersion) as Record<string, unknown>;
    const rawSchemaVersion = data.schemaVersion;
    const product = migrateToV2(stripFirestoreFields({ id: 'p', ...data })) as Product;
    return { product, rawSchemaVersion };
  };

  /** Local: capture BEFORE the storage.ts:174 gate, then run the gate. */
  const localPair = (schemaVersion: unknown) => {
    let product = body(schemaVersion) as unknown as Product;
    const rawSchemaVersion = product?.schemaVersion;
    if (product && ((product.schemaVersion as number) || 1) < SCHEMA_VERSION) {
      product = migrateToV2(product) as Product;
    }
    return { product, rawSchemaVersion };
  };

  const cases: Array<[string, unknown, 'cloud' | 'local', boolean]> = [
    ['schemaVersion: undefined', undefined, 'cloud', true],
    ['schemaVersion: 1', 1, 'cloud', true],
    ['schemaVersion: 2', 2, 'cloud', false],
    ["schemaVersion: 'abc'", 'abc', 'cloud', true],
    ['schemaVersion: 1', 1, 'local', true],
    ["schemaVersion: 'abc'", 'abc', 'local', false],
  ];

  for (const [label, sv, seam, required] of cases) {
    it(`${label} @ ${seam} → ${required}`, () => {
      const { product, rawSchemaVersion } = seam === 'cloud' ? cloudPair(sv) : localPair(sv);
      expect(measure(product, rawSchemaVersion).didMigrate).toBe(required);
    });
  }

  it('stamps APP_VERSION on every measurement record', async () => {
    const { APP_VERSION } = await import('../lib/version');
    expect(measure(pristineFixture(), 2).appVersion).toBe(APP_VERSION);
  });

  it('reports the changelog count and every cap it enforces', () => {
    const p = pristineFixture();
    const m = measure(p, p.schemaVersion);
    expect(m.changelogCount).toBe(p._changeLog?.length ?? 0);
    expect(m.capProximity.sizeMapping).toEqual({ used: 7, cap: 20 });
    expect(m.capProximity.journalEntries?.cap).toBe(500);
    expect(Object.keys(capProximities(p)).length).toBeGreaterThanOrEqual(15);
  });
});

// --- C3 — classifies (observer-internal) ------------------------------------

describe('C3 — classification corpus', () => {
  const runObserve = (p: Product) => {
    const s = spyConsole();
    observe(p, { rawSchemaVersion: p.schemaVersion });
    return s.texts().join(' | ');
  };

  it('pristine → ok', () => {
    expect(runObserve({ ...pristineFixture(), id: nextId() })).toContain('[observer] ok');
  });

  it('dangling reference → repaired', () => {
    const out = runObserve(danglingFixture(nextId()));
    expect(out).toContain('[observer] REPAIRED');
    expect(out).not.toContain('REJECTED');
  });

  it('>500 changelog → rejected', () => {
    const p = { ...pristineFixture(), id: nextId() } as Product;
    p._changeLog = Array.from(
      { length: 501 },
      () => ({ op: 'add', entity: 'rib', t: 1 }),
    ) as unknown as Product['_changeLog'];
    expect(runObserve(p)).toContain('[observer] REJECTED');
  });

  it('unknown top-level field → repaired, reported as an unknown-field sub-class', () => {
    const p = { ...pristineFixture(), id: nextId(), bogusTopLevel: 1 } as unknown as Product;
    const s = spyConsole();
    observe(p, { rawSchemaVersion: p.schemaVersion });
    expect(payloadOf(s.warnCalls(), 'REPAIRED')?.unknownFields).toContain('bogusTopLevel');
  });

  it('empty name → rejected', () => {
    const p = { ...pristineFixture(), id: nextId(), name: '' } as Product;
    expect(runObserve(p)).toContain('[observer] REJECTED');
  });

  it('the dangling fixture reports the repaired array lengths, not a per-index cascade', () => {
    const p = danglingFixture(nextId());
    const s = spyConsole();
    observe(p, { rawSchemaVersion: p.schemaVersion });
    expect(payloadOf(s.warnCalls(), 'REPAIRED')?.paths).toEqual([
      'themes[0].backboneItems[0].ribItems[0].releaseAllocations.length',
      'themes[0].backboneItems[0].ribItems[0].progressHistory.length',
    ]);
  });
});

// --- C2 — the clone is mandatory (observer-internal) ------------------------

describe('C2 — the clone is mandatory', () => {
  it('leaves the live object untouched and still reports the divergence', () => {
    // Repair-class fixture, per §8's constraint: a rejection-class fixture would
    // classify `rejected` and clause (a) would fail with the clone present too.
    const live = danglingFixture(nextId());
    const before = structuredClone(live);
    const s = spyConsole();

    observe(live, { rawSchemaVersion: live.schemaVersion });

    // (b), inverted: WITH the clone the live object must NOT be mutated.
    expect(live).toEqual(before);
    const rib = live.themes[0]!.backboneItems[0]!.ribItems[0]!;
    expect(rib.releaseAllocations).toHaveLength(2);
    expect(rib.progressHistory).toHaveLength(2);
    // (a), inverted: WITH the clone the diff must be non-empty and not `ok`.
    expect(s.texts().join(' | ')).toContain('[observer] REPAIRED');
  });

  it('sabotage direction: validateProduct DOES destroy live state when handed it', async () => {
    // Pins the premise C2's sabotage rests on — the validator mutates in place and
    // returns the same reference (:260 … :535). If this ever stops being true, the
    // whole clone mandate is moot and C2 becomes decorative.
    const { validateProduct } = await import('../lib/validateProduct');
    const live = danglingFixture(nextId());
    const returned = validateProduct(live);
    expect(returned).toBe(live);
    expect(live.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations).toHaveLength(1);
    expect(live.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory).toHaveLength(1);
  });
});

// --- C4 — cannot propagate, and the two levels are distinct ------------------

describe('C4 — isolation', () => {
  it('null returns via the guard, before measure dereferences it (internal)', () => {
    const s = spyConsole();
    expect(() => observe(null, { rawSchemaVersion: undefined })).not.toThrow();
    // Nothing at all: no measurement, no classification, and crucially no
    // observer-error — a stale index entry must not inflate the noise count.
    expect(s.texts()).toEqual([]);
  });

  it('an observer-internal failure is noise, not a rejection (internal)', () => {
    // structuredClone throws DataCloneError on a function, inside the outer try
    // and after measure — exactly §4's outer level.
    const p = { ...pristineFixture(), id: nextId() } as unknown as Record<string, unknown>;
    p.trap = () => {};
    const s = spyConsole();
    expect(() => observe(p as unknown as Product, { rawSchemaVersion: 2 })).not.toThrow();
    const out = s.texts().join(' | ');
    expect(out).toContain('[observer] internal failure');
    expect(out).not.toContain('REJECTED');
  });

  it('a validator throw is a rejection, not an observer error (internal)', () => {
    const p = { ...pristineFixture(), id: nextId(), name: '' } as Product;
    const s = spyConsole();
    observe(p, { rawSchemaVersion: 2 });
    const out = s.texts().join(' | ');
    expect(out).toContain('[observer] REJECTED');
    expect(out).not.toContain('internal failure');
  });

  it('a throwing registration cannot propagate into a load path (seam)', () => {
    const p = { ...pristineFixture('Throwing'), id: nextId() } as Product;
    saveProductImmediate(p);
    registerObserver(() => { throw new Error('observer exploded'); });
    const s = spyConsole();
    expect(() => loadProduct(p.id)).not.toThrow();
    expect(loadProduct(p.id)).toBeTruthy();
    expect(s.errorCalls().map(c => String(c[0])).join(' ')).toContain('registry backstop');
  });

  it('a rejected product still loads normally through the seam (seam)', () => {
    const p = { ...pristineFixture('Rejectable'), id: nextId(), name: 'ok-for-now' } as Product;
    saveProductImmediate(p);
    // Seed a name the validator rejects, without going through a mutation path.
    const key = `rp:local:product_${p.id}`;
    localStorage.setItem(key, JSON.stringify({ ...p, name: '' }));
    registerObserver(observe);
    const s = spyConsole();
    const loaded = loadProduct(p.id);
    expect(loaded).toBeTruthy();
    expect(loaded?.name).toBe('');           // unchanged — the observer repaired nothing
    expect(s.texts().join(' | ')).toContain('[observer] REJECTED');
  });
});

// --- C1 — cannot alter output (seam) ----------------------------------------

describe('C1 — cannot alter output', () => {
  it('returns the same reference and an unchanged object on a DIVERGENT fixture', () => {
    // A pristine fixture would pass this vacuously.
    const live = danglingFixture(nextId());
    const before = structuredClone(live);
    registerObserver(observe);
    spyConsole();

    // `observe` is called for effect and returns nothing; the seam's own value is
    // the product it already had.
    const returned = ((p: Product) => { runObserver(p, { rawSchemaVersion: p.schemaVersion }); return p; })(live);

    expect(returned).toBe(live);
    expect(returned).toEqual(before);
  });

  it('the local seam returns byte-identical data with the observer registered (seam)', () => {
    const p = danglingFixture(nextId());
    saveProductImmediate(p);
    const withoutObserver = JSON.stringify(loadProduct(p.id));

    registerObserver(observe);
    spyConsole();
    const withObserver = JSON.stringify(loadProduct(p.id));

    expect(withObserver).toBe(withoutObserver);
    // and the divergence really is there, so the comparison is not vacuous
    expect(withObserver).toContain('GHOST-REL');
  });
});

// --- C6 — measurements survive a classification failure ---------------------

describe('C6 — measurements survive a classification failure', () => {
  it('emits a measurement even when validateProduct rejects the product', () => {
    const p = { ...pristineFixture(), id: nextId(), name: '' } as Product;
    const s = spyConsole();
    observe(p, { rawSchemaVersion: 1 });
    const measured = payloadOf(s.infoCalls(), '[observer] measure');
    expect(measured).toBeDefined();
    expect(measured?.didMigrate).toBe(true);
    expect(s.texts().join(' | ')).toContain('[observer] REJECTED');
  });

  it('emits a measurement even when the observer itself fails internally', () => {
    const p = { ...pristineFixture(), id: nextId() } as unknown as Record<string, unknown>;
    p.trap = () => {};
    const s = spyConsole();
    observe(p as unknown as Product, { rawSchemaVersion: 2 });
    expect(payloadOf(s.infoCalls(), '[observer] measure')).toBeDefined();
    expect(s.texts().join(' | ')).toContain('internal failure');
  });

  it('emits the changelog count under a neutral label, never _changeLog', () => {
    const p = { ...pristineFixture(), id: nextId() } as Product;
    const s = spyConsole();
    observe(p, { rawSchemaVersion: p.schemaVersion });
    const payload = payloadOf(s.infoCalls(), 'measure');
    expect(payload).toHaveProperty('entryCount');
    expect(JSON.stringify(payload)).not.toContain('_changeLog');
    expect(JSON.stringify(payload)).not.toContain('changelogCount');
  });
});

// --- assertIdentity — identities, never content ------------------------------

describe('assertIdentity', () => {
  it('elides user data between the first and last double quote', () => {
    expect(assertIdentity(new Error('Too many allocations on rib "Secret Rib Name"')))
      .toBe('Error: Too many allocations on rib ""');
    expect(assertIdentity(new Error('Too many backbones in theme "Secret" (max 200)')))
      .toBe('Error: Too many backbones in theme "" (max 200)');
  });

  it('elides across embedded quotes — first-to-last, not first pair', () => {
    expect(assertIdentity(new Error('theme "a" evil "b" (max 200)')))
      .toBe('Error: theme "" (max 200)');
  });

  it('leaves a quote-free message intact', () => {
    expect(assertIdentity(new Error('Product themes must be an array')))
      .toBe('Error: Product themes must be an array');
  });

  it('tolerates a non-assert throw — the TypeError from validateProduct.ts:275', async () => {
    const { validateProduct } = await import('../lib/validateProduct');
    let thrown: unknown;
    try {
      validateProduct({ id: 'p', name: 'P', themes: [], releases: [null], sprints: [] });
    } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(TypeError);
    expect(assertIdentity(thrown)).toBe(
      "TypeError: Cannot read properties of null (reading 'id')",
    );
  });

  it('falls back to a constructor name when there is no string message', () => {
    expect(assertIdentity('a bare string')).toBe('string');
    expect(assertIdentity(null)).toBe('null');
    expect(assertIdentity({ nope: 1 })).toBe('Object');
  });
});

// --- classify ----------------------------------------------------------------

describe('classify', () => {
  it('zero paths is ok; any path is repaired', () => {
    expect(classify([]).cls).toBe('ok');
    expect(classify(['themes[0].name']).cls).toBe('repaired');
  });

  it('treats only TOP-LEVEL deletions as the unknown-field sub-class', () => {
    const c = classify(['bogus DELETED', 'themes[0].ribItems[0].weird DELETED', 'name']);
    expect(c.unknownFields).toEqual(['bogus']);
  });
});

// --- registry ----------------------------------------------------------------

describe('registry slot', () => {
  it('is a no-op until something registers', () => {
    const s = spyConsole();
    expect(() => runObserver(pristineFixture(), { rawSchemaVersion: 2 })).not.toThrow();
    expect(s.texts()).toEqual([]);
  });

  it('clearObserver restores the no-op', () => {
    registerObserver(observe);
    clearObserver();
    const s = spyConsole();
    runObserver(danglingFixture(nextId()), { rawSchemaVersion: 2 });
    expect(s.texts()).toEqual([]);
  });

  it('is synchronous — runObserver returns undefined, not a promise', () => {
    registerObserver(() => {});
    expect(runObserver(pristineFixture(), { rawSchemaVersion: 2 })).toBeUndefined();
  });
});
