// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateProduct } from '../lib/validateProduct';
import { importProductFromJSON } from '../lib/importExport';
import { guardCloudProduct } from '../lib/cloudLoadGuard';
import { isRibLocked } from '../lib/ribHelpers';
import { applyAiOp, computeSafePrefix } from '../lib/aiOps';
import { deleteReleaseFromProduct, releaseHoldsRecords } from '../lib/settingsMutations';
import { cleanCardOrder } from '../lib/productTransforms';
import { duplicateProduct } from '../lib/storage';
import { createSampleProduct } from '../lib/sampleData';
import { computeLayout } from '../components/storymap/useMapLayout';
import { getProjectTotals, getProgressOverTime, getRibItemPoints } from '../lib/calculations';
import { getReconciliationRows, getStrandedRows } from '../lib/reconciliation';
import { buildForecasterExport } from '../lib/exportForForecaster';
import { parseImportFile } from '../lib/import-utils';
import { DEFAULT_SIZE_MAPPING } from '../lib/constants';
import type { Product } from '../types';
import { req, asRecord } from './testHelpers';

function minimal(overrides = {}) {
  return {
    id: 'prod-1',
    name: 'Test Product',
    themes: [],
    releases: [],
    sprints: [],
    schemaVersion: 2,
    ...overrides,
  };
}

const ribOf = (product: Pick<Product, 'themes'>) =>
  req(product.themes[0]?.backboneItems[0]?.ribItems[0], 'rib');

/** importProductFromJSON and duplicateProduct stamp a workspace id. */
function stubLocalStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: unknown) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
  });
}

describe('validateProduct', () => {
  // --- Top-level required fields ---
  it('accepts a minimal valid product', () => {
    const result = validateProduct(minimal());
    expect(result.id).toBe('prod-1');
    expect(result.name).toBe('Test Product');
  });

  it('rejects non-object input', () => {
    expect(() => validateProduct(null)).toThrow('must be a JSON object');
    expect(() => validateProduct('string')).toThrow('must be a JSON object');
    expect(() => validateProduct([])).toThrow('must be a JSON object');
  });

  it('rejects missing id', () => {
    expect(() => validateProduct({ name: 'N', themes: [] })).toThrow('Product id');
  });

  it('rejects missing name', () => {
    expect(() => validateProduct({ id: 'x', themes: [] })).toThrow('Product name');
  });

  it('rejects missing themes array', () => {
    expect(() => validateProduct({ id: 'x', name: 'N' })).toThrow('themes must be an array');
  });

  it('rejects id containing slash', () => {
    expect(() => validateProduct(minimal({ id: 'a/b' }))).toThrow('no slashes');
  });

  it('rejects empty id', () => {
    expect(() => validateProduct(minimal({ id: '' }))).toThrow('Product id');
  });

  // --- String length limits ---
  it('rejects name exceeding max length', () => {
    expect(() => validateProduct(minimal({ name: 'x'.repeat(1001) }))).toThrow('max');
  });

  // --- Releases ---
  it('validates release structure', () => {
    const data = minimal({
      releases: [{ id: 'r1', name: 'Release 1', order: 1 }],
    });
    const result = validateProduct(data);
    expect(result.releases[0]?.id).toBe('r1');
  });

  it('rejects release with missing id', () => {
    expect(() => validateProduct(minimal({
      releases: [{ name: 'R' }],
    }))).toThrow('Release id');
  });

  it('rejects release with missing name', () => {
    expect(() => validateProduct(minimal({
      releases: [{ id: 'r1' }],
    }))).toThrow('Release name');
  });

  it('rejects too many releases', () => {
    const releases = Array.from({ length: 101 }, (_, i) => ({
      id: `r${i}`, name: `Release ${i}`,
    }));
    expect(() => validateProduct(minimal({ releases }))).toThrow('Too many releases');
  });

  // --- Sprints ---
  it('validates sprint structure', () => {
    const data = minimal({
      sprints: [{ id: 's1', name: 'Sprint 1' }],
    });
    const result = validateProduct(data);
    expect(result.sprints[0]?.id).toBe('s1');
  });

  it('rejects sprint with missing id', () => {
    expect(() => validateProduct(minimal({
      sprints: [{ name: 'S' }],
    }))).toThrow('Sprint id');
  });

  // --- Size mapping ---
  it('validates size mapping', () => {
    const data = minimal({
      sizeMapping: [{ label: 'S', points: 5 }, { label: 'M', points: 10 }],
    });
    const result = validateProduct(data);
    expect(result.sizeMapping).toHaveLength(2);
  });

  it('rejects negative size points', () => {
    expect(() => validateProduct(minimal({
      sizeMapping: [{ label: 'S', points: -1 }],
    }))).toThrow('non-negative number');
  });

  // --- Themes / Backbones / Ribs ---
  it('validates nested structure', () => {
    const data = minimal({
      themes: [{
        id: 't1', name: 'Theme',
        backboneItems: [{
          id: 'b1', name: 'Backbone',
          ribItems: [{
            id: 'r1', name: 'Rib', size: '', category: 'core',
            releaseAllocations: [], progressHistory: [],
          }],
        }],
      }],
    });
    const result = validateProduct(data);
    expect(result.themes[0]?.backboneItems[0]?.ribItems[0]?.id).toBe('r1');
  });

  it('rejects theme missing id', () => {
    expect(() => validateProduct(minimal({
      themes: [{ backboneItems: [] }],
    }))).toThrow('Theme id');
  });

  it('rejects theme with non-array backboneItems', () => {
    expect(() => validateProduct(minimal({
      themes: [{ id: 't1', backboneItems: 'bad' }],
    }))).toThrow('backboneItems must be an array');
  });

  it('rejects backbone missing id', () => {
    expect(() => validateProduct(minimal({
      themes: [{ id: 't1', backboneItems: [{ ribItems: [] }] }],
    }))).toThrow('Backbone id');
  });

  it('rejects rib missing id', () => {
    expect(() => validateProduct(minimal({
      themes: [{ id: 't1', backboneItems: [{ id: 'b1', ribItems: [{ name: 'R' }] }] }],
    }))).toThrow('Rib item id');
  });

  // --- Allocation validation ---
  it('clamps allocation percentage to 0-100', () => {
    const data = minimal({
      themes: [{
        id: 't1', backboneItems: [{
          id: 'b1', ribItems: [{
            id: 'r1', releaseAllocations: [
              { releaseId: 'rel1', percentage: 150 },
              { releaseId: 'rel2', percentage: -10 },
            ],
            progressHistory: [],
          }],
        }],
      }],
      releases: [{ id: 'rel1', name: 'R1' }, { id: 'rel2', name: 'R2' }],
    });
    const result = validateProduct(data);
    const allocs = req(result.themes[0]?.backboneItems[0]?.ribItems[0]?.releaseAllocations, 'allocs');
    expect(allocs[0]?.percentage).toBe(100);
    expect(allocs[1]?.percentage).toBe(0);
  });

  // --- Progress validation ---
  it('clamps progress percentComplete to 0-100', () => {
    const data = minimal({
      themes: [{
        id: 't1', backboneItems: [{
          id: 'b1', ribItems: [{
            id: 'r1', releaseAllocations: [],
            progressHistory: [
              { sprintId: 's1', percentComplete: 200 },
            ],
          }],
        }],
      }],
      sprints: [{ id: 's1', name: 'Sprint 1' }],
    });
    const result = validateProduct(data);
    const progress = req(result.themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory, 'progress');
    expect(progress[0]?.percentComplete).toBe(100);
  });

  // A comment-only progress entry — percentComplete null with a comment kept —
  // is written by progressMutations.removeProgress and .updateComment. The
  // validator used to assert isNum() on it, which is false for null, so it threw
  // and rejected the WHOLE file. Any project holding an assessment note without
  // a percentage could not be re-imported.
  function withProgress(progressHistory: unknown[]) {
    return minimal({
      themes: [{
        id: 't1', backboneItems: [{
          id: 'b1', ribItems: [{ id: 'r1', releaseAllocations: [], progressHistory }],
        }],
      }],
      sprints: [{ id: 's1', name: 'Sprint 1' }],
      releases: [{ id: 'rel1', name: 'Release 1', order: 1 }],
    });
  }
  const firstEntry = (p: ReturnType<typeof validateProduct>) =>
    req(req(p.themes[0]?.backboneItems[0]?.ribItems[0], 'rib').progressHistory[0], 'entry');

  it('accepts a comment-only progress entry (percentComplete null)', () => {
    const result = validateProduct(withProgress([
      { sprintId: 's1', releaseId: 'rel1', percentComplete: null, comment: 'Blocked on vendor' },
    ]));
    const entry = firstEntry(result);
    expect(entry.percentComplete).toBeNull();
    expect(entry.comment).toBe('Blocked on vendor');
  });

  it('normalises an absent percentComplete to null', () => {
    const result = validateProduct(withProgress([
      { sprintId: 's1', releaseId: 'rel1', comment: 'No percentage given' },
    ]));
    expect(firstEntry(result).percentComplete).toBeNull();
  });

  it('still rejects a percentComplete that is neither a number nor null', () => {
    expect(() => validateProduct(withProgress([
      { sprintId: 's1', releaseId: 'rel1', percentComplete: 'abc' },
    ]))).toThrow('percentComplete must be a number');
    expect(() => validateProduct(withProgress([
      { sprintId: 's1', releaseId: 'rel1', percentComplete: NaN },
    ]))).toThrow('percentComplete must be a number');
  });

  it('round-trips a comment-only entry through JSON.stringify → import', () => {
    // The user-facing path: a project where someone wrote an assessment note
    // without a percentage, exported, then re-imported. This threw before the
    // fix and took the whole file with it, not just the entry.
    //
    // importProductFromJSON stamps a workspace id, so it needs localStorage —
    // stubbed only for this test, since the rest of the file exercises the pure
    // validator and must not depend on a browser global.
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: unknown) => { store[key] = String(value); },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { for (const key of Object.keys(store)) delete store[key]; },
    });
    try {
      const exported = JSON.stringify(withProgress([
        { sprintId: 's1', releaseId: 'rel1', percentComplete: null, comment: 'Waiting on legal' },
      ]));
      const reimported = importProductFromJSON(exported);
      const entry = firstEntry(reimported);
      expect(entry.percentComplete).toBeNull();
      expect(entry.comment).toBe('Waiting on legal');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('preserves a real percentComplete alongside a null one', () => {
    const result = validateProduct(withProgress([
      { sprintId: 's1', releaseId: 'rel1', percentComplete: 40 },
      { sprintId: 's1', releaseId: 'rel1', percentComplete: null, comment: 'note' },
    ]));
    const rib = req(result.themes[0]?.backboneItems[0]?.ribItems[0], 'rib');
    expect(rib.progressHistory[0]?.percentComplete).toBe(40);
    expect(rib.progressHistory[1]?.percentComplete).toBeNull();
  });

  // --- Size validation ---
  it('clears invalid size labels when sizeMapping exists', () => {
    const data = minimal({
      sizeMapping: [{ label: 'S', points: 5 }],
      themes: [{
        id: 't1', backboneItems: [{
          id: 'b1', ribItems: [{
            id: 'r1', size: 'XXXL', releaseAllocations: [], progressHistory: [],
          }],
        }],
      }],
    });
    const result = validateProduct(data);
    expect(result.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBe('');
  });

  describe('a rib size, by the size list it is read against', () => {
    const NO_LIST = Symbol('no size list');
    const NO_SIZE = Symbol('no size');
    const LONGEST_LABEL = 'x'.repeat(20);

    const fileWith = (sizeMapping: unknown, size: unknown) => minimal({
      ...(sizeMapping === NO_LIST ? {} : { sizeMapping }),
      themes: [{
        id: 't1', backboneItems: [{
          id: 'b1', ribItems: [{
            id: 'r1', ...(size === NO_SIZE ? {} : { size }), releaseAllocations: [], progressHistory: [],
          }],
        }],
      }],
    });
    const sizeAfter = (sizeMapping: unknown, size: unknown) =>
      ribOf(validateProduct(fileWith(sizeMapping, size))).size;

    it.each(['M', 'Custom', LONGEST_LABEL])('keeps %s against an empty list', (label) => {
      expect(sizeAfter([], label)).toBe(label);
    });

    it.each([
      ['a number', 5],
      ['true', true],
      ['an object', {}],
      ['a list', ['M']],
      ['a label no row could hold', `${LONGEST_LABEL}x`],
    ])('clears %s against an empty list', (_label, size) => {
      expect(sizeAfter([], size)).toBe('');
    });

    it('leaves a rib with no size as it was against an empty list', () => {
      expect(sizeAfter([], '')).toBe('');
      expect(sizeAfter([], null)).toBeNull();
      expect(asRecord(ribOf(validateProduct(fileWith([], NO_SIZE))))).not.toHaveProperty('size');
    });

    it('keeps a label in the list, and clears everything else, however long the list', () => {
      const oneRow = [{ label: 'S', points: 5 }];
      const twoRows = [...oneRow, { label: 'L', points: 13 }];
      expect(sizeAfter(oneRow, 'S')).toBe('S');
      for (const rows of [oneRow, twoRows]) {
        expect(sizeAfter(rows, 'M')).toBe('');
        expect(sizeAfter(rows, LONGEST_LABEL)).toBe('');
        expect(sizeAfter(rows, 5)).toBe('');
      }
    });

    it.each(['M', 'Custom'])('keeps %s with no list, whose rows the import fills in', (label) => {
      stubLocalStorage();
      const imported = importProductFromJSON(JSON.stringify(fileWith(NO_LIST, label)));

      expect(ribOf(imported).size).toBe(label);
      expect(imported.sizeMapping).toEqual(DEFAULT_SIZE_MAPPING);
      vi.unstubAllGlobals();
    });

    // ⚠️ TODAY'S BEHAVIOUR, NOT A WISH. With no list nothing is checked, so a value that
    // is not a label gets through, and a read then sets it aside with the notice.
    it('checks nothing with no list, so a wrong-typed size stays', () => {
      expect(sizeAfter(NO_LIST, 5)).toBe(5);
    });

    it('keeps a size when the list is not a list, which the import treats as none', () => {
      stubLocalStorage();
      const imported = importProductFromJSON(JSON.stringify(fileWith(5, 'Custom')));

      expect(ribOf(imported).size).toBe('Custom');
      expect(imported.sizeMapping).toEqual(DEFAULT_SIZE_MAPPING);
      vi.unstubAllGlobals();
    });
  });

  // --- Unknown field stripping ---
  it('strips unknown top-level fields', () => {
    const data = minimal({ _malicious: 'payload', injected: true });
    const result = validateProduct(data);
    // asRecord: these keys are supposed to be GONE, so the Product type
    // rightly has no idea about them.
    expect(asRecord(result)._malicious).toBeUndefined();
    expect(asRecord(result).injected).toBeUndefined();
  });

  it('preserves known export-time fields for later stripping', () => {
    const data = minimal({ _storageRef: 'ref', _exportedBy: 'Alice' });
    const result = validateProduct(data);
    expect(result._storageRef).toBe('ref');
    expect(result._exportedBy).toBe('Alice');
  });

  // --- releaseCardOrder / sizingCardOrder ---
  it('filters invalid IDs from releaseCardOrder', () => {
    const data = minimal({
      releaseCardOrder: {
        'rel1': ['id1', '', null, 'id2'],
        'bad': 'not-an-array',
      },
    });
    const result = validateProduct(data);
    expect(result.releaseCardOrder?.['rel1']).toEqual(['id1', 'id2']);
    // Bound, not optional-chained: toBeUndefined() PASSES on undefined, so
    // `?.` here would make the assertion pass if the map itself vanished.
    expect(req(result.releaseCardOrder, 'releaseCardOrder')['bad']).toBeUndefined();
  });

  // --- cardColorLabels ---
  it('keeps valid color labels and drops unknown keys / non-strings / empties', () => {
    const data = minimal({
      cardColorLabels: {
        rose: 'Defer for discussion',
        violet: '  Maybe not needed  ',  // trimmed
        emerald: '',          // empty after trim → dropped
        sky: 123,             // non-string → dropped
        notacolor: 'nope',    // unknown key → dropped
      },
    });
    const result = validateProduct(data);
    expect(result.cardColorLabels).toEqual({
      rose: 'Defer for discussion',
      violet: 'Maybe not needed',
    });
  });

  it('caps color labels at the max length', () => {
    const data = minimal({ cardColorLabels: { violet: 'x'.repeat(200) } });
    const result = validateProduct(data);
    const labels = req(result.cardColorLabels, 'cardColorLabels');
    expect(req(labels.violet, 'violet').length).toBe(80);
  });

  it('strips dangerous keys from cardColorLabels', () => {
    const labels = JSON.parse('{"rose":"ok","__proto__":"hack","constructor":"hack2"}');
    const data = minimal({ cardColorLabels: labels });
    const result = validateProduct(data);
    expect(result.cardColorLabels).toEqual({ rose: 'ok' });
    expect(Object.prototype.hasOwnProperty.call(result.cardColorLabels, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.cardColorLabels, 'constructor')).toBe(false);
  });

  it('migrates a legacy amber color label to orange', () => {
    const data = minimal({ cardColorLabels: { amber: 'Deferred' } });
    const result = validateProduct(data);
    expect(result.cardColorLabels).toEqual({ orange: 'Deferred' });
  });

  it('prefers an existing orange label over a legacy amber one', () => {
    const data = minimal({ cardColorLabels: { amber: 'old', orange: 'new' } });
    const result = validateProduct(data);
    expect(result.cardColorLabels).toEqual({ orange: 'new' });
  });

  it('migrates a legacy amber cardColor to orange on a rib', () => {
    const data = minimal({
      themes: [{
        id: 't1', name: 'T', backboneItems: [{
          id: 'b1', name: 'B', ribItems: [{ id: 'r1', name: 'R1', cardColor: 'amber' }],
        }],
      }],
    });
    const result = validateProduct(data);
    expect(result.themes[0]?.backboneItems[0]?.ribItems[0]?.cardColor).toBe('orange');
  });

  // --- _changeLog ---
  it('accepts valid changelog', () => {
    const data = minimal({
      _changeLog: [
        { t: 1000, op: 'create', entity: 'product' },
      ],
    });
    const result = validateProduct(data);
    expect(result._changeLog).toHaveLength(1);
  });

  it('rejects changelog entry with non-numeric timestamp', () => {
    expect(() => validateProduct(minimal({
      _changeLog: [{ t: 'not-a-number', op: 'create' }],
    }))).toThrow('timestamp');
  });

  it('rejects changelog entry with zero timestamp', () => {
    expect(() => validateProduct(minimal({
      _changeLog: [{ t: 0, op: 'create' }],
    }))).toThrow('valid Unix timestamp');
  });

  it('rejects changelog entry with negative timestamp', () => {
    expect(() => validateProduct(minimal({
      _changeLog: [{ t: -100, op: 'create' }],
    }))).toThrow('valid Unix timestamp');
  });

  it('rejects changelog entry with far-future timestamp', () => {
    expect(() => validateProduct(minimal({
      _changeLog: [{ t: 5000000000, op: 'create' }],
    }))).toThrow('valid Unix timestamp');
  });

  // --- File size limit (tested at importProductFromJSON level) ---
  it('rejects oversized JSON at importProductFromJSON level', async () => {
    const { importProductFromJSON } = await import('../lib/importExport');
    const bigString = 'x'.repeat(6 * 1024 * 1024);
    expect(() => importProductFromJSON(bigString)).toThrow('too large');
  });

  // --- sprintCadenceWeeks ---
  it('accepts valid sprintCadenceWeeks', () => {
    const result = validateProduct(minimal({ sprintCadenceWeeks: 2 }));
    expect(result.sprintCadenceWeeks).toBe(2);
  });

  it('rejects zero sprintCadenceWeeks', () => {
    expect(() => validateProduct(minimal({ sprintCadenceWeeks: 0 }))).toThrow('positive number');
  });

  it('clamps sprintCadenceWeeks to max 52', () => {
    const result = validateProduct(minimal({ sprintCadenceWeeks: 100 }));
    expect(result.sprintCadenceWeeks).toBe(52);
  });

  it('clamps sprintCadenceWeeks to min 1', () => {
    const result = validateProduct(minimal({ sprintCadenceWeeks: 0.5 }));
    expect(result.sprintCadenceWeeks).toBe(1);
  });

  // --- Category enum validation ---
  it('accepts valid rib category "core"', () => {
    const data = minimal({
      themes: [{
        id: 't1', backboneItems: [{
          id: 'b1', ribItems: [{
            id: 'r1', category: 'core',
            releaseAllocations: [], progressHistory: [],
          }],
        }],
      }],
    });
    const result = validateProduct(data);
    expect(result.themes[0]?.backboneItems[0]?.ribItems[0]?.category).toBe('core');
  });

  it('accepts valid rib category "non-core"', () => {
    const data = minimal({
      themes: [{
        id: 't1', backboneItems: [{
          id: 'b1', ribItems: [{
            id: 'r1', category: 'non-core',
            releaseAllocations: [], progressHistory: [],
          }],
        }],
      }],
    });
    const result = validateProduct(data);
    expect(result.themes[0]?.backboneItems[0]?.ribItems[0]?.category).toBe('non-core');
  });

  it('rejects invalid rib category', () => {
    expect(() => validateProduct(minimal({
      themes: [{
        id: 't1', backboneItems: [{
          id: 'b1', ribItems: [{
            id: 'r1', category: 'injected',
            releaseAllocations: [], progressHistory: [],
          }],
        }],
      }],
    }))).toThrow('must be "core" or "non-core"');
  });

  // --- Release/sprint order clamping ---
  it('clamps release order to 0-10000', () => {
    const data = minimal({
      releases: [
        { id: 'r1', name: 'R1', order: -5 },
        { id: 'r2', name: 'R2', order: 99999 },
        { id: 'r3', name: 'R3', order: 3.7 },
      ],
    });
    const result = validateProduct(data);
    expect(result.releases[0]?.order).toBe(0);
    expect(result.releases[1]?.order).toBe(10000);
    expect(result.releases[2]?.order).toBe(3);
  });

  it('clamps sprint order to 0-10000', () => {
    const data = minimal({
      sprints: [
        { id: 's1', name: 'S1', order: -1 },
        { id: 's2', name: 'S2', order: 50000 },
      ],
    });
    const result = validateProduct(data);
    expect(result.sprints[0]?.order).toBe(0);
    expect(result.sprints[1]?.order).toBe(10000);
  });

  // --- Prototype key stripping from card orders ---
  // JSON.parse creates __proto__ as an own property (unlike object literals)
  it('strips dangerous keys from releaseCardOrder', () => {
    const cardOrder = JSON.parse('{"rel1":["id1"],"__proto__":["hack"],"constructor":["hack2"],"prototype":["hack3"]}');
    const data = minimal({ releaseCardOrder: cardOrder });
    const result = validateProduct(data);
    expect(result.releaseCardOrder?.['rel1']).toEqual(['id1']);
    expect(Object.prototype.hasOwnProperty.call(result.releaseCardOrder, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.releaseCardOrder, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.releaseCardOrder, 'prototype')).toBe(false);
  });

  it('strips dangerous keys from sizingCardOrder', () => {
    const cardOrder = JSON.parse('{"unsized":["id1"],"__proto__":["hack"],"constructor":["hack2"]}');
    const data = minimal({ sizingCardOrder: cardOrder });
    const result = validateProduct(data);
    expect(result.sizingCardOrder?.['unsized']).toEqual(['id1']);
    expect(Object.prototype.hasOwnProperty.call(result.sizingCardOrder, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.sizingCardOrder, 'constructor')).toBe(false);
  });

  // --- Per-entity unknown-field stripping (audit M2) ---
  it('strips unknown fields from theme', () => {
    const data = minimal({
      themes: [{ id: 't1', name: 'T1', backboneItems: [], junk: 'evil', tracking: 1 }],
    });
    const result = validateProduct(data);
    const theme = asRecord(req(result.themes[0], 'result.themes[0]'));
    expect(theme.id).toBe('t1');
    expect(Object.prototype.hasOwnProperty.call(theme, 'junk')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(theme, 'tracking')).toBe(false);
  });

  it('strips unknown fields from backbone', () => {
    const data = minimal({
      themes: [{
        id: 't1', name: 'T1',
        backboneItems: [{ id: 'b1', name: 'B1', ribItems: [], hidden: 'x' }],
      }],
    });
    const result = validateProduct(data);
    const bb = asRecord(req(result.themes[0]?.backboneItems[0], 'result.themes[0]?.backboneItems[0]'));
    expect(bb.id).toBe('b1');
    expect(Object.prototype.hasOwnProperty.call(bb, 'hidden')).toBe(false);
  });

  it('strips unknown fields from rib', () => {
    const data = minimal({
      themes: [{
        id: 't1', name: 'T1',
        backboneItems: [{
          id: 'b1', name: 'B1',
          ribItems: [{ id: 'r1', name: 'R1', tracker: 'evil', _injected: 1 }],
        }],
      }],
    });
    const result = validateProduct(data);
    const rib = asRecord(req(result.themes[0]?.backboneItems[0]?.ribItems[0], 'result.themes[0]?.backboneItems[0]?.ribItems[0]'));
    expect(rib.id).toBe('r1');
    expect(Object.prototype.hasOwnProperty.call(rib, 'tracker')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rib, '_injected')).toBe(false);
  });

  it('accepts known cardColor values on rib', () => {
    const data = minimal({
      themes: [{
        id: 't1', name: 'T1',
        backboneItems: [{
          id: 'b1', name: 'B1',
          ribItems: [{ id: 'r1', name: 'R1', cardColor: 'rose' }],
        }],
      }],
    });
    const result = validateProduct(data);
    const rib = asRecord(req(result.themes[0]?.backboneItems[0]?.ribItems[0], 'result.themes[0]?.backboneItems[0]?.ribItems[0]'));
    expect(rib.cardColor).toBe('rose');
  });

  it('clears unknown cardColor values on rib (non-destructive)', () => {
    const data = minimal({
      themes: [{
        id: 't1', name: 'T1',
        backboneItems: [{
          id: 'b1', name: 'B1',
          ribItems: [{ id: 'r1', name: 'R1', cardColor: 'fuchsia' }],
        }],
      }],
    });
    const result = validateProduct(data);
    const rib = asRecord(req(result.themes[0]?.backboneItems[0]?.ribItems[0], 'result.themes[0]?.backboneItems[0]?.ribItems[0]'));
    expect(Object.prototype.hasOwnProperty.call(rib, 'cardColor')).toBe(false);
    expect(rib.id).toBe('r1');
  });

  it('strips unknown fields from release', () => {
    const data = minimal({ releases: [{ id: 'r1', name: 'R1', evil: 'x' }] });
    const result = validateProduct(data);
    expect(Object.prototype.hasOwnProperty.call(result.releases[0], 'evil')).toBe(false);
  });

  it('strips unknown fields from sprint', () => {
    const data = minimal({ sprints: [{ id: 's1', name: 'S1', injected: true }] });
    const result = validateProduct(data);
    expect(Object.prototype.hasOwnProperty.call(result.sprints[0], 'injected')).toBe(false);
  });

  it('strips unknown fields from release allocation', () => {
    const data = minimal({
      releases: [{ id: 'r1', name: 'R1' }],
      themes: [{
        id: 't1', name: 'T1',
        backboneItems: [{
          id: 'b1', name: 'B1',
          ribItems: [{
            id: 'rib1', name: 'Rib1',
            releaseAllocations: [{ releaseId: 'r1', percentage: 50, evil: 'x' }],
          }],
        }],
      }],
    });
    const result = validateProduct(data);
    const alloc = asRecord(req(result.themes[0]?.backboneItems[0]?.ribItems[0]?.releaseAllocations[0], 'result.themes[0]?.backboneItems[0]?.ribItems[0]?.releaseAllocations[0]'));
    expect(Object.prototype.hasOwnProperty.call(alloc, 'evil')).toBe(false);
  });

  it('strips unknown fields from progress entry', () => {
    const data = minimal({
      sprints: [{ id: 's1', name: 'S1' }],
      releases: [{ id: 'r1', name: 'R1' }],
      themes: [{
        id: 't1', name: 'T1',
        backboneItems: [{
          id: 'b1', name: 'B1',
          ribItems: [{
            id: 'rib1', name: 'Rib1',
            progressHistory: [{ sprintId: 's1', releaseId: 'r1', percentComplete: 10, evil: 'x' }],
          }],
        }],
      }],
    });
    const result = validateProduct(data);
    const p = asRecord(req(result.themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory[0], 'result.themes[0]?.backboneItems[0]?.ribItems[0]?.progressHistory[0]'));
    expect(Object.prototype.hasOwnProperty.call(p, 'evil')).toBe(false);
  });

  it('strips unknown fields from sizeMapping entry', () => {
    const data = minimal({
      sizeMapping: [{ label: 'M', points: 3, evil: 'x' }],
    });
    const result = validateProduct(data);
    const sm = asRecord(req(result.sizeMapping[0], 'result.sizeMapping[0]'));
    expect(Object.prototype.hasOwnProperty.call(sm, 'evil')).toBe(false);
  });

  it('strips unknown fields and bounds string lengths on changelog entry (L4)', () => {
    const data = minimal({
      _changeLog: [{
        t: 1700000000,
        op: 'add',
        evil: 'x',
        source: 'a'.repeat(200),  // exceeds 128-char bound — should be dropped
      }],
    });
    const result = validateProduct(data);
    const entry = asRecord(req((result._changeLog ?? [])[0], '(result._changeLog ?? [])[0]'));
    expect(entry.op).toBe('add');
    expect(Object.prototype.hasOwnProperty.call(entry, 'evil')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(entry, 'source')).toBe(false);
  });

  // --- Per-entity prototype-pollution key rejection (audit M2) ---
  it('strips __proto__/constructor/prototype from theme object', () => {
    const theme = JSON.parse('{"id":"t1","name":"T1","backboneItems":[],"__proto__":{"polluted":true},"constructor":1,"prototype":"x"}');
    const result = validateProduct(minimal({ themes: [theme] }));
    const t = asRecord(req(result.themes[0], 'result.themes[0]'));
    expect(Object.prototype.hasOwnProperty.call(t, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(t, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(t, 'prototype')).toBe(false);
  });

  it('strips __proto__/constructor/prototype from rib object', () => {
    const rib = JSON.parse('{"id":"r1","name":"R1","__proto__":{"x":1},"constructor":"hack"}');
    const data = minimal({
      themes: [{
        id: 't1', name: 'T1',
        backboneItems: [{ id: 'b1', name: 'B1', ribItems: [rib] }],
      }],
    });
    const result = validateProduct(data);
    const r = asRecord(req(result.themes[0]?.backboneItems[0]?.ribItems[0], 'result.themes[0]?.backboneItems[0]?.ribItems[0]'));
    expect(Object.prototype.hasOwnProperty.call(r, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(r, 'constructor')).toBe(false);
  });

  it('strips __proto__ from release object', () => {
    const r = JSON.parse('{"id":"r1","name":"R1","__proto__":{"x":1}}');
    const result = validateProduct(minimal({ releases: [r] }));
    expect(Object.prototype.hasOwnProperty.call(result.releases[0], '__proto__')).toBe(false);
  });

  // --- Import error message sanitization ---
  it('gives generic error for malformed JSON on import', async () => {
    const { importProductFromJSON } = await import('../lib/importExport');
    expect(() => importProductFromJSON('{ bad json }')).toThrow('Invalid JSON file');
  });

  it('does not leak JSON content in error messages', async () => {
    const { importProductFromJSON } = await import('../lib/importExport');
    const secret = 'SENSITIVE_DATA_12345';
    try {
      importProductFromJSON(`{ "key": "${secret}" bad }`);
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
  });
});

// --- A rib's two lists ---

describe('validateProduct: a rib always comes out holding two lists', () => {
  const ALLOCATION = { releaseId: 'r1', percentage: 100 };
  const ENTRY = { sprintId: 's1', releaseId: 'r1', percentComplete: 50 };

  type ListField = 'releaseAllocations' | 'progressHistory';

  /** A parsed file with one list replaced. JSON drops `undefined`, so that value means the key is absent. */
  function fileWith(field: ListField, value: unknown) {
    return JSON.parse(JSON.stringify({
      id: 'p', name: 'P', schemaVersion: 2,
      sizeMapping: [{ label: 'M', points: 5 }],
      releases: [{ id: 'r1', name: 'R1', order: 1 }, { id: 'r2', name: 'R2', order: 2 }],
      sprints: [{ id: 's1', name: 'S1', order: 1 }],
      themes: [{ id: 't1', name: 'T', order: 1, backboneItems: [{ id: 'b1', name: 'B', order: 1, ribItems: [{
        id: 'k1', name: 'Rib', description: '', order: 1, size: 'M', category: 'core', notes: '',
        releaseAllocations: [ALLOCATION], progressHistory: [ENTRY], [field]: value,
      }] }] }],
    }));
  }

  const NOT_A_LIST: [string, unknown][] = [
    ['absent', undefined], ['null', null],
    ['an object', {}], ['an object holding a row', { 0: ENTRY }],
    ['a string', 'x'], ['an empty string', ''],
    ['a number', 5], ['zero', 0],
    ['true', true], ['false', false],
  ];
  const CASES = (['releaseAllocations', 'progressHistory'] as const).flatMap(field =>
    NOT_A_LIST.map(([label, value]) => [field, label, value] as const));

  beforeEach(stubLocalStorage);
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each(CASES)('%s as %s becomes an empty list and the other list is kept', (field, _label, value) => {
    const rib = ribOf(validateProduct(fileWith(field, value)));
    expect(rib.releaseAllocations).toEqual(field === 'releaseAllocations' ? [] : [ALLOCATION]);
    expect(rib.progressHistory).toEqual(field === 'progressHistory' ? [] : [ENTRY]);
  });

  it.each(CASES)('%s as %s reads the same as it does from the cloud', (field, _label, value) => {
    const cloud = fileWith(field, value);
    guardCloudProduct(cloud);
    const imported = ribOf(validateProduct(fileWith(field, value)));
    expect(imported.releaseAllocations).toEqual(ribOf(cloud).releaseAllocations);
    expect(imported.progressHistory).toEqual(ribOf(cloud).progressHistory);
  });

  // One reader per place the rib's lists threw. No single reader sees every shape:
  // isRibLocked is safe on a falsy value, and the map layout is safe on a bad history.
  it.each(CASES)('imported with %s as %s, the rib can be read and acted on', (field, _label, value) => {
    const product = importProductFromJSON(JSON.stringify(fileWith(field, value)));
    expect(() => isRibLocked(ribOf(product), product.sprints)).not.toThrow();
    expect(() => computeLayout(product, [])).not.toThrow();
    expect(() => deleteReleaseFromProduct(product, 'r2')).not.toThrow();
    expect(() => releaseHoldsRecords(product, 'r1')).not.toThrow();
    expect(() => duplicateProduct(product)).not.toThrow();
  });

  // Only the shapes the lock throws on: a falsy value applied all three ops before
  // the fix, so including it here would pass either way.
  it.each(CASES.filter(([, , value]) => value))('imported with %s as %s, a delivery of AI ops applies in full', (field, _label, value) => {
    const product = importProductFromJSON(JSON.stringify(fileWith(field, value)));
    const ops = [
      { seq: 1, op: 'append_rib_note', payload: { ribId: 'k1', text: 'first' } },
      { seq: 2, op: 'unassign_rib', payload: { ribId: 'k1' } },
      { seq: 3, op: 'append_rib_note', payload: { ribId: 'k1', text: 'last' } },
    ];
    const { safeOps, nextSeq } = computeSafePrefix(product, ops);
    expect(safeOps).toHaveLength(3);
    expect(nextSeq).toBe(3);
  });

  it('a v1 file with no usable allocations migrates as it did, with a real list', () => {
    const file = fileWith('releaseAllocations', {});
    delete file.schemaVersion;
    file.themes[0].backboneItems[0].ribItems[0].progressHistory = [{ sprintId: 's1', percentComplete: 50 }];
    const product = importProductFromJSON(JSON.stringify(file));
    expect(product.schemaVersion).toBe(2);
    expect(ribOf(product).releaseAllocations).toEqual([]);
    expect(ribOf(product).progressHistory).toEqual([]);
  });

  it('leaves the lists of a file the app exported exactly as they were', () => {
    const sample = createSampleProduct();
    const lists = (product: Pick<Product, 'themes'>) => product.themes.flatMap(t => t.backboneItems.flatMap(b =>
      b.ribItems.map(r => [r.id, r.releaseAllocations, r.progressHistory])));
    expect(lists(sample).flat(2).length).toBeGreaterThan(0);
    expect(lists(importProductFromJSON(JSON.stringify(sample)))).toEqual(lists(sample));
  });
});

// --- A product's three optional lists ---

describe('validateProduct: a product holds its three optional lists or leaves them out', () => {
  const FIELDS = ['releases', 'sprints', 'sizeMapping'] as const;
  type ListField = (typeof FIELDS)[number];

  const ALLOCATION = { releaseId: 'r1', percentage: 100 };
  const ENTRY = { sprintId: 's1', releaseId: 'r1', percentComplete: 50 };

  // M is 5 here and 20 in the default rows, so a default standing in for these shows.
  const LISTS = {
    releases: [{ id: 'r1', name: 'R1', order: 1 }, { id: 'r2', name: 'R2', order: 2 }],
    sprints: [{ id: 's1', name: 'S1', order: 1 }],
    sizeMapping: [{ label: 'M', points: 5 }],
  };

  /** A parsed file with one list replaced. JSON drops `undefined`, so that value means the key is absent. */
  function fileWith(field: ListField, value: unknown) {
    return JSON.parse(JSON.stringify({
      id: 'p', name: 'P', schemaVersion: 2, ...LISTS,
      themes: [{ id: 't1', name: 'T', order: 1, backboneItems: [{ id: 'b1', name: 'B', order: 1, ribItems: [{
        id: 'k1', name: 'Rib', description: '', order: 1, size: 'M', category: 'core', notes: '',
        releaseAllocations: [ALLOCATION], progressHistory: [ENTRY],
      }] }] }],
      [field]: value,
    }));
  }

  const imported = (field: ListField, value: unknown) =>
    importProductFromJSON(JSON.stringify(fileWith(field, value)));

  /** What the import backfill puts in place of a missing list. */
  const missing = (field: ListField) => field === 'sizeMapping' ? DEFAULT_SIZE_MAPPING : [];

  type Shape = readonly [label: string, value: unknown];
  const eachField = (shapes: (field: ListField) => Shape[]) =>
    FIELDS.flatMap(field => shapes(field).map(([label, value]) => [field, label, value] as const));

  // The truthy non-lists: the backfill passes over these, so they are what reached state.
  const bad = (field: ListField): Shape[] => [
    ['an object', {}], ['its own rows in an object', { ...LISTS[field] }],
    ['a string', 'x'], ['a number', 5], ['true', true],
  ];
  const BAD = eachField(bad);
  const FALSY: Shape[] = [['null', null], ['an empty string', ''], ['zero', 0], ['false', false]];
  const ABSENT: Shape = ['absent', undefined];

  beforeEach(stubLocalStorage);
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each(BAD)('%s as %s imports as a file that left it out, and the other two lists stay', (field, _label, value) => {
    const product = imported(field, value);
    expect(product[field]).toEqual(missing(field));
    for (const other of FIELDS.filter(f => f !== field)) expect(product[other]).toEqual(LISTS[other]);
  });

  // A `[]` here would pass every row above for two of the three lists. The key being gone
  // is what reaches the sizes default, and absent adding no key is what keeps the
  // validator observer quiet on a file that never had one.
  it.each(eachField(field => [ABSENT, ...FALSY, ...bad(field)]))('%s as %s leaves no key in the validated file', (field, _label, value) => {
    expect(Object.keys(validateProduct(fileWith(field, value)))).not.toContain(field);
  });

  it.each(eachField(() => [ABSENT, ...FALSY]))('%s as %s still imports as a file that left it out', (field, _label, value) => {
    expect(imported(field, value)[field]).toEqual(missing(field));
  });

  // Every reader that threw on one of these. No single reader sees every shape: the
  // totals never read `releases`, and the map layout passed on `releases: 'x'`.
  it.each(BAD)('imported with %s as %s, the project can be read', (field, _label, value) => {
    const product = imported(field, value);
    expect(() => getProjectTotals(product)).not.toThrow();
    expect(() => getProgressOverTime(product)).not.toThrow();
    expect(() => computeLayout(product, [])).not.toThrow();
    expect(() => isRibLocked(ribOf(product), product.sprints)).not.toThrow();
    expect(() => duplicateProduct(product)).not.toThrow();
    expect(() => getReconciliationRows(product)).not.toThrow();
    expect(() => getStrandedRows(product)).not.toThrow();
    expect(() => buildForecasterExport(product)).not.toThrow();
  });

  it.each(BAD)('imported with %s as %s, a delivery of AI ops applies in full', (field, _label, value) => {
    const ops = [
      { seq: 1, op: 'append_rib_note', payload: { ribId: 'k1', text: 'first' } },
      { seq: 2, op: 'size_rib', payload: { ribId: 'k1', size: 'L' } },
      { seq: 3, op: 'allocate_rib', payload: { ribId: 'k1', releaseId: 'r2' } },
      { seq: 4, op: 'create_release', payload: { releaseId: 'r3', name: 'R3' } },
      { seq: 5, op: 'unassign_rib', payload: { ribId: 'k1' } },
      { seq: 6, op: 'append_rib_note', payload: { ribId: 'k1', text: 'last' } },
    ];
    const { safeOps, nextSeq } = computeSafePrefix(imported(field, value), ops);
    expect(safeOps).toHaveLength(6);
    expect(nextSeq).toBe(6);
  });

  it.each(bad('sprints'))('sprints as %s reads as a file with no sprints: the records stay and lock nothing', (_label, value) => {
    const product = imported('sprints', value);
    expect(ribOf(product).progressHistory).toEqual([ENTRY]);
    expect(ribOf(product).releaseAllocations).toEqual([ALLOCATION]);
    expect(isRibLocked(ribOf(product), product.sprints)).toBe(false);
  });

  it.each(bad('releases'))('releases as %s keeps the rib, its records and its lock, on the Unknown lane', (_label, value) => {
    const product = imported('releases', value);
    expect(ribOf(product).progressHistory).toEqual([ENTRY]);
    expect(ribOf(product).releaseAllocations).toEqual([ALLOCATION]);
    expect(isRibLocked(ribOf(product), product.sprints)).toBe(true);
    expect(computeLayout(product, []).unknownLane).not.toBeNull();
  });

  it.each(bad('sizeMapping'))('sizeMapping as %s keeps the size, which the default rows then price', (_label, value) => {
    const product = imported('sizeMapping', value);
    expect(ribOf(product).size).toBe('M');
    expect(getRibItemPoints(ribOf(product), product.sizeMapping)).toBe(20);
  });

  it.each(BAD)('%s as %s reads the same as it does from the cloud', (field, _label, value) => {
    const cloud = fileWith(field, value);
    guardCloudProduct(cloud);
    expect(imported(field, value)[field]).toEqual(cloud[field]);
  });

  it('brings every list back from an Export All file that holds bad ones', () => {
    const bundle = BAD.map(([field, label, value]) => ({ ...fileWith(field, value), id: `${field}-${label}` }));
    const result = parseImportFile(JSON.stringify(bundle));
    if (!result.ok) throw new Error(result.error);
    expect(result.products).toHaveLength(BAD.length);
    for (const product of result.products) {
      for (const field of FIELDS) expect(Array.isArray(product[field])).toBe(true);
    }
  });

  it('keeps an empty list as a list: only a missing sizeMapping gets the default', () => {
    const product = imported('sizeMapping', []);
    expect(product.sizeMapping).toEqual([]);
    expect(imported('releases', []).releases).toEqual([]);
    expect(imported('sprints', []).sprints).toEqual([]);
  });

  it('leaves the lists of a file the app exported exactly as they were', () => {
    const sample = createSampleProduct();
    expect(sample.releases.length).toBeGreaterThan(0);
    expect(sample.sprints.length).toBeGreaterThan(0);
    expect(sample.sizeMapping.length).toBeGreaterThan(0);
    const product = importProductFromJSON(JSON.stringify(sample));
    for (const field of FIELDS) expect(product[field]).toEqual(sample[field]);
  });
});

// --- The product's other optional fields ---

describe('validateProduct: the optional fields hold their own shape or are cleared', () => {
  const ENTRY = { t: 1000, op: 'create', entity: 'product' };
  const CREATED = '2026-01-01T00:00:00.000Z';
  const UPDATED = '2026-01-02T00:00:00.000Z';

  /** A parsed file. JSON drops `undefined`, so that value means the key is absent. */
  function file(overrides: Record<string, unknown> = {}) {
    return JSON.parse(JSON.stringify({
      id: 'p', name: 'P', schemaVersion: 2,
      description: 'A project', createdAt: CREATED, updatedAt: UPDATED, _changeLog: [ENTRY],
      sizeMapping: [{ label: 'M', points: 5 }],
      releases: [{ id: 'r1', name: 'R1', order: 1 }, { id: 'r2', name: 'R2', order: 2 }],
      sprints: [{ id: 's1', name: 'S1', order: 1, endDate: '2026-02-01' }],
      themes: [{ id: 't1', name: 'T', order: 1, backboneItems: [{ id: 'b1', name: 'B', order: 1, ribItems: [{
        id: 'k1', name: 'Rib', description: '', order: 1, size: 'M', category: 'core', notes: '',
        releaseAllocations: [{ releaseId: 'r1', percentage: 100 }], progressHistory: [],
      }] }] }],
      ...overrides,
    }));
  }

  const imported = (overrides: Record<string, unknown>) => importProductFromJSON(JSON.stringify(file(overrides)));

  /** What an export of this project writes: `exportProduct` spreads it as it stands. */
  const exported = (product: Product) => JSON.stringify({ ...product, _storageRef: 'workspace' });

  /** Local storage serialises, and JSON gives an array's hole back as a null. */
  const reloaded = (product: Product): Product => JSON.parse(JSON.stringify(product));

  /** The rules `guardCloudProduct` fires on this project: each one raises the notice. */
  const guardHits = (product: Product) => guardCloudProduct(structuredClone(product));

  beforeEach(stubLocalStorage);
  afterEach(() => { vi.unstubAllGlobals(); });

  describe('_changeLog', () => {
    const ops = (product: Product) => (product._changeLog ?? []).map(e => e.op);
    const NON_LISTS = [['a string', 'x'], ['a longer string', 'abc'], ['a number', 5], ['true', true], ['an object', {}], ['a keyed object', { 0: ENTRY }]] as const;
    const NON_ENTRIES = [['a string', 'x'], ['null', null], ['a number', 5], ['a list', []]] as const;

    it.each(NON_LISTS)('as %s imports as a file with no log', (_label, value) => {
      expect(ops(imported({ _changeLog: value }))).toEqual(['import']);
    });

    it.each(NON_LISTS)('as %s gives a file that imports again', (_label, value) => {
      const again = importProductFromJSON(exported(imported({ _changeLog: value })));
      expect(ops(again)).toEqual(['import', 'import']);
    });

    it.each(NON_LISTS)('as %s raises no cloud notice', (_label, value) => {
      expect(guardHits(imported({ _changeLog: value }))).toEqual([]);
    });

    // What an older import left in local stores, so it is in a file the app wrote.
    it.each(NON_ENTRIES)('holding %s beside real entries drops it and keeps them', (_label, value) => {
      expect(ops(imported({ _changeLog: [value, ENTRY] }))).toEqual(['create', 'import']);
    });

    it.each([['null', null], ['an empty string', ''], ['zero', 0], ['false', false]])('as %s still imports as a file with no log', (_label, value) => {
      expect(ops(imported({ _changeLog: value }))).toEqual(['import']);
    });

    it('still refuses an entry with no timestamp, because an entry is held to its shape', () => {
      expect(() => imported({ _changeLog: [{ op: 'add' }] })).toThrow('timestamp');
    });
  });

  describe('description', () => {
    const NON_TEXT = [['null', null], ['zero', 0], ['false', false], ['a number', 5], ['true', true], ['an object', {}], ['an empty list', []], ['a list', ['a']]] as const;

    it.each(NON_TEXT)('as %s becomes empty', (_label, value) => {
      expect(imported({ description: value }).description).toBe('');
    });

    // Not null: the cloud guard takes that to '' without a notice.
    it.each(NON_TEXT.slice(1))('as %s raises no cloud notice', (_label, value) => {
      expect(guardHits(imported({ description: value }))).toEqual([]);
    });

    it.each(NON_TEXT)('as %s reads the same as it does from the cloud', (_label, value) => {
      const cloud = file({ description: value });
      guardCloudProduct(cloud);
      expect(imported({ description: value }).description).toBe(cloud.description);
    });

    it.each(['Some text', ''])('%j stays as it is', value => {
      expect(imported({ description: value }).description).toBe(value);
    });
  });

  describe('createdAt and updatedAt', () => {
    const FIELDS = ['createdAt', 'updatedAt'] as const;
    const NON_TEXT = [['null', null], ['zero', 0], ['false', false], ['a number', 5], ['true', true], ['an object', {}], ['an empty list', []], ['a list', ['a']]] as const;
    const EACH = FIELDS.flatMap(field => NON_TEXT.map(([label, value]) => [field, label, value] as const));

    it.each(EACH)('%s as %s is removed', (field, _label, value) => {
      expect(imported({ [field]: value })).not.toHaveProperty(field);
    });

    // Not null, zero or false: the export replaces those with the time of the export.
    it.each(EACH.filter(([, , value]) => value))('%s as %s goes to Forecaster as a date on every record', (field, _label, value) => {
      const { projects, sprints } = buildForecasterExport(imported({ [field]: value }));
      expect(typeof projects[0]?.[field]).toBe('string');
      expect(typeof sprints[0]?.[field]).toBe('string');
    });

    // Not null: the cloud guard drops that without a notice.
    it.each(NON_TEXT.slice(1))('createdAt as %s raises no cloud notice', (_label, value) => {
      expect(guardHits(imported({ createdAt: value }))).toEqual([]);
    });

    it.each(NON_TEXT)('createdAt as %s reads the same as it does from the cloud', (_label, value) => {
      const cloud = file({ createdAt: value });
      guardCloudProduct(cloud);
      expect(imported({ createdAt: value })).not.toHaveProperty('createdAt');
      expect(cloud).not.toHaveProperty('createdAt');
    });

    it('leaves real dates alone', () => {
      const product = imported({});
      expect(product.createdAt).toBe(CREATED);
      expect(product.updatedAt).toBe(UPDATED);
    });

    it('leaves a date string it cannot read alone: this is a shape check', () => {
      expect(imported({ createdAt: 'soon' }).createdAt).toBe('soon');
    });
  });

  describe('releaseCardOrder and sizingCardOrder', () => {
    const FIELDS = ['releaseCardOrder', 'sizingCardOrder'] as const;
    const NON_MAPS = [
      ['a string', 'x'], ['a number', 5], ['true', true], ['null', null], ['an empty string', ''], ['zero', 0], ['false', false],
      ['an empty list', []], ['a list of strings', ['x']], ['a list of lists', [['k1']]],
    ] as const;
    const EACH = FIELDS.flatMap(field => NON_MAPS.map(([label, value]) => [field, label, value] as const));
    const KEPT = { r1: ['k1'] };

    // The two shapes that break a reader. The rest throw nowhere: they only raise the notice.
    const BREAKS = [['a string', 'x'], ['a list of strings', ['x']]] as const;

    it.each(EACH)('%s as %s is removed', (field, _label, value) => {
      expect(imported({ [field]: value })).not.toHaveProperty(field);
    });

    it.each(EACH)('%s as %s raises no cloud notice', (field, _label, value) => {
      expect(guardHits(imported({ [field]: value }))).toEqual([]);
    });

    // A list only breaks after storage has turned its hole into a null, so every row
    // reads the project as a reload gives it.
    it.each(FIELDS.flatMap(field => BREAKS.map(([label, value]) => [field, label, value] as const)))('with %s as %s, ribs can be deleted and the project duplicated', (field, _label, value) => {
      const product = reloaded(imported({ [field]: value }));
      expect(() => cleanCardOrder(product[field], new Set(['k1']))).not.toThrow();
      expect(() => duplicateProduct(product)).not.toThrow();
    });

    it.each(BREAKS)('with releaseCardOrder as %s, the AI can move and unassign a rib', (_label, value) => {
      const product = reloaded(imported({ releaseCardOrder: value }));
      expect(applyAiOp(product, 'move_rib', { ribId: 'k1', targetReleaseId: 'r2' })).not.toBe(product);
      expect(applyAiOp(product, 'unassign_rib', { ribId: 'k1' })).not.toBe(product);
    });

    it.each(FIELDS)('%s keeps a map, and only the lists in it', field => {
      expect(imported({ [field]: KEPT })[field]).toEqual(KEPT);
      expect(imported({ [field]: { ...KEPT, r2: 'x', r3: 5 } })[field]).toEqual(KEPT);
    });
  });

  it('adds no key to a file that left all of these out', () => {
    const data = file();
    const fields = ['description', 'createdAt', 'updatedAt', '_changeLog', 'releaseCardOrder', 'sizingCardOrder'];
    for (const field of fields) delete data[field];
    const keys = Object.keys(validateProduct(data));
    for (const field of fields) expect(keys).not.toContain(field);
  });

  it('brings back an Export All file holding every one of these at once', () => {
    const bad = { description: {}, createdAt: {}, updatedAt: {}, _changeLog: 'x', releaseCardOrder: 'x', sizingCardOrder: 'x' };
    const result = parseImportFile(JSON.stringify([{ ...file(bad), id: 'one' }, { ...file(bad), id: 'two' }]));
    if (!result.ok) throw new Error(result.error);
    expect(result.products.map(p => p.id)).toEqual(['one', 'two']);
    for (const product of result.products) expect(guardHits(product)).toEqual([]);
  });

  it('leaves these fields of a file the app exported exactly as they were', () => {
    const sample = { ...createSampleProduct(), releaseCardOrder: { r1: ['k1'] }, sizingCardOrder: { M: ['k1'] } };
    const product = importProductFromJSON(exported(sample));
    expect(product.description).toBe(sample.description);
    expect(product.createdAt).toBe(sample.createdAt);
    expect(product.updatedAt).toBe(sample.updatedAt);
    expect(product.releaseCardOrder).toEqual(sample.releaseCardOrder);
    expect(product.sizingCardOrder).toEqual(sample.sizingCardOrder);
    expect(product._changeLog?.slice(0, -1)).toEqual(sample._changeLog);
  });
});
