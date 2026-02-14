import { describe, it, expect } from 'vitest';
import {
  computeLayout,
  COL_WIDTH,
  COL_GAP,
  CELL_HEIGHT,
  CELL_GAP,
  CELL_PAD,
  THEME_HEIGHT,
  BACKBONE_HEIGHT,
  LANE_LABEL_WIDTH,
  MIN_LANE_HEIGHT,
} from '../components/storymap/useMapLayout';

function makeRib(id, allocations = []) {
  return {
    id,
    name: `Rib ${id}`,
    releaseAllocations: allocations,
    size: null,
    category: 'core',
    order: 1,
    progressHistory: [],
  };
}

function makeBackbone(id, ribs = []) {
  return { id, name: `Backbone ${id}`, ribItems: ribs, order: 1 };
}

function makeTheme(id, backbones = []) {
  return { id, name: `Theme ${id}`, backboneItems: backbones, order: 1 };
}

function makeProduct({ themes = [], releases = [] } = {}) {
  return { themes, releases, sizeMapping: [], releaseCardOrder: {} };
}

describe('computeLayout', () => {
  it('returns empty layout for product with no themes', () => {
    const result = computeLayout(makeProduct());
    expect(result.columns).toEqual([]);
    expect(result.themeSpans).toEqual([]);
    expect(result.releaseLanes).toEqual([]);
    expect(result.cells).toEqual([]);
    expect(result.unassignedLane).toBeNull();
    expect(result.totalWidth).toBe(0);
    expect(result.totalHeight).toBe(0);
  });

  it('creates one column per backbone', () => {
    const product = makeProduct({
      themes: [
        makeTheme('t1', [makeBackbone('b1'), makeBackbone('b2')]),
        makeTheme('t2', [makeBackbone('b3')]),
      ],
    });

    const result = computeLayout(product);
    expect(result.columns).toHaveLength(3);
    expect(result.columns[0].backboneId).toBe('b1');
    expect(result.columns[1].backboneId).toBe('b2');
    expect(result.columns[2].backboneId).toBe('b3');
  });

  it('assigns correct X positions to columns', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1'), makeBackbone('b2')])],
    });

    const result = computeLayout(product);
    expect(result.columns[0].x).toBe(LANE_LABEL_WIDTH);
    expect(result.columns[1].x).toBe(LANE_LABEL_WIDTH + COL_WIDTH + COL_GAP);
  });

  it('creates theme spans that cover their backbones', () => {
    const product = makeProduct({
      themes: [
        makeTheme('t1', [makeBackbone('b1'), makeBackbone('b2')]),
        makeTheme('t2', [makeBackbone('b3')]),
      ],
    });

    const result = computeLayout(product);
    expect(result.themeSpans).toHaveLength(2);

    // First theme spans 2 columns
    const ts1 = result.themeSpans[0];
    expect(ts1.themeId).toBe('t1');
    expect(ts1.colCount).toBe(2);
    expect(ts1.width).toBe(2 * (COL_WIDTH + COL_GAP) - COL_GAP);

    // Second theme spans 1 column
    const ts2 = result.themeSpans[1];
    expect(ts2.themeId).toBe('t2');
    expect(ts2.colCount).toBe(1);
    expect(ts2.width).toBe(COL_WIDTH);
  });

  it('calculates totalWidth correctly', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1'), makeBackbone('b2')])],
    });

    const result = computeLayout(product);
    const expectedContentWidth = 2 * (COL_WIDTH + COL_GAP) - COL_GAP;
    expect(result.totalWidth).toBe(LANE_LABEL_WIDTH + expectedContentWidth);
  });

  it('creates release lanes with correct positions', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1')])],
      releases: [
        { id: 'rel-1', name: 'Release 1', order: 1 },
        { id: 'rel-2', name: 'Release 2', order: 2 },
      ],
    });

    const result = computeLayout(product);
    expect(result.releaseLanes).toHaveLength(2);

    const bodyTop = THEME_HEIGHT + BACKBONE_HEIGHT;
    expect(result.releaseLanes[0].y).toBe(bodyTop);
    expect(result.releaseLanes[0].releaseId).toBe('rel-1');
    expect(result.releaseLanes[0].height).toBe(MIN_LANE_HEIGHT); // No ribs, so min height

    expect(result.releaseLanes[1].y).toBe(bodyTop + MIN_LANE_HEIGHT);
    expect(result.releaseLanes[1].releaseId).toBe('rel-2');
  });

  it('sorts releases by order', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1')])],
      releases: [
        { id: 'rel-2', name: 'Release 2', order: 2 },
        { id: 'rel-1', name: 'Release 1', order: 1 },
      ],
    });

    const result = computeLayout(product);
    expect(result.releaseLanes[0].releaseId).toBe('rel-1');
    expect(result.releaseLanes[1].releaseId).toBe('rel-2');
  });

  it('places cells at correct absolute positions', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
    });

    const result = computeLayout(product);
    expect(result.cells).toHaveLength(1);

    const cell = result.cells[0];
    expect(cell.id).toBe('r1');
    expect(cell.x).toBe(LANE_LABEL_WIDTH + CELL_PAD);
    expect(cell.y).toBe(THEME_HEIGHT + BACKBONE_HEIGHT + CELL_PAD);
    expect(cell.width).toBe(COL_WIDTH - CELL_PAD * 2);
    expect(cell.height).toBe(CELL_HEIGHT);
  });

  it('creates unassigned lane when ribs have no allocations', () => {
    const rib = makeRib('r1', []); // No allocations → unassigned
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = computeLayout(product);
    expect(result.unassignedLane).not.toBeNull();
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].releaseId).toBeNull();
  });

  it('returns null unassigned lane when all ribs are assigned', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
    });

    const result = computeLayout(product);
    expect(result.unassignedLane).toBeNull();
  });

  it('expands lane height when column has many ribs', () => {
    // Create 3 ribs in the same release + backbone
    const ribs = [
      makeRib('r1', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]),
      makeRib('r2', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]),
      makeRib('r3', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]),
    ];
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', ribs)])],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
    });

    const result = computeLayout(product);
    const expectedHeight = 3 * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2;
    expect(result.releaseLanes[0].height).toBe(Math.max(expectedHeight, MIN_LANE_HEIGHT));
  });

  it('creates multiple cells for partial allocations', () => {
    const rib = makeRib('r1', [
      { releaseId: 'rel-1', percentage: 60, memo: '' },
      { releaseId: 'rel-2', percentage: 40, memo: '' },
    ]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [
        { id: 'rel-1', name: 'Release 1', order: 1 },
        { id: 'rel-2', name: 'Release 2', order: 2 },
      ],
    });

    const result = computeLayout(product);
    // Should produce 2 cells (one per allocation)
    const ribCells = result.cells.filter(c => c.id === 'r1');
    expect(ribCells).toHaveLength(2);
    expect(ribCells[0].releaseId).toBe('rel-1');
    expect(ribCells[0].isPartial).toBe(true);
    expect(ribCells[1].releaseId).toBe('rel-2');
    expect(ribCells[1].isPartial).toBe(true);
  });

  it('enriches cells with theme/backbone context', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
    });

    const result = computeLayout(product);
    const cell = result.cells[0];
    expect(cell.themeId).toBe('t1');
    expect(cell.themeName).toBe('Theme t1');
    expect(cell.backboneId).toBe('b1');
    expect(cell.backboneName).toBe('Backbone b1');
  });

  it('skips themes with no backbones', () => {
    const product = makeProduct({
      themes: [
        makeTheme('t1', []), // Empty theme
        makeTheme('t2', [makeBackbone('b1')]),
      ],
    });

    const result = computeLayout(product);
    expect(result.columns).toHaveLength(1);
    expect(result.themeSpans).toHaveLength(1);
    expect(result.themeSpans[0].themeId).toBe('t2');
  });
});
