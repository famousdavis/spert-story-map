// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { computeSizingLayout, CELL_HEIGHT, CELL_GAP, CELL_PAD } from '../components/sizing/useSizingLayout';
import type { SizingFilter } from '../components/sizing/useSizingLayout';

interface RibInput {
  id: string;
  name?: string;
  size?: string | null;
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

/** Minimal product builder for sizing tests */
function makeProduct({ ribs = [], sizeMapping = null, sizingCardOrder = {}, themes = null }: {
  ribs?: RibInput[];
  sizeMapping?: Array<{ label: string; points: number }> | null;
  sizingCardOrder?: Record<string, string[]>;
  themes?: ThemeInput[] | null;
} = {}) {
  const defaultMapping = [
    { label: 'S', points: 1 },
    { label: 'M', points: 3 },
    { label: 'L', points: 5 },
  ];

  const buildThemes = themes
    ? themes.map(t => ({
        id: t.id,
        name: t.name,
        backboneItems: t.backbones.map(b => ({
          id: b.id,
          name: b.name,
          ribItems: b.ribs.map(r => ({
            id: r.id,
            name: r.name || r.id,
            size: r.size || null,
            category: 'core' as const,
            releaseAllocations: [],
            progressHistory: r.progressHistory || [],
          })),
        })),
      }))
    : [{
        id: 't1',
        name: 'Theme 1',
        backboneItems: [{
          id: 'b1',
          name: 'Backbone 1',
          ribItems: ribs.map(r => ({
            id: r.id,
            name: r.name || r.id,
            size: r.size || null,
            category: 'core' as const,
            releaseAllocations: [],
            progressHistory: r.progressHistory || [],
          })),
        }],
      }];

  return {
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
    expect(mCells[0].y).toBeLessThan(mCells[1].y);
    expect(mCells[1].y).toBeLessThan(mCells[2].y);
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
    expect(sCells[0].id).toBe('r2');
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
    expect(mCells[1].y - mCells[0].y).toBe(CELL_HEIGHT + CELL_GAP);
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
      expect(unsized[0].y).toBe(unsized[1].y);
      expect(unsized[1].x).toBeGreaterThan(unsized[0].x);
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
    const filter: SizingFilter = { themeIds: [], hideLocked: false };
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
    const filter: SizingFilter = { themeIds: ['t1'], hideLocked: false };
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
    const filter: SizingFilter = { themeIds: ['t1', 't3'], hideLocked: false };
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
    const filter: SizingFilter = { themeIds: ['nonexistent'], hideLocked: false };
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
    const filter: SizingFilter = { themeIds: [], hideLocked: true };
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
    const filter: SizingFilter = { themeIds: [], hideLocked: false };
    const layout = computeSizingLayout(product, filter);
    expect(layout.cells).toHaveLength(3);
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
    const filter: SizingFilter = { themeIds: ['t1'], hideLocked: true };
    const layout = computeSizingLayout(product, filter);
    expect(layout.cells).toHaveLength(1);
    expect(layout.cells[0].id).toBe('r2');
  });

  it('default parameter (no filter arg) returns all ribs', () => {
    const layout = computeSizingLayout(twoThemeProduct());
    expect(layout.cells).toHaveLength(4);
  });
});
