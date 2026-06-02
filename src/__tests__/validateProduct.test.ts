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
    expect(result.cardColorLabels.violet.length).toBe(80);
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
    expect(result.themes[0].backboneItems[0].ribItems[0].cardColor).toBe('orange');
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

  // --- Per-entity unknown-field stripping (audit M2) ---
  it('strips unknown fields from theme', () => {
    const data = minimal({
      themes: [{ id: 't1', name: 'T1', backboneItems: [], junk: 'evil', tracking: 1 }],
    });
    const result = validateProduct(data);
    const theme = result.themes[0] as Record<string, unknown>;
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
    const bb = result.themes[0].backboneItems[0] as Record<string, unknown>;
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
    const rib = result.themes[0].backboneItems[0].ribItems[0] as Record<string, unknown>;
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
    const rib = result.themes[0].backboneItems[0].ribItems[0] as Record<string, unknown>;
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
    const rib = result.themes[0].backboneItems[0].ribItems[0] as Record<string, unknown>;
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
    const alloc = result.themes[0].backboneItems[0].ribItems[0].releaseAllocations[0] as Record<string, unknown>;
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
    const p = result.themes[0].backboneItems[0].ribItems[0].progressHistory[0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(p, 'evil')).toBe(false);
  });

  it('strips unknown fields from sizeMapping entry', () => {
    const data = minimal({
      sizeMapping: [{ label: 'M', points: 3, evil: 'x' }],
    });
    const result = validateProduct(data);
    const sm = result.sizeMapping[0] as Record<string, unknown>;
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
    const entry = (result._changeLog ?? [])[0] as Record<string, unknown>;
    expect(entry.op).toBe('add');
    expect(Object.prototype.hasOwnProperty.call(entry, 'evil')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(entry, 'source')).toBe(false);
  });

  // --- Per-entity prototype-pollution key rejection (audit M2) ---
  it('strips __proto__/constructor/prototype from theme object', () => {
    const theme = JSON.parse('{"id":"t1","name":"T1","backboneItems":[],"__proto__":{"polluted":true},"constructor":1,"prototype":"x"}');
    const result = validateProduct(minimal({ themes: [theme] }));
    const t = result.themes[0] as Record<string, unknown>;
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
    const r = result.themes[0].backboneItems[0].ribItems[0] as Record<string, unknown>;
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
      expect(e.message).not.toContain(secret);
    }
  });
});
