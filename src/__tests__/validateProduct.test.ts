// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { validateProduct } from '../lib/validateProduct';

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
    expect(result.releases[0].id).toBe('r1');
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
    expect(result.sprints[0].id).toBe('s1');
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
    expect(result.themes[0].backboneItems[0].ribItems[0].id).toBe('r1');
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
    const allocs = result.themes[0].backboneItems[0].ribItems[0].releaseAllocations;
    expect(allocs[0].percentage).toBe(100);
    expect(allocs[1].percentage).toBe(0);
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
    const progress = result.themes[0].backboneItems[0].ribItems[0].progressHistory;
    expect(progress[0].percentComplete).toBe(100);
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
    expect(result.themes[0].backboneItems[0].ribItems[0].size).toBe('');
  });

  // --- Unknown field stripping ---
  it('strips unknown top-level fields', () => {
    const data = minimal({ _malicious: 'payload', injected: true });
    const result = validateProduct(data);
    expect(result._malicious).toBeUndefined();
    expect(result.injected).toBeUndefined();
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
    expect(result.releaseCardOrder['rel1']).toEqual(['id1', 'id2']);
    expect(result.releaseCardOrder['bad']).toBeUndefined();
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
    expect(result.themes[0].backboneItems[0].ribItems[0].category).toBe('core');
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
    expect(result.themes[0].backboneItems[0].ribItems[0].category).toBe('non-core');
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
    expect(result.releases[0].order).toBe(0);
    expect(result.releases[1].order).toBe(10000);
    expect(result.releases[2].order).toBe(3);
  });

  it('clamps sprint order to 0-10000', () => {
    const data = minimal({
      sprints: [
        { id: 's1', name: 'S1', order: -1 },
        { id: 's2', name: 'S2', order: 50000 },
      ],
    });
    const result = validateProduct(data);
    expect(result.sprints[0].order).toBe(0);
    expect(result.sprints[1].order).toBe(10000);
  });

  // --- Prototype key stripping from card orders ---
  // JSON.parse creates __proto__ as an own property (unlike object literals)
  it('strips dangerous keys from releaseCardOrder', () => {
    const cardOrder = JSON.parse('{"rel1":["id1"],"__proto__":["hack"],"constructor":["hack2"],"prototype":["hack3"]}');
    const data = minimal({ releaseCardOrder: cardOrder });
    const result = validateProduct(data);
    expect(result.releaseCardOrder['rel1']).toEqual(['id1']);
    expect(Object.prototype.hasOwnProperty.call(result.releaseCardOrder, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.releaseCardOrder, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.releaseCardOrder, 'prototype')).toBe(false);
  });

  it('strips dangerous keys from sizingCardOrder', () => {
    const cardOrder = JSON.parse('{"unsized":["id1"],"__proto__":["hack"],"constructor":["hack2"]}');
    const data = minimal({ sizingCardOrder: cardOrder });
    const result = validateProduct(data);
    expect(result.sizingCardOrder['unsized']).toEqual(['id1']);
    expect(Object.prototype.hasOwnProperty.call(result.sizingCardOrder, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.sizingCardOrder, 'constructor')).toBe(false);
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
      expect(e.message).not.toContain(secret);
    }
  });
});
