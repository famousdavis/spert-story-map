// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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
  RIGHT_LABEL_WIDTH,
  MIN_LANE_HEIGHT,
  ADD_BUTTON_RESERVED,
  COLLAPSED_LANE_HEIGHT,
} from '../components/storymap/useMapLayout';
import type { Product, Theme, Backbone, RibItem, Release, ReleaseAllocation } from '../types';
import { req } from './testHelpers';


function makeRib(id: string, allocations: ReleaseAllocation[] = []): RibItem {
  return {
    id,
    name: `Rib ${id}`,
    description: '',
    releaseAllocations: allocations,
    size: null,
    category: 'core',
    order: 1,
    progressHistory: [],
  };
}

function makeBackbone(id: string, ribs: RibItem[] = []): Backbone {
  return { id, name: `Backbone ${id}`, ribItems: ribs, order: 1 };
}

function makeTheme(id: string, backbones: Backbone[] = []): Theme {
  return { id, name: `Theme ${id}`, backboneItems: backbones, order: 1 };
}

function makeProduct({ themes = [], releases = [] }: {
  themes?: Theme[];
  releases?: Release[];
} = {}): Product {
  return {
    id: 'p1',
    name: 'Test Product',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 2,
    sprints: [],
    themes,
    releases,
    sizeMapping: [],
    releaseCardOrder: {},
  };
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
    expect(result.columns[0]?.backboneId).toBe('b1');
    expect(result.columns[1]?.backboneId).toBe('b2');
    expect(result.columns[2]?.backboneId).toBe('b3');
  });

  it('assigns correct X positions to columns', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1'), makeBackbone('b2')])],
    });

    const result = computeLayout(product);
    expect(result.columns[0]?.x).toBe(LANE_LABEL_WIDTH);
    expect(result.columns[1]?.x).toBe(LANE_LABEL_WIDTH + COL_WIDTH + COL_GAP);
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
    const ts1 = req(result.themeSpans[0], 'themeSpans[0]');
    expect(ts1.themeId).toBe('t1');
    expect(ts1.colCount).toBe(2);
    expect(ts1.width).toBe(2 * (COL_WIDTH + COL_GAP) - COL_GAP);

    // Second theme spans 1 column
    const ts2 = req(result.themeSpans[1], 'themeSpans[1]');
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
    expect(result.totalWidth).toBe(LANE_LABEL_WIDTH + expectedContentWidth + RIGHT_LABEL_WIDTH);
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
    expect(result.releaseLanes[0]?.y).toBe(bodyTop);
    expect(result.releaseLanes[0]?.releaseId).toBe('rel-1');
    expect(result.releaseLanes[0]?.height).toBe(MIN_LANE_HEIGHT); // No ribs, so min height

    expect(result.releaseLanes[1]?.y).toBe(bodyTop + MIN_LANE_HEIGHT);
    expect(result.releaseLanes[1]?.releaseId).toBe('rel-2');
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
    expect(result.releaseLanes[0]?.releaseId).toBe('rel-1');
    expect(result.releaseLanes[1]?.releaseId).toBe('rel-2');
  });

  it('places cells at correct absolute positions', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
    });

    const result = computeLayout(product);
    expect(result.cells).toHaveLength(1);

    const cell = req(result.cells[0], 'cells[0]');
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
    expect(result.cells[0]?.releaseId).toBeNull();
  });

  it('always includes unassigned lane when themes exist even if all ribs are assigned', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
    });

    const result = computeLayout(product);
    expect(result.unassignedLane).not.toBeNull();
    expect(req(result.unassignedLane, 'unassignedLane').height).toBe(MIN_LANE_HEIGHT);
  });

  it('includes unassigned lane even when no ribs exist', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [])])],
    });

    const result = computeLayout(product);
    expect(result.unassignedLane).not.toBeNull();
    expect(req(result.unassignedLane, 'unassignedLane').height).toBe(MIN_LANE_HEIGHT);
    expect(req(result.unassignedLane, 'unassignedLane').y).toBe(THEME_HEIGHT + BACKBONE_HEIGHT);
  });

  it('includes unassigned lane height in totalHeight even with no unassigned ribs', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [])])],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
    });

    const result = computeLayout(product);
    expect(result.totalHeight).toBe(THEME_HEIGHT + BACKBONE_HEIGHT + MIN_LANE_HEIGHT + MIN_LANE_HEIGHT);
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
    const expectedHeight = 3 * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2 + ADD_BUTTON_RESERVED;
    expect(result.releaseLanes[0]?.height).toBe(Math.max(expectedHeight, MIN_LANE_HEIGHT));
  });

  it('emits a + Rib gap button for every column×lane (including longest unassigned column)', () => {
    // Build two backbones; column 0 has 2 unassigned ribs (longest), column 1
    // has 1 release-allocated rib + 0 unassigned. Pre-v0.34 the longest
    // unassigned column and the empty unassigned cell in column 1 would both
    // be skipped. v0.34 emits one gap button per (lane × column).
    const r0a = makeRib('a', []);
    const r0b = makeRib('b', []);
    const r1 = makeRib('c', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [
        makeBackbone('b0', [r0a, r0b]),
        makeBackbone('b1', [r1]),
      ])],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
    });

    const result = computeLayout(product);
    // 1 release × 2 columns + 1 unassigned × 2 columns = 4 gap buttons
    expect(result.gapButtons).toHaveLength(4);

    // Longest unassigned column (col 0, 2 ribs) — button sits below the last
    // rib, inside the reserved bottom padding.
    const longest = result.gapButtons.find(
      g => g.releaseId === null && g.backboneId === 'b0'
    );
    expect(longest).toBeDefined();
    const longestExpectedY =
      req(result.unassignedLane, 'unassignedLane').y + CELL_PAD + (2 - 1) * (CELL_HEIGHT + CELL_GAP) + CELL_HEIGHT + 2;
    expect(longest!.y).toBe(longestExpectedY);

    // Empty release×column in column 0 (no allocations) — button at top of cell.
    const emptyRel = result.gapButtons.find(
      g => g.releaseId === 'rel-1' && g.backboneId === 'b0'
    );
    expect(emptyRel).toBeDefined();
    expect(req(emptyRel, 'emptyRel').y).toBe(req(result.releaseLanes[0], 'releaseLanes[0]').y + CELL_PAD);
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
    expect(ribCells[0]?.releaseId).toBe('rel-1');
    expect(ribCells[0]?.isPartial).toBe(true);
    expect(ribCells[1]?.releaseId).toBe('rel-2');
    expect(ribCells[1]?.isPartial).toBe(true);
  });

  it('enriches cells with theme/backbone context', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
    });

    const result = computeLayout(product);
    const cell = req(result.cells[0], 'cells[0]');
    expect(cell.themeId).toBe('t1');
    expect(cell.themeName).toBe('Theme t1');
    expect(cell.backboneId).toBe('b1');
    expect(cell.backboneName).toBe('Backbone b1');
  });

  it('includes themes with no backbones as empty placeholders', () => {
    const product = makeProduct({
      themes: [
        makeTheme('t1', []), // Empty theme
        makeTheme('t2', [makeBackbone('b1')]),
      ],
    });

    const result = computeLayout(product);
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0]?.backboneId).toBe('b1');
    expect(result.themeSpans).toHaveLength(2);

    // Empty theme gets a placeholder span
    const ts1 = req(result.themeSpans[0], 'themeSpans[0]');
    expect(ts1.themeId).toBe('t1');
    expect(ts1.colCount).toBe(0);
    expect(ts1.isEmpty).toBe(true);
    expect(ts1.width).toBe(COL_WIDTH);

    // Second theme follows after the placeholder
    const ts2 = req(result.themeSpans[1], 'themeSpans[1]');
    expect(ts2.themeId).toBe('t2');
    expect(ts2.colCount).toBe(1);
    expect(ts2.x).toBe(LANE_LABEL_WIDTH + COL_WIDTH + COL_GAP);
  });

  it('renders layout for a single empty theme', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [])],
    });

    const result = computeLayout(product);
    expect(result.columns).toHaveLength(0);
    expect(result.themeSpans).toHaveLength(1);
    expect(result.themeSpans[0]?.themeId).toBe('t1');
    expect(result.themeSpans[0]?.isEmpty).toBe(true);
    expect(result.themeSpans[0]?.width).toBe(COL_WIDTH);
    expect(result.totalWidth).toBe(LANE_LABEL_WIDTH + COL_WIDTH + RIGHT_LABEL_WIDTH);
  });

  it('positions multiple empty themes correctly', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', []), makeTheme('t2', [])],
    });

    const result = computeLayout(product);
    expect(result.columns).toHaveLength(0);
    expect(result.themeSpans).toHaveLength(2);
    expect(result.themeSpans[0]?.x).toBe(LANE_LABEL_WIDTH);
    expect(result.themeSpans[1]?.x).toBe(LANE_LABEL_WIDTH + COL_WIDTH + COL_GAP);
  });

  it('correctly positions mixed empty and populated themes with cells', () => {
    const rib = makeRib('r1', []);
    const product = makeProduct({
      themes: [
        makeTheme('t1', [makeBackbone('b1')]),
        makeTheme('t2', []),  // empty
        makeTheme('t3', [makeBackbone('b3', [rib])]),
      ],
    });

    const result = computeLayout(product);
    expect(result.columns).toHaveLength(2);
    expect(result.themeSpans).toHaveLength(3);

    // t1 spans 1 column
    expect(result.themeSpans[0]?.colCount).toBe(1);

    // t2 is empty placeholder at slot 1
    expect(result.themeSpans[1]?.isEmpty).toBe(true);
    expect(result.themeSpans[1]?.x).toBe(LANE_LABEL_WIDTH + (COL_WIDTH + COL_GAP));

    // t3 follows at slot 2
    expect(result.themeSpans[2]?.colCount).toBe(1);
    expect(result.themeSpans[2]?.x).toBe(LANE_LABEL_WIDTH + 2 * (COL_WIDTH + COL_GAP));

    // Rib cell still placed correctly for b3
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0]?.backboneId).toBe('b3');
  });
});

describe('computeLayout — collapsed release lanes', () => {
  const bodyTop = THEME_HEIGHT + BACKBONE_HEIGHT;

  function productWithTwoReleases() {
    return makeProduct({
      themes: [
        makeTheme('t1', [
          makeBackbone('b1', [
            makeRib('r1', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]),
            makeRib('r2', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]),
            makeRib('r3', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]),
          ]),
        ]),
      ],
      releases: [
        { id: 'rel-1', name: 'Release 1', order: 1 },
        { id: 'rel-2', name: 'Release 2', order: 2 },
      ],
    });
  }

  it('back-compat: single-arg call behaves as before (no collapse)', () => {
    const product = productWithTwoReleases();
    const a = computeLayout(product);
    const b = computeLayout(product, []);
    expect(a.totalHeight).toBe(b.totalHeight);
    expect(a.releaseLanes[0]?.height).toBe(b.releaseLanes[0]?.height);
    expect(a.releaseLanes[0]?.collapsed).toBe(false);
  });

  it('collapsed lane gets COLLAPSED_LANE_HEIGHT, emits no cells, no gap buttons', () => {
    const product = productWithTwoReleases();
    const result = computeLayout(product, ['rel-1']);

    const lane = req(result.releaseLanes.find(l => l.releaseId === 'rel-1'), "releaseLanes 'rel-1'");
    expect(lane.collapsed).toBe(true);
    expect(lane.height).toBe(COLLAPSED_LANE_HEIGHT);

    // No cells for the collapsed release
    expect(result.cells.some((c: { releaseId: string | null }) => c.releaseId === 'rel-1')).toBe(false);
    // No gap (+ Rib) buttons for the collapsed release
    expect(result.gapButtons.some((g: { releaseId: string | null }) => g.releaseId === 'rel-1')).toBe(false);
  });

  it('cardCount is the SUM across columns (not max)', () => {
    const product = makeProduct({
      themes: [
        makeTheme('t1', [
          // Column A: 3 ribs in rel-1; Column B: 1 rib in rel-1 → cardCount 4, height from max 3
          makeBackbone('bA', [
            makeRib('a1', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]),
            makeRib('a2', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]),
            makeRib('a3', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]),
          ]),
          makeBackbone('bB', [
            makeRib('b1', [{ releaseId: 'rel-1', percentage: 100, memo: '' }]),
          ]),
        ]),
      ],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
    });
    const result = computeLayout(product);
    const lane = req(result.releaseLanes[0], 'releaseLanes[0]');
    expect(lane.cardCount).toBe(4);
    // Height uses the tallest column (3 ribs), not the total count
    const expectedHeight = 3 * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2 + ADD_BUTTON_RESERVED;
    expect(lane.height).toBe(Math.max(expectedHeight, MIN_LANE_HEIGHT));
  });

  it('collapsing a lane shifts downstream lanes up and shrinks totalHeight', () => {
    const product = productWithTwoReleases();
    const open = computeLayout(product);
    const collapsed = computeLayout(product, ['rel-1']);

    const rel1Open = req(open.releaseLanes[0]?.height, 'rel1Open');
    const saved = rel1Open - COLLAPSED_LANE_HEIGHT;
    expect(saved).toBeGreaterThan(0);

    // rel-2 (downstream) and the unassigned lane both move up by the saved height
    expect(req(collapsed.releaseLanes[1], 'collapsed lane 1').y).toBe(req(open.releaseLanes[1], 'open lane 1').y - saved);
    expect(req(collapsed.unassignedLane, 'collapsed lane').y).toBe(req(open.unassignedLane, 'open lane').y - saved);
    expect(collapsed.totalHeight).toBe(open.totalHeight - saved);

    // First collapsed lane still starts at bodyTop
    expect(collapsed.releaseLanes[0]?.y).toBe(bodyTop);
  });

  it('a partial-allocation rib still renders in the open lane when its other lane is collapsed', () => {
    const product = makeProduct({
      themes: [
        makeTheme('t1', [
          makeBackbone('b1', [
            makeRib('r1', [
              { releaseId: 'rel-1', percentage: 60, memo: '' },
              { releaseId: 'rel-2', percentage: 40, memo: '' },
            ]),
          ]),
        ]),
      ],
      releases: [
        { id: 'rel-1', name: 'Release 1', order: 1 },
        { id: 'rel-2', name: 'Release 2', order: 2 },
      ],
    });
    const result = computeLayout(product, ['rel-1']); // collapse rel-1 only

    // No cell in the collapsed lane, but the rib's rel-2 cell survives
    expect(result.cells.some((c: { releaseId: string | null }) => c.releaseId === 'rel-1')).toBe(false);
    expect(result.cells.some((c: { id: string; releaseId: string | null }) => c.id === 'r1' && c.releaseId === 'rel-2')).toBe(true);
    // Collapsed lane's cardCount still counts its allocation
    const lane = req(result.releaseLanes.find(l => l.releaseId === 'rel-1'), "releaseLanes 'rel-1'");
    expect(lane.cardCount).toBe(1);
  });
});
