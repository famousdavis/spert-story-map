// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Regression cover for the `schemaVersion` guard divergence fixed in v0.52.5.
 *
 * Before the fix, four expressions decided whether the DESTRUCTIVE v1→v2 waterfall
 * ran, and two of them disagreed for a truthy non-numeric value — `'abc'` and `{}` —
 * because `x < 2` and `!(x >= 2)` are both false when `x` is not comparable to a
 * number. The cloud (which calls `migrateToV2` unguarded) zeroed progress history
 * where local and import did nothing.
 *
 * `migrateToV2` had no dedicated test file at all, which is a large part of why this
 * survived. This is that file.
 */

import { describe, it, expect, vi } from 'vitest';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: unknown) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
});

const { needsV2Migration, normalizeSchemaVersion } = await import('../lib/schemaVersion');
const { migrateToV2 } = await import('../lib/storage');
const { validateProduct } = await import('../lib/validateProduct');
const { SCHEMA_VERSION } = await import('../lib/constants');

/** Every shape a persisted `schemaVersion` has been seen or could plausibly hold. */
const VALUES: Array<[label: string, value: unknown, migrates: boolean]> = [
  ['undefined', undefined, true],   // genuine pre-schemaVersion product
  ['null', null, true],
  ['0', 0, true],
  ["''", '', true],
  ['NaN', NaN, true],
  ['false', false, true],
  ['1', 1, true],
  ["'1'", '1', true],
  ['-1', -1, true],
  ['1.5', 1.5, true],
  ['true', true, true],             // Number(true) === 1
  ['[]', [], true],                 // Number([]) === 0
  ['2', 2, false],
  ["'2'", '2', false],
  ['3', 3, false],
  ["'abc'", 'abc', false],          // ← the divergence, before the fix
  ['{}', {}, false],                // ← the divergence, before the fix
];

/** A v1-shaped product: progress history on a rib with NO allocations, which is
 *  exactly what the waterfall zeroes. If the migration runs, this is destroyed. */
const v1Product = (schemaVersion: unknown) => ({
  id: 'p1',
  name: 'Legacy',
  schemaVersion,
  releases: [],
  sprints: [],
  themes: [{
    id: 't1', name: 'T', backboneItems: [{
      id: 'b1', name: 'B', ribItems: [{
        id: 'r1', name: 'R',
        releaseAllocations: [],
        progressHistory: [{ sprintId: 's1', percentComplete: 40 }],
      }],
    }],
  }],
});

const progressOf = (p: ReturnType<typeof v1Product>) =>
  p.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory;

describe('needsV2Migration', () => {
  for (const [label, value, expected] of VALUES) {
    it(`${label} → ${expected}`, () => {
      expect(needsV2Migration(value)).toBe(expected);
    });
  }

  it('is total — no input throws, including the ones Number() rejects', () => {
    // ⚠️ Number(Symbol) throws, and so does Number() on a null-prototype object.
    // Neither survives a JSON round-trip, but this predicate runs inside
    // migrateToV2, which the cloud calls inside snap.forEach — a throw there takes
    // down the whole index load, which is the failure this release exists to fix.
    const hostile: unknown[] = [
      Symbol('s'), () => {}, new Date(), Infinity, -Infinity, 1n,
      Object.create(null), { valueOf() { throw new Error('hostile'); } },
    ];
    for (const v of hostile) {
      expect(() => needsV2Migration(v)).not.toThrow();
      expect(() => normalizeSchemaVersion(v)).not.toThrow();
      expect(typeof needsV2Migration(v)).toBe('boolean');
    }
  });
});

describe("migrateToV2's own guard is the SHARED predicate", () => {
  // ⚠️ This is the test that would have caught the original bug. It does not compare
  // expressions to each other (that would be tautological now they call one function)
  // — it drives migrateToV2 and asserts the OBSERVABLE outcome matches the predicate.
  // Re-inlining a different comparison inside migrateToV2 fails this.
  for (const [label, value, migrates] of VALUES) {
    it(`${label}: waterfall ${migrates ? 'runs' : 'does NOT run'}`, () => {
      const p = v1Product(value);
      migrateToV2(p);
      if (migrates) {
        expect(progressOf(p)).toHaveLength(0);          // zeroed — no allocations
        expect(p.schemaVersion).toBe(SCHEMA_VERSION);
      } else {
        expect(progressOf(p)).toHaveLength(1);          // untouched
        expect(p.schemaVersion).toBe(value);            // preserved verbatim
      }
    });
  }

  it("'abc' does not destroy progress history — the exact v0.52.4 census finding", () => {
    const p = v1Product('abc');
    migrateToV2(p);
    expect(progressOf(p)).toEqual([{ sprintId: 's1', percentComplete: 40 }]);
  });

  it('is ref-equal and idempotent when it does not migrate', () => {
    const p = v1Product('abc');
    expect(migrateToV2(p)).toBe(p);
    expect(migrateToV2(migrateToV2(p))).toBe(p);
  });
});

describe('migrateToV2 shape guards', () => {
  // ⚠️ The cloud calls migrateToV2 inside `snap.forEach`, so a throw here took down
  // the WHOLE project-index load — every project, not just the malformed one.
  const malformed: Array<[string, unknown]> = [
    ['themes is a string', 'not-an-array'],
    ['themes is an object', { nope: 1 }],
    ['themes is null', null],
    ['themes is a number', 7],
    ['themes is absent', undefined],
  ];
  for (const [label, themes] of malformed) {
    it(`does not throw when ${label}`, () => {
      const p = { id: 'p', name: 'N', schemaVersion: 1, themes };
      expect(() => migrateToV2(p)).not.toThrow();
      expect(migrateToV2(p)).toBe(p);
    });
  }

  it('does not throw on a non-array backboneItems', () => {
    const p = { id: 'p', name: 'N', schemaVersion: 1, themes: [{ id: 't', backboneItems: 'x' }] };
    expect(() => migrateToV2(p)).not.toThrow();
  });

  it('does not throw on a non-array ribItems', () => {
    const p = {
      id: 'p', name: 'N', schemaVersion: 1,
      themes: [{ id: 't', backboneItems: [{ id: 'b', ribItems: null }] }],
    };
    expect(() => migrateToV2(p)).not.toThrow();
  });

  it('does not throw on a null rib, and still migrates its siblings', () => {
    const p = {
      id: 'p', name: 'N', schemaVersion: 1,
      themes: [{ id: 't', backboneItems: [{ id: 'b', ribItems: [
        null,
        { id: 'r', releaseAllocations: [], progressHistory: [{ sprintId: 's', percentComplete: 10 }] },
      ] }] }],
    };
    expect(() => migrateToV2(p)).not.toThrow();
    expect(p.themes[0]!.backboneItems[0]!.ribItems[1]!.progressHistory).toHaveLength(0);
  });

  it('still performs the real v1→v2 waterfall it exists for', () => {
    const p = {
      id: 'p', name: 'N', schemaVersion: 1,
      themes: [{ id: 't', backboneItems: [{ id: 'b', ribItems: [{
        id: 'r',
        releaseAllocations: [{ releaseId: 'rel-A', percentage: 60 }, { releaseId: 'rel-B', percentage: 40 }],
        progressHistory: [{ sprintId: 's1', percentComplete: 100 }],
      }] }] }],
    };
    migrateToV2(p);
    expect(p.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory).toEqual([
      { sprintId: 's1', releaseId: 'rel-A', percentComplete: 60 },
      { sprintId: 's1', releaseId: 'rel-B', percentComplete: 40 },
    ]);
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('normalizeSchemaVersion', () => {
  it('replaces ONLY a truthy non-numeric value', () => {
    expect(normalizeSchemaVersion('abc')).toBe(SCHEMA_VERSION);
    expect(normalizeSchemaVersion({})).toBe(SCHEMA_VERSION);
  });

  it('leaves a falsy value alone — normalising it would skip a legacy migration', () => {
    expect(normalizeSchemaVersion(undefined)).toBeUndefined();
    expect(normalizeSchemaVersion(null)).toBeNull();
    expect(normalizeSchemaVersion(0)).toBe(0);
    expect(normalizeSchemaVersion('')).toBe('');
  });

  it('leaves an interpretable value alone rather than coercing it', () => {
    // Rewriting '1' to 1 would make the validator report a repaired field on every
    // load of a product that has nothing wrong with it.
    expect(normalizeSchemaVersion('1')).toBe('1');
    expect(normalizeSchemaVersion(2)).toBe(2);
  });

  it('agrees with needsV2Migration after normalising', () => {
    for (const [, value] of VALUES) {
      expect(needsV2Migration(normalizeSchemaVersion(value))).toBe(needsV2Migration(value));
    }
  });
});

describe('validateProduct normalises schemaVersion without rejecting', () => {
  const base = (sv: unknown, present = true) => {
    const p: Record<string, unknown> = { id: 'p', name: 'P', themes: [], releases: [], sprints: [] };
    if (present) p.schemaVersion = sv;
    return p;
  };

  it('accepts a malformed schemaVersion instead of rejecting the whole file', () => {
    expect(() => validateProduct(base('abc'))).not.toThrow();
    expect(validateProduct(base('abc')).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('⚠️ leaves an ABSENT schemaVersion absent — stamping one skips the migration forever', () => {
    const out = validateProduct(base(undefined, false));
    expect(Object.prototype.hasOwnProperty.call(out, 'schemaVersion')).toBe(false);
    expect(needsV2Migration(out.schemaVersion)).toBe(true);
  });

  it('does not introduce the key with value undefined', () => {
    // A bare assignment would; `Object.keys` then reports it and the validator
    // observer reads it as an ADDED field on every legacy load.
    const out = validateProduct(base(undefined, false));
    expect(Object.keys(out)).not.toContain('schemaVersion');
  });

  it('leaves every interpretable value byte-identical', () => {
    for (const sv of [null, 0, 1, 2, '1', '2', []]) {
      expect(validateProduct(base(sv)).schemaVersion).toEqual(sv);
    }
  });

  it('the import gate and the validator agree on every value', () => {
    // importProductFromJSON validates, THEN gates on needsV2Migration. If the two
    // disagreed, a file could be normalised into skipping a migration it needed.
    for (const [, value] of VALUES) {
      const validated = validateProduct(base(value));
      expect(needsV2Migration(validated.schemaVersion)).toBe(needsV2Migration(value));
    }
  });
});
