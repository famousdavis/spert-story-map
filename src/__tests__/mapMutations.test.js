import { describe, it, expect } from 'vitest';
import { moveRibToRelease, reorderRibInRelease, moveRibToBackbone, moveBackboneToTheme } from '../components/storymap/mapMutations';

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
