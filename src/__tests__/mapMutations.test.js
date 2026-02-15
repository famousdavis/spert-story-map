import { describe, it, expect } from 'vitest';
import { moveRibToRelease, reorderRibInRelease, moveRibToBackbone, moveBackboneToTheme, reorderTheme, moveRib2D, moveRibs2D } from '../components/storymap/mapMutations';
import { computeLayout, CELL_HEIGHT, CELL_GAP, CELL_PAD } from '../components/storymap/useMapLayout';
import { computeInsertIndex } from '../components/storymap/mapDragHelpers';

// Helper: creates a minimal product with configurable themes/backbones/ribs
function makeProduct({
  themes = [],
  releases = [],
  releaseCardOrder = {},
} = {}) {
  return { themes, releases, releaseCardOrder, sizeMapping: [] };
}

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

// Capture the result of an updateProduct call
function captureUpdate(mutationFn, ...args) {
  let result;
  const fakeUpdate = (updater) => {
    result = typeof updater === 'function' ? updater(args[0]) : updater;
  };
  // args[0] is the product, rest are mutation-specific args
  // But mutations call updateProduct as first arg, so we adjust:
  mutationFn(fakeUpdate, ...args.slice(1));
  return result;
}

// --- moveRibToRelease ---
describe('moveRibToRelease', () => {
  it('moves a rib from one release to another', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releaseCardOrder: { 'rel-A': ['r1'] },
    });

    const result = captureUpdate(
      (update) => moveRibToRelease(update, 'r1', 'rel-A', 'rel-B'),
      product,
    );

    const updatedRib = result.themes[0].backboneItems[0].ribItems[0];
    expect(updatedRib.releaseAllocations).toEqual([
      { releaseId: 'rel-B', percentage: 100, memo: '' },
    ]);
    expect(result.releaseCardOrder['rel-A']).toEqual([]);
    expect(result.releaseCardOrder['rel-B']).toEqual(['r1']);
  });

  it('moves a rib to unassigned (clears allocations)', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 80, memo: 'note' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releaseCardOrder: { 'rel-A': ['r1'] },
    });

    const result = captureUpdate(
      (update) => moveRibToRelease(update, 'r1', 'rel-A', null),
      product,
    );

    const updatedRib = result.themes[0].backboneItems[0].ribItems[0];
    expect(updatedRib.releaseAllocations).toEqual([]);
    expect(result.releaseCardOrder['rel-A']).toEqual([]);
    expect(result.releaseCardOrder['unassigned']).toEqual(['r1']);
  });

  it('moves a rib from unassigned to a release', () => {
    const rib = makeRib('r1', []);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releaseCardOrder: { unassigned: ['r1'] },
    });

    const result = captureUpdate(
      (update) => moveRibToRelease(update, 'r1', null, 'rel-B'),
      product,
    );

    const updatedRib = result.themes[0].backboneItems[0].ribItems[0];
    expect(updatedRib.releaseAllocations).toEqual([
      { releaseId: 'rel-B', percentage: 100, memo: '' },
    ]);
    expect(result.releaseCardOrder['unassigned']).toEqual([]);
    expect(result.releaseCardOrder['rel-B']).toEqual(['r1']);
  });

  it('preserves memo when transferring allocations', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 60, memo: 'important note' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureUpdate(
      (update) => moveRibToRelease(update, 'r1', 'rel-A', 'rel-B'),
      product,
    );

    const updatedRib = result.themes[0].backboneItems[0].ribItems[0];
    expect(updatedRib.releaseAllocations[0].memo).toBe('important note');
    expect(updatedRib.releaseAllocations[0].percentage).toBe(60);
  });

  it('guards against duplicate allocation on same release', () => {
    const rib = makeRib('r1', [
      { releaseId: 'rel-A', percentage: 50, memo: '' },
      { releaseId: 'rel-B', percentage: 50, memo: '' },
    ]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    // Try to move from rel-A to rel-B — which already has an allocation
    const result = captureUpdate(
      (update) => moveRibToRelease(update, 'r1', 'rel-A', 'rel-B'),
      product,
    );

    // Should not create a duplicate — rib should be unchanged
    const updatedRib = result.themes[0].backboneItems[0].ribItems[0];
    expect(updatedRib.releaseAllocations).toHaveLength(2);
    expect(updatedRib.releaseAllocations).toEqual(rib.releaseAllocations);
  });

  it('does not modify other ribs', () => {
    const rib1 = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const rib2 = makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib1, rib2])])],
    });

    const result = captureUpdate(
      (update) => moveRibToRelease(update, 'r1', 'rel-A', 'rel-B'),
      product,
    );

    const r2 = result.themes[0].backboneItems[0].ribItems[1];
    expect(r2.releaseAllocations).toEqual([{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
  });

  it('inserts rib at specified index in releaseCardOrder', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releaseCardOrder: { 'rel-A': ['r1'], 'rel-B': ['r2', 'r3'] },
    });

    const result = captureUpdate(
      (update) => moveRibToRelease(update, 'r1', 'rel-A', 'rel-B', 1),
      product,
    );

    expect(result.releaseCardOrder['rel-B']).toEqual(['r2', 'r1', 'r3']);
  });

  it('inserts rib at beginning when insertIndex is 0', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releaseCardOrder: { 'rel-A': ['r1'], 'rel-B': ['r2', 'r3'] },
    });

    const result = captureUpdate(
      (update) => moveRibToRelease(update, 'r1', 'rel-A', 'rel-B', 0),
      product,
    );

    expect(result.releaseCardOrder['rel-B']).toEqual(['r1', 'r2', 'r3']);
  });

  it('appends rib when insertIndex is null', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releaseCardOrder: { 'rel-A': ['r1'], 'rel-B': ['r2', 'r3'] },
    });

    const result = captureUpdate(
      (update) => moveRibToRelease(update, 'r1', 'rel-A', 'rel-B', null),
      product,
    );

    expect(result.releaseCardOrder['rel-B']).toEqual(['r2', 'r3', 'r1']);
  });
});

// --- reorderRibInRelease ---
describe('reorderRibInRelease', () => {
  it('moves rib to specified position within same release', () => {
    const product = makeProduct({
      themes: [],
      releaseCardOrder: { 'rel-A': ['r1', 'r2', 'r3'] },
    });

    const result = captureUpdate(
      (update) => reorderRibInRelease(update, 'r1', 'rel-A', 2),
      product,
    );

    expect(result.releaseCardOrder['rel-A']).toEqual(['r2', 'r3', 'r1']);
  });

  it('moves rib to beginning', () => {
    const product = makeProduct({
      themes: [],
      releaseCardOrder: { 'rel-A': ['r1', 'r2', 'r3'] },
    });

    const result = captureUpdate(
      (update) => reorderRibInRelease(update, 'r3', 'rel-A', 0),
      product,
    );

    expect(result.releaseCardOrder['rel-A']).toEqual(['r3', 'r1', 'r2']);
  });

  it('handles unassigned lane', () => {
    const product = makeProduct({
      themes: [],
      releaseCardOrder: { unassigned: ['r1', 'r2'] },
    });

    const result = captureUpdate(
      (update) => reorderRibInRelease(update, 'r1', null, 1),
      product,
    );

    expect(result.releaseCardOrder['unassigned']).toEqual(['r2', 'r1']);
  });

  it('does not modify allocations', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 60, memo: 'keep' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releaseCardOrder: { 'rel-A': ['r1', 'r2'] },
    });

    const result = captureUpdate(
      (update) => reorderRibInRelease(update, 'r1', 'rel-A', 1),
      product,
    );

    // Allocations unchanged
    const updatedRib = result.themes[0].backboneItems[0].ribItems[0];
    expect(updatedRib.releaseAllocations[0].percentage).toBe(60);
    expect(updatedRib.releaseAllocations[0].memo).toBe('keep');
  });
});

// --- moveRibToBackbone ---
describe('moveRibToBackbone', () => {
  it('moves a rib from one backbone to another within the same theme', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [
        makeBackbone('b1', [rib]),
        makeBackbone('b2', []),
      ])],
    });

    const result = captureUpdate(
      (update) => moveRibToBackbone(update, 'r1', 't1', 'b1', 't1', 'b2'),
      product,
    );

    expect(result.themes[0].backboneItems[0].ribItems).toHaveLength(0);
    expect(result.themes[0].backboneItems[1].ribItems).toHaveLength(1);
    expect(result.themes[0].backboneItems[1].ribItems[0].id).toBe('r1');
  });

  it('moves a rib across themes', () => {
    const rib = makeRib('r1');
    const product = makeProduct({
      themes: [
        makeTheme('t1', [makeBackbone('b1', [rib])]),
        makeTheme('t2', [makeBackbone('b2', [])]),
      ],
    });

    const result = captureUpdate(
      (update) => moveRibToBackbone(update, 'r1', 't1', 'b1', 't2', 'b2'),
      product,
    );

    expect(result.themes[0].backboneItems[0].ribItems).toHaveLength(0);
    expect(result.themes[1].backboneItems[0].ribItems).toHaveLength(1);
    expect(result.themes[1].backboneItems[0].ribItems[0].id).toBe('r1');
  });

  it('returns prev if rib not found', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [])])],
    });

    const result = captureUpdate(
      (update) => moveRibToBackbone(update, 'nonexistent', 't1', 'b1', 't1', 'b1'),
      product,
    );

    expect(result).toBe(product); // unchanged reference
  });

  it('assigns correct order on target backbone', () => {
    const existingRib = makeRib('r-existing');
    const movedRib = makeRib('r1');
    const product = makeProduct({
      themes: [makeTheme('t1', [
        makeBackbone('b1', [movedRib]),
        makeBackbone('b2', [existingRib]),
      ])],
    });

    const result = captureUpdate(
      (update) => moveRibToBackbone(update, 'r1', 't1', 'b1', 't1', 'b2'),
      product,
    );

    const addedRib = result.themes[0].backboneItems[1].ribItems[1];
    expect(addedRib.id).toBe('r1');
    expect(addedRib.order).toBe(2); // Appended after existingRib
  });
});

// --- moveBackboneToTheme ---
describe('moveBackboneToTheme', () => {
  it('moves a backbone from one theme to another', () => {
    const rib = makeRib('r1');
    const product = makeProduct({
      themes: [
        makeTheme('t1', [makeBackbone('b1', [rib]), makeBackbone('b2', [])]),
        makeTheme('t2', [makeBackbone('b3', [])]),
      ],
    });

    const result = captureUpdate(
      (update) => moveBackboneToTheme(update, 'b1', 't1', 't2'),
      product,
    );

    // Source theme should have b1 removed
    expect(result.themes[0].backboneItems).toHaveLength(1);
    expect(result.themes[0].backboneItems[0].id).toBe('b2');
    expect(result.themes[0].backboneItems[0].order).toBe(1); // reindexed

    // Target theme should have b1 added
    expect(result.themes[1].backboneItems).toHaveLength(2);
    expect(result.themes[1].backboneItems[1].id).toBe('b1');
    expect(result.themes[1].backboneItems[1].order).toBe(2);
  });

  it('preserves ribs when moving backbone', () => {
    const rib1 = makeRib('r1');
    const rib2 = makeRib('r2');
    const product = makeProduct({
      themes: [
        makeTheme('t1', [makeBackbone('b1', [rib1, rib2])]),
        makeTheme('t2', []),
      ],
    });

    const result = captureUpdate(
      (update) => moveBackboneToTheme(update, 'b1', 't1', 't2'),
      product,
    );

    const movedBb = result.themes[1].backboneItems[0];
    expect(movedBb.ribItems).toHaveLength(2);
    expect(movedBb.ribItems[0].id).toBe('r1');
    expect(movedBb.ribItems[1].id).toBe('r2');
  });

  it('returns prev if backbone not found', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [])],
    });

    const result = captureUpdate(
      (update) => moveBackboneToTheme(update, 'nonexistent', 't1', 't2'),
      product,
    );

    expect(result).toBe(product);
  });
});

// --- moveRib2D ---
describe('moveRib2D', () => {
  it('moves rib to different backbone only', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib]), makeBackbone('b2', [])])],
    });

    const result = captureUpdate(
      (update) => moveRib2D(update, 'r1',
        { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
        { themeId: 't1', backboneId: 'b2', releaseId: 'rel-A' }
      ),
      product,
    );

    expect(result.themes[0].backboneItems[0].ribItems).toHaveLength(0);
    expect(result.themes[0].backboneItems[1].ribItems).toHaveLength(1);
    expect(result.themes[0].backboneItems[1].ribItems[0].id).toBe('r1');
    // Allocation unchanged
    expect(result.themes[0].backboneItems[1].ribItems[0].releaseAllocations[0].releaseId).toBe('rel-A');
  });

  it('moves rib to different release only', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releaseCardOrder: { 'rel-A': ['r1'] },
    });

    const result = captureUpdate(
      (update) => moveRib2D(update, 'r1',
        { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
        { themeId: 't1', backboneId: 'b1', releaseId: 'rel-B' }
      ),
      product,
    );

    const updatedRib = result.themes[0].backboneItems[0].ribItems[0];
    expect(updatedRib.releaseAllocations[0].releaseId).toBe('rel-B');
    expect(result.releaseCardOrder['rel-A']).toEqual([]);
    expect(result.releaseCardOrder['rel-B']).toEqual(['r1']);
  });

  it('moves rib to different backbone AND release simultaneously', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 80, memo: 'test' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib]), makeBackbone('b2', [])])],
      releaseCardOrder: { 'rel-A': ['r1'] },
    });

    const result = captureUpdate(
      (update) => moveRib2D(update, 'r1',
        { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
        { themeId: 't1', backboneId: 'b2', releaseId: 'rel-B', insertIndex: 0 }
      ),
      product,
    );

    // Backbone changed
    expect(result.themes[0].backboneItems[0].ribItems).toHaveLength(0);
    expect(result.themes[0].backboneItems[1].ribItems).toHaveLength(1);
    // Release changed with preserved memo
    const movedRib = result.themes[0].backboneItems[1].ribItems[0];
    expect(movedRib.releaseAllocations[0].releaseId).toBe('rel-B');
    expect(movedRib.releaseAllocations[0].percentage).toBe(80);
    expect(movedRib.releaseAllocations[0].memo).toBe('test');
    // Card order updated
    expect(result.releaseCardOrder['rel-A']).toEqual([]);
    expect(result.releaseCardOrder['rel-B']).toEqual(['r1']);
  });

  it('is a no-op when neither backbone nor release changed', () => {
    let called = false;
    const fakeUpdate = () => { called = true; };
    moveRib2D(fakeUpdate, 'r1',
      { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
      { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' }
    );
    expect(called).toBe(false);
  });

  it('inserts at specified position in card order', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releaseCardOrder: { 'rel-A': ['r1'], 'rel-B': ['r2', 'r3'] },
    });

    const result = captureUpdate(
      (update) => moveRib2D(update, 'r1',
        { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
        { themeId: 't1', backboneId: 'b1', releaseId: 'rel-B', insertIndex: 1 }
      ),
      product,
    );

    expect(result.releaseCardOrder['rel-B']).toEqual(['r2', 'r1', 'r3']);
  });
});

// --- moveRibs2D (batch) ---
describe('moveRibs2D', () => {
  it('batch moves ribs to a different backbone', () => {
    const r1 = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const r2 = makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [r1, r2]), makeBackbone('b2', [])])],
    });

    const result = captureUpdate(
      (update) => moveRibs2D(update, [
        { ribId: 'r1', fromThemeId: 't1', fromBackboneId: 'b1', fromReleaseId: 'rel-A' },
        { ribId: 'r2', fromThemeId: 't1', fromBackboneId: 'b1', fromReleaseId: 'rel-A' },
      ], { themeId: 't1', backboneId: 'b2', releaseId: 'rel-A' }),
      product,
    );

    expect(result.themes[0].backboneItems[0].ribItems).toHaveLength(0);
    expect(result.themes[0].backboneItems[1].ribItems).toHaveLength(2);
  });

  it('batch moves ribs to a different release', () => {
    const r1 = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const r2 = makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [r1, r2])])],
      releaseCardOrder: { 'rel-A': ['r1', 'r2'] },
    });

    const result = captureUpdate(
      (update) => moveRibs2D(update, [
        { ribId: 'r1', fromThemeId: 't1', fromBackboneId: 'b1', fromReleaseId: 'rel-A' },
        { ribId: 'r2', fromThemeId: 't1', fromBackboneId: 'b1', fromReleaseId: 'rel-A' },
      ], { themeId: 't1', backboneId: 'b1', releaseId: 'rel-B', insertIndex: 0 }),
      product,
    );

    const rib1 = result.themes[0].backboneItems[0].ribItems[0];
    const rib2 = result.themes[0].backboneItems[0].ribItems[1];
    expect(rib1.releaseAllocations[0].releaseId).toBe('rel-B');
    expect(rib2.releaseAllocations[0].releaseId).toBe('rel-B');
    expect(result.releaseCardOrder['rel-A']).toEqual([]);
    expect(result.releaseCardOrder['rel-B']).toEqual(['r1', 'r2']);
  });

  it('batch moves ribs to different backbone AND release', () => {
    const r1 = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const r2 = makeRib('r2', [{ releaseId: 'rel-A', percentage: 50, memo: 'note' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [r1, r2]), makeBackbone('b2', [])])],
      releaseCardOrder: { 'rel-A': ['r1', 'r2'] },
    });

    const result = captureUpdate(
      (update) => moveRibs2D(update, [
        { ribId: 'r1', fromThemeId: 't1', fromBackboneId: 'b1', fromReleaseId: 'rel-A' },
        { ribId: 'r2', fromThemeId: 't1', fromBackboneId: 'b1', fromReleaseId: 'rel-A' },
      ], { themeId: 't1', backboneId: 'b2', releaseId: 'rel-B' }),
      product,
    );

    // Backbone changed
    expect(result.themes[0].backboneItems[0].ribItems).toHaveLength(0);
    expect(result.themes[0].backboneItems[1].ribItems).toHaveLength(2);
    // Release changed with preserved memo
    const movedR2 = result.themes[0].backboneItems[1].ribItems.find(r => r.id === 'r2');
    expect(movedR2.releaseAllocations[0].releaseId).toBe('rel-B');
    expect(movedR2.releaseAllocations[0].percentage).toBe(50);
    expect(movedR2.releaseAllocations[0].memo).toBe('note');
  });

  it('skips ribs that already have target release allocation', () => {
    const r1 = makeRib('r1', [{ releaseId: 'rel-A', percentage: 50, memo: '' }, { releaseId: 'rel-B', percentage: 50, memo: '' }]);
    const r2 = makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [r1, r2])])],
      releaseCardOrder: { 'rel-A': ['r1', 'r2'] },
    });

    const result = captureUpdate(
      (update) => moveRibs2D(update, [
        { ribId: 'r1', fromThemeId: 't1', fromBackboneId: 'b1', fromReleaseId: 'rel-A' },
        { ribId: 'r2', fromThemeId: 't1', fromBackboneId: 'b1', fromReleaseId: 'rel-A' },
      ], { themeId: 't1', backboneId: 'b1', releaseId: 'rel-B' }),
      product,
    );

    // r1 already had rel-B allocation, should be unchanged
    const updatedR1 = result.themes[0].backboneItems[0].ribItems[0];
    expect(updatedR1.releaseAllocations).toHaveLength(2);
    // r2 should have moved
    const updatedR2 = result.themes[0].backboneItems[0].ribItems[1];
    expect(updatedR2.releaseAllocations[0].releaseId).toBe('rel-B');
  });

  it('is a no-op with empty entries', () => {
    let called = false;
    const fakeUpdate = () => { called = true; };
    moveRibs2D(fakeUpdate, [], { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' });
    expect(called).toBe(false);
  });
});

// --- reorderTheme ---
describe('reorderTheme', () => {
  it('moves a theme to a new position', () => {
    const product = makeProduct({
      themes: [makeTheme('t1'), makeTheme('t2'), makeTheme('t3')],
    });

    const result = captureUpdate(
      (update) => reorderTheme(update, 't3', 0),
      product,
    );

    expect(result.themes.map(t => t.id)).toEqual(['t3', 't1', 't2']);
    expect(result.themes.map(t => t.order)).toEqual([1, 2, 3]);
  });

  it('moves a theme to the end', () => {
    const product = makeProduct({
      themes: [makeTheme('t1'), makeTheme('t2'), makeTheme('t3')],
    });

    const result = captureUpdate(
      (update) => reorderTheme(update, 't1', 2),
      product,
    );

    expect(result.themes.map(t => t.id)).toEqual(['t2', 't3', 't1']);
    expect(result.themes.map(t => t.order)).toEqual([1, 2, 3]);
  });

  it('returns prev if theme not found', () => {
    const product = makeProduct({
      themes: [makeTheme('t1')],
    });

    const result = captureUpdate(
      (update) => reorderTheme(update, 'nonexistent', 0),
      product,
    );

    expect(result).toBe(product);
  });

  it('appends to end when insertIndex is null', () => {
    const product = makeProduct({
      themes: [makeTheme('t1'), makeTheme('t2'), makeTheme('t3')],
    });

    const result = captureUpdate(
      (update) => reorderTheme(update, 't1', null),
      product,
    );

    expect(result.themes.map(t => t.id)).toEqual(['t2', 't3', 't1']);
  });

  it('handles negative insertIndex by appending to end', () => {
    const product = makeProduct({
      themes: [makeTheme('t1'), makeTheme('t2')],
    });

    const result = captureUpdate(
      (update) => reorderTheme(update, 't1', -1),
      product,
    );

    expect(result.themes.map(t => t.id)).toEqual(['t2', 't1']);
  });
});

// --- Card order placement (reorderRibInRelease + moveRib2D) ---
// These tests verify that releaseCardOrder is correctly maintained
// when the visual per-column insertIndex must be translated into
// the global per-release card order list.
describe('card order placement', () => {
  // Two backbones (b1, b2) in one theme, all ribs in rel-A.
  // Global card order for rel-A: [r1, r2, r3, r4]
  //   b1 has r1, r3  (visually indices 0, 1 in the column)
  //   b2 has r2, r4  (visually indices 0, 1 in the column)
  function twoColumnProduct() {
    return makeProduct({
      themes: [makeTheme('t1', [
        makeBackbone('b1', [
          makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          makeRib('r3', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
        ]),
        makeBackbone('b2', [
          makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          makeRib('r4', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
        ]),
      ])],
      releaseCardOrder: { 'rel-A': ['r1', 'r2', 'r3', 'r4'] },
    });
  }

  describe('reorderRibInRelease', () => {
    it('moves r3 before r1 in column b1 (insertIndex=0)', () => {
      const product = twoColumnProduct();
      // r3 is at visual index 1 in b1, move it to visual index 0
      const result = captureUpdate(
        (update) => reorderRibInRelease(update, 'r3', 'rel-A', 0, 'b1'),
        product,
      );
      const order = result.releaseCardOrder['rel-A'];
      // r3 should now be before r1 among b1 siblings
      const b1Ribs = order.filter(id => ['r1', 'r3'].includes(id));
      expect(b1Ribs).toEqual(['r3', 'r1']);
      // b2 ribs should be unchanged relative to each other
      const b2Ribs = order.filter(id => ['r2', 'r4'].includes(id));
      expect(b2Ribs).toEqual(['r2', 'r4']);
    });

    it('moves r1 after r3 in column b1 (insertIndex=1)', () => {
      const product = twoColumnProduct();
      // r1 is at visual index 0, move to visual index 1 (after r3)
      const result = captureUpdate(
        (update) => reorderRibInRelease(update, 'r1', 'rel-A', 1, 'b1'),
        product,
      );
      const order = result.releaseCardOrder['rel-A'];
      const b1Ribs = order.filter(id => ['r1', 'r3'].includes(id));
      expect(b1Ribs).toEqual(['r3', 'r1']);
    });

    it('insert at end of column (insertIndex = sibling count)', () => {
      // 3 ribs in b1: r1, r3, r5. Move r1 to end (insertIndex=2)
      const product = makeProduct({
        themes: [makeTheme('t1', [
          makeBackbone('b1', [
            makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
            makeRib('r3', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
            makeRib('r5', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          ]),
          makeBackbone('b2', [
            makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          ]),
        ])],
        releaseCardOrder: { 'rel-A': ['r1', 'r2', 'r3', 'r5'] },
      });

      const result = captureUpdate(
        (update) => reorderRibInRelease(update, 'r1', 'rel-A', 2, 'b1'),
        product,
      );
      const order = result.releaseCardOrder['rel-A'];
      const b1Ribs = order.filter(id => ['r1', 'r3', 'r5'].includes(id));
      expect(b1Ribs).toEqual(['r3', 'r5', 'r1']);
    });

    it('handles empty card order gracefully', () => {
      const product = makeProduct({
        themes: [makeTheme('t1', [
          makeBackbone('b1', [
            makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
            makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          ]),
        ])],
        releaseCardOrder: {},
      });

      const result = captureUpdate(
        (update) => reorderRibInRelease(update, 'r1', 'rel-A', 1, 'b1'),
        product,
      );
      // Should create an order with r1 after r2
      const order = result.releaseCardOrder['rel-A'];
      expect(order).toContain('r1');
    });
  });

  describe('moveRib2D card order', () => {
    it('places rib at correct position when moving to different column', () => {
      const product = twoColumnProduct();
      // Move r1 from b1 to b2 (same release), insertIndex=1 (after r2, before r4)
      const result = captureUpdate(
        (update) => moveRib2D(update, 'r1',
          { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
          { themeId: 't1', backboneId: 'b2', releaseId: 'rel-A', insertIndex: 1 },
        ),
        product,
      );
      const order = result.releaseCardOrder['rel-A'];
      // In b2 column, order should be: r2, r1, r4
      const b2Ribs = order.filter(id => ['r1', 'r2', 'r4'].includes(id));
      expect(b2Ribs).toEqual(['r2', 'r1', 'r4']);
    });

    it('places rib at start when moving to different column with insertIndex=0', () => {
      const product = twoColumnProduct();
      // Move r1 from b1 to b2, insertIndex=0 (before r2)
      const result = captureUpdate(
        (update) => moveRib2D(update, 'r1',
          { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
          { themeId: 't1', backboneId: 'b2', releaseId: 'rel-A', insertIndex: 0 },
        ),
        product,
      );
      const order = result.releaseCardOrder['rel-A'];
      const b2Ribs = order.filter(id => ['r1', 'r2', 'r4'].includes(id));
      expect(b2Ribs).toEqual(['r1', 'r2', 'r4']);
    });

    it('places rib at end when moving to different column with insertIndex=2', () => {
      const product = twoColumnProduct();
      // Move r1 from b1 to b2, insertIndex=2 (after both r2 and r4)
      const result = captureUpdate(
        (update) => moveRib2D(update, 'r1',
          { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
          { themeId: 't1', backboneId: 'b2', releaseId: 'rel-A', insertIndex: 2 },
        ),
        product,
      );
      const order = result.releaseCardOrder['rel-A'];
      const b2Ribs = order.filter(id => ['r1', 'r2', 'r4'].includes(id));
      expect(b2Ribs).toEqual(['r2', 'r4', 'r1']);
    });

    it('places rib correctly when moving to different release', () => {
      // r1 in rel-A/b1. Move to rel-B/b2 where r5 already exists, insertIndex=0
      const product = makeProduct({
        themes: [makeTheme('t1', [
          makeBackbone('b1', [
            makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          ]),
          makeBackbone('b2', [
            makeRib('r5', [{ releaseId: 'rel-B', percentage: 100, memo: '' }]),
          ]),
        ])],
        releaseCardOrder: { 'rel-A': ['r1'], 'rel-B': ['r5'] },
      });

      const result = captureUpdate(
        (update) => moveRib2D(update, 'r1',
          { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
          { themeId: 't1', backboneId: 'b2', releaseId: 'rel-B', insertIndex: 0 },
        ),
        product,
      );
      expect(result.releaseCardOrder['rel-A']).toEqual([]);
      const orderB = result.releaseCardOrder['rel-B'];
      const b2Ribs = orderB.filter(id => ['r1', 'r5'].includes(id));
      expect(b2Ribs).toEqual(['r1', 'r5']);
    });

    it('places rib correctly when destination has no card order yet', () => {
      // b2 has r2, r4 in rel-A but releaseCardOrder has no entry for rel-A
      const product = makeProduct({
        themes: [makeTheme('t1', [
          makeBackbone('b1', [
            makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          ]),
          makeBackbone('b2', [
            makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
            makeRib('r4', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          ]),
        ])],
        releaseCardOrder: {}, // no entries at all
      });

      const result = captureUpdate(
        (update) => moveRib2D(update, 'r1',
          { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
          { themeId: 't1', backboneId: 'b2', releaseId: 'rel-A', insertIndex: 1 },
        ),
        product,
      );
      const order = result.releaseCardOrder['rel-A'];
      // r1 should be in the card order
      expect(order).toContain('r1');
    });

    it('places rib after existing when moving to different release with insertIndex=1', () => {
      const product = makeProduct({
        themes: [makeTheme('t1', [
          makeBackbone('b1', [
            makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          ]),
          makeBackbone('b2', [
            makeRib('r5', [{ releaseId: 'rel-B', percentage: 100, memo: '' }]),
          ]),
        ])],
        releaseCardOrder: { 'rel-A': ['r1'], 'rel-B': ['r5'] },
      });

      const result = captureUpdate(
        (update) => moveRib2D(update, 'r1',
          { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
          { themeId: 't1', backboneId: 'b2', releaseId: 'rel-B', insertIndex: 1 },
        ),
        product,
      );
      const orderB = result.releaseCardOrder['rel-B'];
      const b2Ribs = orderB.filter(id => ['r1', 'r5'].includes(id));
      expect(b2Ribs).toEqual(['r5', 'r1']);
    });
  });
});

// --- End-to-end: layout → insertIndex → mutation → layout → verify ---
// These tests simulate the full drag flow to catch any mismatches between
// the visual insertion indicator and the actual card placement.
describe('end-to-end rib drag placement', () => {
  // Helper to extract cell Y positions for a backbone in a release from layout
  function getCellOrder(layout, backboneId, releaseId) {
    return layout.cells
      .filter(c => c.backboneId === backboneId && c.releaseId === releaseId)
      .sort((a, b) => a.y - b.y)
      .map(c => c.id);
  }

  function e2eProduct() {
    // Two backbones, 3 ribs in b1 and 2 ribs in b2, all in rel-A
    return makeProduct({
      themes: [makeTheme('t1', [
        makeBackbone('b1', [
          makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          makeRib('r3', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
        ]),
        makeBackbone('b2', [
          makeRib('r4', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          makeRib('r5', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
        ]),
      ])],
      releases: [{ id: 'rel-A', name: 'Release A', order: 1 }],
      releaseCardOrder: { 'rel-A': ['r1', 'r2', 'r3', 'r4', 'r5'] },
    });
  }

  it('reorder: move r1 to after r3 in b1 (last position)', () => {
    const product = e2eProduct();
    const layout1 = computeLayout(product);

    // r1, r2, r3 are in b1. We want to move r1 to after r3 (insertIndex=2).
    // Compute the Y position that would give insertIndex=2: below r3's midpoint
    const b1Cells = layout1.cells
      .filter(c => c.backboneId === 'b1' && c.releaseId === 'rel-A')
      .sort((a, b) => a.y - b.y);
    const lastCellY = b1Cells[b1Cells.length - 1].y + CELL_HEIGHT; // below last cell
    const insertIndex = computeInsertIndex(
      layout1.cells, 'b1', 'rel-A', new Set(['r1']), lastCellY,
    );
    expect(insertIndex).toBe(2); // after r2 and r3 (excluding r1)

    // Commit the reorder
    const result = captureUpdate(
      (update) => reorderRibInRelease(update, 'r1', 'rel-A', insertIndex, 'b1'),
      product,
    );

    // Verify layout reflects the change
    const layout2 = computeLayout(result);
    expect(getCellOrder(layout2, 'b1', 'rel-A')).toEqual(['r2', 'r3', 'r1']);
    // b2 should be unchanged
    expect(getCellOrder(layout2, 'b2', 'rel-A')).toEqual(['r4', 'r5']);
  });

  it('reorder: move r3 to before r1 in b1 (first position)', () => {
    const product = e2eProduct();
    const layout1 = computeLayout(product);

    const lane = layout1.releaseLanes[0];
    const insertIndex = computeInsertIndex(
      layout1.cells, 'b1', 'rel-A', new Set(['r3']), lane.y, // above all cells
    );
    expect(insertIndex).toBe(0);

    const result = captureUpdate(
      (update) => reorderRibInRelease(update, 'r3', 'rel-A', insertIndex, 'b1'),
      product,
    );

    const layout2 = computeLayout(result);
    expect(getCellOrder(layout2, 'b1', 'rel-A')).toEqual(['r3', 'r1', 'r2']);
  });

  it('cross-column: move r1 from b1 to end of b2', () => {
    const product = e2eProduct();
    const layout1 = computeLayout(product);

    // Compute insertIndex for end of b2 column
    const b2Cells = layout1.cells
      .filter(c => c.backboneId === 'b2' && c.releaseId === 'rel-A')
      .sort((a, b) => a.y - b.y);
    const belowLast = b2Cells[b2Cells.length - 1].y + CELL_HEIGHT;
    const insertIndex = computeInsertIndex(
      layout1.cells, 'b2', 'rel-A', new Set(['r1']), belowLast,
    );
    expect(insertIndex).toBe(2); // after r4 and r5

    const result = captureUpdate(
      (update) => moveRib2D(update, 'r1',
        { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
        { themeId: 't1', backboneId: 'b2', releaseId: 'rel-A', insertIndex },
      ),
      product,
    );

    const layout2 = computeLayout(result);
    expect(getCellOrder(layout2, 'b1', 'rel-A')).toEqual(['r2', 'r3']);
    expect(getCellOrder(layout2, 'b2', 'rel-A')).toEqual(['r4', 'r5', 'r1']);
  });

  it('cross-column: move r1 from b1 to start of b2', () => {
    const product = e2eProduct();
    const layout1 = computeLayout(product);

    const lane = layout1.releaseLanes[0];
    const insertIndex = computeInsertIndex(
      layout1.cells, 'b2', 'rel-A', new Set(['r1']), lane.y,
    );
    expect(insertIndex).toBe(0);

    const result = captureUpdate(
      (update) => moveRib2D(update, 'r1',
        { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
        { themeId: 't1', backboneId: 'b2', releaseId: 'rel-A', insertIndex },
      ),
      product,
    );

    const layout2 = computeLayout(result);
    expect(getCellOrder(layout2, 'b2', 'rel-A')).toEqual(['r1', 'r4', 'r5']);
  });

  it('cross-column: move r1 from b1 to middle of b2', () => {
    const product = e2eProduct();
    const layout1 = computeLayout(product);

    // Between r4 and r5: above r5 midpoint, below r4 midpoint
    const b2Cells = layout1.cells
      .filter(c => c.backboneId === 'b2' && c.releaseId === 'rel-A')
      .sort((a, b) => a.y - b.y);
    const betweenY = b2Cells[0].y + CELL_HEIGHT + CELL_GAP / 2; // between r4 and r5
    const insertIndex = computeInsertIndex(
      layout1.cells, 'b2', 'rel-A', new Set(['r1']), betweenY,
    );
    expect(insertIndex).toBe(1); // after r4, before r5

    const result = captureUpdate(
      (update) => moveRib2D(update, 'r1',
        { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
        { themeId: 't1', backboneId: 'b2', releaseId: 'rel-A', insertIndex },
      ),
      product,
    );

    const layout2 = computeLayout(result);
    expect(getCellOrder(layout2, 'b2', 'rel-A')).toEqual(['r4', 'r1', 'r5']);
  });

  it('sparse card order: reorder r3 to position 0 in b1 when no card order exists', () => {
    // This is the critical case: releaseCardOrder is empty, so layout uses
    // default iteration order (r1, r2, r3). Reorder r3 to position 0.
    // After the mutation, the card order should reflect r3, r1, r2 — and
    // ALL sibling ribs should be in the order (not just r3).
    const product = makeProduct({
      themes: [makeTheme('t1', [
        makeBackbone('b1', [
          makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          makeRib('r3', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
        ]),
      ])],
      releases: [{ id: 'rel-A', name: 'Release A', order: 1 }],
      releaseCardOrder: {}, // empty!
    });

    const layout1 = computeLayout(product);
    // Default order should be r1, r2, r3
    expect(getCellOrder(layout1, 'b1', 'rel-A')).toEqual(['r1', 'r2', 'r3']);

    const result = captureUpdate(
      (update) => reorderRibInRelease(update, 'r3', 'rel-A', 0, 'b1'),
      product,
    );

    const layout2 = computeLayout(result);
    expect(getCellOrder(layout2, 'b1', 'rel-A')).toEqual(['r3', 'r1', 'r2']);
  });

  it('sparse card order: move r1 cross-column when no card order exists', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [
        makeBackbone('b1', [
          makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
        ]),
        makeBackbone('b2', [
          makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          makeRib('r3', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
        ]),
      ])],
      releases: [{ id: 'rel-A', name: 'Release A', order: 1 }],
      releaseCardOrder: {}, // empty!
    });

    const layout1 = computeLayout(product);
    expect(getCellOrder(layout1, 'b2', 'rel-A')).toEqual(['r2', 'r3']);

    // Move r1 between r2 and r3 in b2
    const result = captureUpdate(
      (update) => moveRib2D(update, 'r1',
        { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
        { themeId: 't1', backboneId: 'b2', releaseId: 'rel-A', insertIndex: 1 },
      ),
      product,
    );

    const layout2 = computeLayout(result);
    expect(getCellOrder(layout2, 'b2', 'rel-A')).toEqual(['r2', 'r1', 'r3']);
  });

  it('cross-release: move r1 to rel-B with existing ribs', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [
        makeBackbone('b1', [
          makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
          makeRib('r2', [{ releaseId: 'rel-A', percentage: 100, memo: '' }]),
        ]),
        makeBackbone('b2', [
          makeRib('r3', [{ releaseId: 'rel-B', percentage: 100, memo: '' }]),
          makeRib('r4', [{ releaseId: 'rel-B', percentage: 100, memo: '' }]),
        ]),
      ])],
      releases: [
        { id: 'rel-A', name: 'Release A', order: 1 },
        { id: 'rel-B', name: 'Release B', order: 2 },
      ],
      releaseCardOrder: { 'rel-A': ['r1', 'r2'], 'rel-B': ['r3', 'r4'] },
    });

    const layout1 = computeLayout(product);

    // Move r1 to b2/rel-B, after r3 but before r4
    const b2Cells = layout1.cells
      .filter(c => c.backboneId === 'b2' && c.releaseId === 'rel-B')
      .sort((a, b) => a.y - b.y);
    const betweenY = b2Cells[0].y + CELL_HEIGHT + CELL_GAP / 2;
    const insertIndex = computeInsertIndex(
      layout1.cells, 'b2', 'rel-B', new Set(['r1']), betweenY,
    );
    expect(insertIndex).toBe(1);

    const result = captureUpdate(
      (update) => moveRib2D(update, 'r1',
        { themeId: 't1', backboneId: 'b1', releaseId: 'rel-A' },
        { themeId: 't1', backboneId: 'b2', releaseId: 'rel-B', insertIndex },
      ),
      product,
    );

    const layout2 = computeLayout(result);
    expect(getCellOrder(layout2, 'b2', 'rel-B')).toEqual(['r3', 'r1', 'r4']);
  });
});
