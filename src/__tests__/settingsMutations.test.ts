// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { deleteReleaseFromProduct, deleteSprintFromProduct, releaseHasAllocations } from '../lib/settingsMutations';
import { req } from './testHelpers';
import type { Product } from '../types';

// Annotated `Product`: the deletion helpers under test take a full Product, and
// the omitted scalars (descriptions, orders, sizes, dates) play no part in what
// they do — release/sprint removal, card-order cleanup, progress pruning.
function makeProduct(): Product {
  return {
    id: 'p1',
    name: 'Test Product',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 2,
    sprintCadenceWeeks: 2,
    sizeMapping: [{ label: 'M', points: 3 }],
    releases: [
      { id: 'rel-1', name: 'Release 1', description: '', order: 1, targetDate: null },
      { id: 'rel-2', name: 'Release 2', description: '', order: 2, targetDate: null },
      { id: 'rel-3', name: 'Release 3', description: '', order: 3, targetDate: null },
    ],
    sprints: [
      { id: 'sp-1', name: 'Sprint 1', order: 1, endDate: null },
      { id: 'sp-2', name: 'Sprint 2', order: 2, endDate: null },
    ],
    releaseCardOrder: {
      'rel-1': ['rib-1', 'rib-2'],
      'rel-2': ['rib-3'],
      'unassigned': ['rib-4'],
    },
    themes: [{
      id: 't1', name: 'Theme', order: 1,
      backboneItems: [{
        id: 'b1', name: 'Backbone', description: '', order: 1,
        ribItems: [
          {
            id: 'rib-1', name: 'Rib 1', description: '', order: 1, size: 'M', category: 'core',
            releaseAllocations: [{ releaseId: 'rel-1', percentage: 60 }, { releaseId: 'rel-2', percentage: 40 }],
            progressHistory: [
              { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 30 },
              { sprintId: 'sp-1', releaseId: 'rel-2', percentComplete: 20 },
              { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 50 },
            ],
          },
          {
            id: 'rib-2', name: 'Rib 2', description: '', order: 2, size: 'M', category: 'core',
            releaseAllocations: [{ releaseId: 'rel-1', percentage: 100 }],
            progressHistory: [
              { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 100 },
            ],
          },
          {
            id: 'rib-3', name: 'Rib 3', description: '', order: 3, size: 'M', category: 'core',
            releaseAllocations: [{ releaseId: 'rel-2', percentage: 100 }],
            progressHistory: [
              { sprintId: 'sp-2', releaseId: 'rel-2', percentComplete: 50 },
            ],
          },
          {
            id: 'rib-4', name: 'Rib 4', description: '', order: 4, size: null, category: 'core',
            releaseAllocations: [],
            progressHistory: [],
          },
        ],
      }],
    }],
  };
}

describe('releaseHasAllocations', () => {
  it('returns true when ribs reference the release', () => {
    expect(releaseHasAllocations(makeProduct(), 'rel-1')).toBe(true);
  });

  it('returns false when no ribs reference the release', () => {
    expect(releaseHasAllocations(makeProduct(), 'rel-3')).toBe(false);
  });

  it('returns false for non-existent release', () => {
    expect(releaseHasAllocations(makeProduct(), 'nope')).toBe(false);
  });
});

describe('deleteReleaseFromProduct', () => {
  it('removes the release and re-indexes order', () => {
    const result = deleteReleaseFromProduct(makeProduct(), 'rel-2');
    expect(result.releases).toEqual([
      { id: 'rel-1', name: 'Release 1', description: '', order: 1, targetDate: null },
      { id: 'rel-3', name: 'Release 3', description: '', order: 2, targetDate: null },
    ]);
  });

  it('removes the release column from releaseCardOrder', () => {
    const result = deleteReleaseFromProduct(makeProduct(), 'rel-2');
    expect(result.releaseCardOrder).toEqual({
      'rel-1': ['rib-1', 'rib-2'],
      'unassigned': ['rib-4'],
    });
  });

  it('removes matching allocations from all ribs', () => {
    const result = deleteReleaseFromProduct(makeProduct(), 'rel-1');
    const ribs = req(result.themes[0]?.backboneItems[0]?.ribItems, 'ribs');
    // rib-1 had rel-1 + rel-2 allocations; rel-1 removed
    expect(ribs[0]?.releaseAllocations).toEqual([{ releaseId: 'rel-2', percentage: 40 }]);
    // rib-2 had only rel-1 allocation; now empty
    expect(ribs[1]?.releaseAllocations).toEqual([]);
    // rib-3 unaffected (only rel-2)
    expect(ribs[2]?.releaseAllocations).toEqual([{ releaseId: 'rel-2', percentage: 100 }]);
  });

  it('removes matching progressHistory entries', () => {
    const result = deleteReleaseFromProduct(makeProduct(), 'rel-1');
    const ribs = req(result.themes[0]?.backboneItems[0]?.ribItems, 'ribs');
    // rib-1: had 3 entries, 2 for rel-1 removed
    expect(ribs[0]?.progressHistory).toEqual([
      { sprintId: 'sp-1', releaseId: 'rel-2', percentComplete: 20 },
    ]);
    // rib-2: had 1 entry for rel-1, now empty
    expect(ribs[1]?.progressHistory).toEqual([]);
  });

  it('does not mutate the original product', () => {
    const original = makeProduct();
    const originalJSON = JSON.stringify(original);
    deleteReleaseFromProduct(original, 'rel-1');
    expect(JSON.stringify(original)).toBe(originalJSON);
  });

  it('handles product with no releaseCardOrder', () => {
    const p = makeProduct();
    delete p.releaseCardOrder;
    const result = deleteReleaseFromProduct(p, 'rel-1');
    expect(result.releaseCardOrder).toEqual({});
  });
});

describe('deleteSprintFromProduct', () => {
  it('removes the sprint and re-indexes order', () => {
    const result = deleteSprintFromProduct(makeProduct(), 'sp-1');
    expect(result.sprints).toEqual([
      { id: 'sp-2', name: 'Sprint 2', order: 1, endDate: null },
    ]);
  });

  it('removes matching progressHistory entries', () => {
    const result = deleteSprintFromProduct(makeProduct(), 'sp-1');
    const ribs = req(result.themes[0]?.backboneItems[0]?.ribItems, 'ribs');
    // rib-1: had 3 entries, 2 for sp-1 removed
    expect(ribs[0]?.progressHistory).toEqual([
      { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 50 },
    ]);
    // rib-2: had 1 entry for sp-1, now empty
    expect(ribs[1]?.progressHistory).toEqual([]);
    // rib-3: had 1 entry for sp-2, unaffected
    expect(ribs[2]?.progressHistory).toEqual([
      { sprintId: 'sp-2', releaseId: 'rel-2', percentComplete: 50 },
    ]);
  });

  it('does not mutate the original product', () => {
    const original = makeProduct();
    const originalJSON = JSON.stringify(original);
    deleteSprintFromProduct(original, 'sp-1');
    expect(JSON.stringify(original)).toBe(originalJSON);
  });
});
