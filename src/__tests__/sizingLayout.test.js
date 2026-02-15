import { describe, it, expect } from 'vitest';
import { computeSizingLayout, CELL_HEIGHT, CELL_GAP, CELL_PAD } from '../components/sizing/useSizingLayout';

/** Minimal product builder for sizing tests */
function makeProduct({ ribs = [], sizeMapping = null, sizingCardOrder = {} } = {}) {
  const defaultMapping = [
    { label: 'S', points: 1 },
    { label: 'M', points: 3 },
    { label: 'L', points: 5 },
  ];
  return {
    themes: [{
      id: 't1',
      name: 'Theme 1',
      backboneItems: [{
        id: 'b1',
        name: 'Backbone 1',
        ribItems: ribs.map(r => ({
          id: r.id,
          name: r.name || r.id,
          size: r.size || null,
          category: 'core',
          releaseAllocations: [],
          progressHistory: [],
        })),
      }],
    }],
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
