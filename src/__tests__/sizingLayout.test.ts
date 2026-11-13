// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { computeSizingLayout, CELL_HEIGHT, CELL_GAP, DEFAULT_SIZING_FILTER } from '../components/sizing/useSizingLayout';
import type { SizingFilter } from '../components/sizing/useSizingLayout';
import type { Product, Size } from '../types';
import { req } from './testHelpers';

interface RibInput {
  id: string;
  name?: string;
  // The Size union, not a loose string: every size these fixtures use is a
  // real Size member ('S' | 'M' | 'L'). Orphan-size behaviour is exercised by
  // varying sizeMapping, not by passing a size outside the union.
  size?: Size;
  progressHistory?: Array<{ sprintId: string; releaseId: string; percentComplete: number }>;
}

interface ThemeInput {
  id: string;
  name: string;
  backbones: Array<{
    id: string;
    name: string;
    ribs: RibInput[];
  }>;
}

/** A rib holding progress is on that release: a record elsewhere neither counts nor locks. */
const allocatedTo = (r: RibInput) =>
  [...new Set((r.progressHistory ?? []).map(p => p.releaseId))].map(releaseId => ({ releaseId, percentage: 100 }));

/** Minimal product builder for sizing tests */
function makeProduct({ ribs = [], sizeMapping = null, sizingCardOrder = {}, themes = null }: {
  ribs?: RibInput[];
  sizeMapping?: Array<{ label: string; points: number }> | null;
  sizingCardOrder?: Record<string, string[]>;
  themes?: ThemeInput[] | null;
} = {}): Product {
  const defaultMapping = [
    { label: 'S', points: 1 },
    { label: 'M', points: 3 },
    { label: 'L', points: 5 },
  ];

  const buildThemes = themes
    ? themes.map(t => ({
        id: t.id,
        name: t.name,
        order: 1,
        backboneItems: t.backbones.map(b => ({
          id: b.id,
          name: b.name,
          order: 1,
          ribItems: b.ribs.map(r => ({
            id: r.id,
            name: r.name || r.id,
            description: '',
            order: 1,
            size: r.size || null,
            category: 'core' as const,
            releaseAllocations: allocatedTo(r),
            progressHistory: r.progressHistory || [],
          })),
        })),
      }))
    : [{
        id: 't1',
        name: 'Theme 1',
        order: 1,
        backboneItems: [{
          id: 'b1',
          name: 'Backbone 1',
          order: 1,
          ribItems: ribs.map(r => ({
            id: r.id,
            name: r.name || r.id,
            description: '',
            order: 1,
            size: r.size || null,
            category: 'core' as const,
            releaseAllocations: allocatedTo(r),
            progressHistory: r.progressHistory || [],
          })),
        }],
      }];

  return {
    id: 'p1',
    name: 'Test Product',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 2,
    releases: [],
    sprints: [{ id: 's1', name: 'S1', order: 1, endDate: null }],
    themes: buildThemes,
    sizeMapping: sizeMapping ?? defaultMapping,
    sizingCardOrder,
  };
}

describe('computeSizingLayout sorting by sizingCardOrder', () => {
  it('places unsized ribs in default order when no sizingCardOrder', () => {
    const product = makeProduct({
      ribs: [
        { id: 'r1', name: 'First' },
        { id: 'r2', name: 'Second' },
        { id: 'r3', name: 'Third' },
      ],
    });
    const layout = computeSizingLayout(product);
    const unsized = layout.cells.filter(c => c.sizeLabel === null);
    expect(unsized.map(c => c.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('sorts unsized ribs by sizingCardOrder', () => {
    const product = makeProduct({
      ribs: [
        { id: 'r1', name: 'First' },
        { id: 'r2', name: 'Second' },
        { id: 'r3', name: 'Third' },
      ],
      sizingCardOrder: { unsized: ['r3', 'r1', 'r2'] },
    });
    const layout = computeSizingLayout(product);
    const unsized = layout.cells.filter(c => c.sizeLabel === null);
    expect(unsized.map(c => c.id)).toEqual(['r3', 'r1', 'r2']);
  });

  it('sorts sized ribs by sizingCardOrder', () => {
    const product = makeProduct({
      ribs: [
        { id: 'r1', name: 'A', size: 'M' },
        { id: 'r2', name: 'B', size: 'M' },
        { id: 'r3', name: 'C', size: 'M' },
      ],
      sizingCardOrder: { M: ['r3', 'r2', 'r1'] },
    });
    const layout = computeSizingLayout(product);
    const mCells = layout.cells.filter(c => c.sizeLabel === 'M');
    expect(mCells.map(c => c.id)).toEqual(['r3', 'r2', 'r1']);
    // Verify Y positions are ascending (first in order = top)
    expect(req(mCells[0], 'mCells[0]').y).toBeLessThan(req(mCells[1], 'mCells[1]').y);
    expect(req(mCells[1], 'mCells[1]').y).toBeLessThan(req(mCells[2], 'mCells[2]').y);
  });

  it('falls back to default order for ribs not in sizingCardOrder', () => {
    const product = makeProduct({
      ribs: [
        { id: 'r1', name: 'A', size: 'S' },
        { id: 'r2', name: 'B', size: 'S' },
        { id: 'r3', name: 'C', size: 'S' },
      ],
      sizingCardOrder: { S: ['r2'] }, // only r2 listed; r1, r3 get Infinity
    });
    const layout = computeSizingLayout(product);
    const sCells = layout.cells.filter(c => c.sizeLabel === 'S');
    // r2 has position 0, r1 and r3 have Infinity (stable order: r1 before r3)
    expect(sCells[0]?.id).toBe('r2');
  });

  it('handles empty sizingCardOrder gracefully', () => {
    const product = makeProduct({
      ribs: [
        { id: 'r1', size: 'M' },
        { id: 'r2', size: 'L' },
        { id: 'r3' },
      ],
      sizingCardOrder: {},
    });
    const layout = computeSizingLayout(product);
    expect(layout.cells).toHaveLength(3);
  });
});

describe('computeSizingLayout cell positions', () => {
  it('places sized cells vertically in order', () => {
    const product = makeProduct({
      ribs: [
        { id: 'r1', size: 'M' },
        { id: 'r2', size: 'M' },
      ],
    });
    const layout = computeSizingLayout(product);
    const mCells = layout.cells.filter(c => c.sizeLabel === 'M').sort((a, b) => a.y - b.y);
    expect(mCells).toHaveLength(2);
    // Second cell should be exactly CELL_HEIGHT + CELL_GAP below first
    expect(req(mCells[1], 'mCells[1]').y - req(mCells[0], 'mCells[0]').y).toBe(CELL_HEIGHT + CELL_GAP);
  });

  it('places unsized cells in grid positions', () => {
    const product = makeProduct({
      ribs: [
        { id: 'r1' },
        { id: 'r2' },
      ],
    });
    const layout = computeSizingLayout(product);
    const unsized = layout.cells.filter(c => c.sizeLabel === null);
    expect(unsized).toHaveLength(2);
    // Both should be on the first row (y is the same if grid has enough cols)
    if (layout.unsizedGridCols >= 2) {
      expect(unsized[0]?.y).toBe(unsized[1]?.y);
      expect(req(unsized[1], 'unsized[1]').x).toBeGreaterThan(req(unsized[0], 'unsized[0]').x);
    }
  });
});

describe('computeSizingLayout filtering', () => {
  const twoThemeProduct = () => makeProduct({
    themes: [
      { id: 't1', name: 'Theme 1', backbones: [
        { id: 'b1', name: 'Backbone 1', ribs: [
          { id: 'r1', name: 'Rib 1' },
          { id: 'r2', name: 'Rib 2' },
        ] },
      ] },
      { id: 't2', name: 'Theme 2', backbones: [
        { id: 'b2', name: 'Backbone 2', ribs: [
          { id: 'r3', name: 'Rib 3' },
          { id: 'r4', name: 'Rib 4' },
        ] },
      ] },
    ],
  });

  it('themeIds [] shows all ribs (default behavior)', () => {
    const filter: SizingFilter = { themeIds: [], releaseIds: [], hideLocked: false };
    const layout = computeSizingLayout(twoThemeProduct(), filter);
    expect(layout.cells).toHaveLength(4);
  });

  it('themeIds filters to single theme', () => {
    const product = makeProduct({
      themes: [
        { id: 't1', name: 'Theme 1', backbones: [
          { id: 'b1', name: 'Backbone 1', ribs: [
            { id: 'r1', name: 'Rib 1' },
            { id: 'r2', name: 'Rib 2' },
          ] },
        ] },
        { id: 't2', name: 'Theme 2', backbones: [
          { id: 'b2', name: 'Backbone 2', ribs: [
            { id: 'r3', name: 'Rib 3' },
          ] },
        ] },
      ],
    });
    const filter: SizingFilter = { themeIds: ['t1'], releaseIds: [], hideLocked: false };
    const layout = computeSizingLayout(product, filter);
    expect(layout.cells).toHaveLength(2);
    expect(layout.cells.every(c => c.themeId === 't1')).toBe(true);
  });

  it('themeIds filters to multiple themes', () => {
    const product = makeProduct({
      themes: [
        { id: 't1', name: 'Theme 1', backbones: [
          { id: 'b1', name: 'B1', ribs: [{ id: 'r1' }] },
        ] },
        { id: 't2', name: 'Theme 2', backbones: [
          { id: 'b2', name: 'B2', ribs: [{ id: 'r2' }] },
        ] },
        { id: 't3', name: 'Theme 3', backbones: [
          { id: 'b3', name: 'B3', ribs: [{ id: 'r3' }] },
        ] },
      ],
    });
    const filter: SizingFilter = { themeIds: ['t1', 't3'], releaseIds: [], hideLocked: false };
    const layout = computeSizingLayout(product, filter);
    expect(layout.cells).toHaveLength(2);
    expect(layout.cells.some(c => c.themeId === 't2')).toBe(false);
  });

  it('themeIds with non-existent ID shows no ribs from that ID', () => {
    const product = makeProduct({
      themes: [
        { id: 't1', name: 'Theme 1', backbones: [
          { id: 'b1', name: 'B1', ribs: [{ id: 'r1' }, { id: 'r2' }] },
        ] },
      ],
    });
    const filter: SizingFilter = { themeIds: ['nonexistent'], releaseIds: [], hideLocked: false };
    const layout = computeSizingLayout(product, filter);
    expect(layout.cells).toHaveLength(0);
  });

  it('hideLocked true excludes ribs with progress', () => {
    const product = makeProduct({
      themes: [
        { id: 't1', name: 'Theme 1', backbones: [
          { id: 'b1', name: 'B1', ribs: [
            { id: 'r1', name: 'No progress' },
            { id: 'r2', name: 'Has progress', progressHistory: [
              { sprintId: 's1', releaseId: 'rel1', percentComplete: 50 },
            ] },
            { id: 'r3', name: 'Also no progress' },
          ] },
        ] },
      ],
    });
    const filter: SizingFilter = { themeIds: [], releaseIds: [], hideLocked: true };
    const layout = computeSizingLayout(product, filter);
    expect(layout.cells).toHaveLength(2);
    expect(layout.cells.map(c => c.id)).toEqual(['r1', 'r3']);
  });

  it('hideLocked false includes all ribs', () => {
    const product = makeProduct({
      themes: [
        { id: 't1', name: 'Theme 1', backbones: [
          { id: 'b1', name: 'B1', ribs: [
            { id: 'r1', name: 'No progress' },
            { id: 'r2', name: 'Has progress', progressHistory: [
              { sprintId: 's1', releaseId: 'rel1', percentComplete: 50 },
            ] },
            { id: 'r3', name: 'Also no progress' },
          ] },
        ] },
      ],
    });
    const filter: SizingFilter = { themeIds: [], releaseIds: [], hideLocked: false };
    const layout = computeSizingLayout(product, filter);
    expect(layout.cells).toHaveLength(3);
  });

  describe('the lock', () => {
    const SPRINTS = [{ id: 's1', name: 'S1', order: 1, endDate: null }, { id: 's2', name: 'S2', order: 2, endDate: null }];
    const cell = (rib: RibInput, filter = DEFAULT_SIZING_FILTER) => {
      const product = { ...makeProduct({ ribs: [rib] }), sprints: SPRINTS };
      return computeSizingLayout(product, filter).cells[0];
    };

    it('holds for progress in an earlier sprint even if the latest reads 0', () => {
      const found = cell({ id: 'r', progressHistory: [
        { sprintId: 's1', releaseId: 'rel1', percentComplete: 10 },
        { sprintId: 's2', releaseId: 'rel1', percentComplete: 0 },
      ] });
      expect(found?.locked).toBe(true);
      expect(found?.percentComplete).toBe(0);
    });

    it('releases a rib whose only progress is on a release it left', () => {
      const product = { ...makeProduct({ ribs: [{ id: 'r' }] }), sprints: SPRINTS };
      const rib = req(product.themes[0]?.backboneItems[0]?.ribItems[0], 'rib');
      rib.releaseAllocations = [{ releaseId: 'rel2', percentage: 100 }];
      rib.progressHistory = [{ sprintId: 's1', releaseId: 'rel1', percentComplete: 50 }];
      const found = computeSizingLayout(product, DEFAULT_SIZING_FILTER).cells[0];
      expect(found?.locked).toBe(false);
      expect(found?.percentComplete).toBe(0);
      expect(computeSizingLayout(product, { ...DEFAULT_SIZING_FILTER, hideLocked: true }).cells).toHaveLength(1);
    });

    it('hideLocked reads the same lock, not the percentage', () => {
      const earlier = { id: 'r', progressHistory: [
        { sprintId: 's1', releaseId: 'rel1', percentComplete: 10 },
        { sprintId: 's2', releaseId: 'rel1', percentComplete: 0 },
      ] };
      expect(cell(earlier, { ...DEFAULT_SIZING_FILTER, hideLocked: true })).toBeUndefined();
    });
  });

  it('combined theme + hideLocked filter', () => {
    const product = makeProduct({
      themes: [
        { id: 't1', name: 'Theme 1', backbones: [
          { id: 'b1', name: 'B1', ribs: [
            { id: 'r1', name: 'T1 with progress', progressHistory: [
              { sprintId: 's1', releaseId: 'rel1', percentComplete: 50 },
            ] },
            { id: 'r2', name: 'T1 no progress' },
          ] },
        ] },
        { id: 't2', name: 'Theme 2', backbones: [
          { id: 'b2', name: 'B2', ribs: [
            { id: 'r3', name: 'T2 no progress' },
          ] },
        ] },
      ],
    });
    const filter: SizingFilter = { themeIds: ['t1'], releaseIds: [], hideLocked: true };
    const layout = computeSizingLayout(product, filter);
    expect(layout.cells).toHaveLength(1);
    expect(layout.cells[0]?.id).toBe('r2');
  });

  it('default parameter (no filter arg) returns all ribs', () => {
    const layout = computeSizingLayout(twoThemeProduct());
    expect(layout.cells).toHaveLength(4);
  });
});

describe('computeSizingLayout targetWidth expansion', () => {
  it('with no targetWidth, sized columns are 200px wide (legacy 1-card-wide stacking)', () => {
    const product = makeProduct({
      ribs: [
        { id: 'r1', size: 'M' }, { id: 'r2', size: 'M' }, { id: 'r3', size: 'M' },
      ],
    });
    const layout = computeSizingLayout(product);
    expect(layout.sizedSubColsByLabel.M).toBe(1);
    const mCells = layout.cells.filter(c => c.sizeLabel === 'M').sort((a, b) => a.y - b.y);
    // Pin the count first — without it, `expect(mCells[0]?.x).toBe(mCells[1]?.x)`
    // is `undefined === undefined` and passes on a layout that emitted NO cells.
    // Same guard the unsized-row test above uses.
    expect(mCells).toHaveLength(3);
    // All three stack vertically — same x, ascending y
    expect(mCells[0]?.x).toBe(mCells[1]?.x);
    expect(mCells[1]?.x).toBe(mCells[2]?.x);
  });

  it('with wide targetWidth, sized columns expand and pack cards into sub-columns', () => {
    // 3 sizes, 1300px canvas (incl. 36px row-number gutter) → each size column
    // gets ~415px → 2 sub-cols inside each size zone
    const product = makeProduct({
      ribs: [
        { id: 'r1', size: 'M' }, { id: 'r2', size: 'M' },
        { id: 'r3', size: 'M' }, { id: 'r4', size: 'M' },
      ],
    });
    const layout = computeSizingLayout(product, undefined, 1300);
    expect(layout.sizedSubColsByLabel.M).toBeGreaterThanOrEqual(2);
    const mCells = layout.cells.filter(c => c.sizeLabel === 'M');
    // First two should be on the same row (same y, different x)
    const sorted = [...mCells].sort((a, b) => a.y - b.y || a.x - b.x);
    expect(sorted[0]?.y).toBe(sorted[1]?.y);
    expect(req(sorted[1], 'sorted[1]').x).toBeGreaterThan(req(sorted[0], 'sorted[0]').x);
  });

  it('totalWidth equals max(targetWidth, gutter + min stacked content width)', () => {
    // 3 sizes → content min = 3 * (200 + 8) - 8 = 616
    // totalWidth = NUMBER_GUTTER_WIDTH (36) + content = 652 at minimum
    const product = makeProduct({ ribs: [{ id: 'r1', size: 'M' }] });
    expect(computeSizingLayout(product, undefined, 0).totalWidth).toBe(652);
    expect(computeSizingLayout(product, undefined, 400).totalWidth).toBe(652); // below min — clamped
    expect(computeSizingLayout(product, undefined, 1300).totalWidth).toBe(1300);
  });
});

describe('computeSizingLayout cell identity fields', () => {
  it('emits themeId on each cell matching its parent theme', () => {
    const product = makeProduct({
      themes: [
        { id: 't1', name: 'Theme 1', backbones: [
          { id: 'b1', name: 'B1', ribs: [
            { id: 'r1' }, { id: 'r2' },
          ] },
        ] },
        { id: 't2', name: 'Theme 2', backbones: [
          { id: 'b2', name: 'B2', ribs: [
            { id: 'r3' },
          ] },
        ] },
      ],
    });
    const layout = computeSizingLayout(product);
    const byId = Object.fromEntries(layout.cells.map(c => [c.id, c]));
    expect(req(byId.r1, 'byId.r1').themeId).toBe('t1');
    expect(req(byId.r2, 'byId.r2').themeId).toBe('t1');
    expect(req(byId.r3, 'byId.r3').themeId).toBe('t2');
  });

  it('emits backboneId on each cell matching its parent backbone', () => {
    const product = makeProduct({
      themes: [
        { id: 't1', name: 'Theme 1', backbones: [
          { id: 'b1', name: 'B1', ribs: [{ id: 'r1' }] },
          { id: 'b2', name: 'B2', ribs: [{ id: 'r2' }] },
        ] },
      ],
    });
    const layout = computeSizingLayout(product);
    const byId = Object.fromEntries(layout.cells.map(c => [c.id, c]));
    expect(req(byId.r1, 'byId.r1').backboneId).toBe('b1');
    expect(req(byId.r2, 'byId.r2').backboneId).toBe('b2');
  });
});

describe('computeSizingLayout orphan sizes', () => {
  it('puts a rib on a size no longer in the list in Unsized, keeping its label, and a 0-point size in its column', () => {
    // L was removed from the list; S is still in it, at 0 points.
    const product = makeProduct({
      ribs: [{ id: 'r1', size: 'M' }, { id: 'r2', size: 'L' }, { id: 'r3', size: 'S' }],
      sizeMapping: [{ label: 'S', points: 0 }, { label: 'M', points: 3 }],
    });
    const layout = computeSizingLayout(product);
    const placed = layout.cells.map(c => ({ id: c.id, zone: c.zone, sizeLabel: c.sizeLabel, size: c.size }));
    expect({ unsizedCount: layout.unsizedCount, placed }).toStrictEqual({
      unsizedCount: 1,
      placed: [
        { id: 'r2', zone: 'unsized', sizeLabel: null, size: 'L' },
        { id: 'r3', zone: 'sized', sizeLabel: 'S', size: 'S' },
        { id: 'r1', zone: 'sized', sizeLabel: 'M', size: 'M' },
      ],
    });
  });
});
