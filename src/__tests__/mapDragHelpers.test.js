import { describe, it, expect, vi } from 'vitest';
import {
  computeInsertIndex,
  buildRibMoveState,
  buildBackboneMoveState,
  buildThemeMoveState,
  commitRibDrag,
  commitBackboneDrag,
  commitThemeDrag,
} from '../components/storymap/mapDragHelpers';

// CELL_HEIGHT = 52, COL_WIDTH = 200 from useMapLayout constants

describe('computeInsertIndex', () => {
  it('returns null if backboneId is null', () => {
    expect(computeInsertIndex([], null, 'rel-1', new Set(), 100)).toBeNull();
  });

  it('returns 0 for empty lane', () => {
    expect(computeInsertIndex([], 'b1', 'rel-1', new Set(), 100)).toBe(0);
  });

  it('returns 0 when mapY is above all cells', () => {
    const cells = [
      { id: 'r1', backboneId: 'b1', releaseId: 'rel-1', y: 100 },
      { id: 'r2', backboneId: 'b1', releaseId: 'rel-1', y: 160 },
    ];
    // Cell mid of r1 = 100 + 26 = 126. mapY=50 is above that.
    expect(computeInsertIndex(cells, 'b1', 'rel-1', new Set(), 50)).toBe(0);
  });

  it('returns correct index between cells', () => {
    const cells = [
      { id: 'r1', backboneId: 'b1', releaseId: 'rel-1', y: 0 },   // mid = 26
      { id: 'r2', backboneId: 'b1', releaseId: 'rel-1', y: 58 },  // mid = 84
    ];
    expect(computeInsertIndex(cells, 'b1', 'rel-1', new Set(), 50)).toBe(1);
  });

  it('returns length when mapY is below all cells', () => {
    const cells = [
      { id: 'r1', backboneId: 'b1', releaseId: 'rel-1', y: 0 },   // mid = 26
      { id: 'r2', backboneId: 'b1', releaseId: 'rel-1', y: 58 },  // mid = 84
    ];
    expect(computeInsertIndex(cells, 'b1', 'rel-1', new Set(), 200)).toBe(2);
  });

  it('excludes cells in excludeIds', () => {
    const cells = [
      { id: 'r1', backboneId: 'b1', releaseId: 'rel-1', y: 0 },
      { id: 'r2', backboneId: 'b1', releaseId: 'rel-1', y: 58 },
      { id: 'r3', backboneId: 'b1', releaseId: 'rel-1', y: 116 },
    ];
    // Exclude r2 — remaining are r1 (y=0, mid=26) and r3 (y=116, mid=142)
    expect(computeInsertIndex(cells, 'b1', 'rel-1', new Set(['r2']), 50)).toBe(1);
  });

  it('filters by backbone and release', () => {
    const cells = [
      { id: 'r1', backboneId: 'b1', releaseId: 'rel-1', y: 0 },
      { id: 'r2', backboneId: 'b2', releaseId: 'rel-1', y: 0 },   // wrong backbone
      { id: 'r3', backboneId: 'b1', releaseId: 'rel-2', y: 58 },  // wrong release
    ];
    // Only r1 matches b1 + rel-1
    expect(computeInsertIndex(cells, 'b1', 'rel-1', new Set(), 200)).toBe(1);
  });

  it('handles null releaseId (unassigned)', () => {
    const cells = [
      { id: 'r1', backboneId: 'b1', releaseId: null, y: 0 },
      { id: 'r2', backboneId: 'b1', releaseId: 'rel-1', y: 58 },  // has release, excluded
    ];
    expect(computeInsertIndex(cells, 'b1', null, new Set(), 200)).toBe(1);
  });
});

describe('buildRibMoveState', () => {
  const basePrev = {
    ribId: 'r1',
    themeId: 't1',
    backboneId: 'b1',
    releaseId: 'rel-1',
    targetReleaseId: undefined,
    targetBackboneId: null,
    targetThemeId: null,
    selectedIds: null,
  };

  it('updates targets from lane and column hit tests', () => {
    const findLane = () => ({ releaseId: 'rel-2', releaseName: 'Release 2' });
    const findCol = () => ({ backboneId: 'b2', themeId: 't1' });
    const result = buildRibMoveState(basePrev, { x: 300, y: 150 }, 300, 150, findLane, findCol, []);
    expect(result.targetReleaseId).toBe('rel-2');
    expect(result.targetBackboneId).toBe('b2');
    expect(result.targetThemeId).toBe('t1');
    expect(result.isDragging).toBe(true);
  });

  it('preserves previous targets when hit tests return null', () => {
    const prev = { ...basePrev, targetReleaseId: 'rel-2', targetBackboneId: 'b2', targetThemeId: 't1' };
    const result = buildRibMoveState(prev, { x: 300, y: 150 }, 300, 150, () => null, () => null, []);
    expect(result.targetReleaseId).toBe('rel-2');
    expect(result.targetBackboneId).toBe('b2');
  });

  it('uses selectedIds for exclusion when multi-selecting', () => {
    const prev = { ...basePrev, selectedIds: new Set(['r1', 'r2']) };
    const cells = [
      { id: 'r1', backboneId: 'b1', releaseId: 'rel-1', y: 0 },
      { id: 'r2', backboneId: 'b1', releaseId: 'rel-1', y: 58 },
      { id: 'r3', backboneId: 'b1', releaseId: 'rel-1', y: 116 },
    ];
    const findLane = () => ({ releaseId: 'rel-1' });
    const findCol = () => ({ backboneId: 'b1', themeId: 't1' });
    const result = buildRibMoveState(prev, { x: 100, y: 200 }, 100, 200, findLane, findCol, cells);
    // Only r3 is not excluded, so insertIndex should be 1 (after r3)
    expect(result.insertIndex).toBe(1);
  });
});

describe('buildBackboneMoveState', () => {
  const basePrev = { backboneId: 'b1', targetThemeId: 't1' };

  it('computes insert index among theme columns', () => {
    const findThemeSpan = () => ({ themeId: 't1' });
    const columns = [
      { themeId: 't1', backboneId: 'b2', x: 0 },   // mid = 100
      { themeId: 't1', backboneId: 'b3', x: 204 },  // mid = 304
    ];
    // mapPos.x = 50 is before b2 mid (100) → insertIndex 0
    const result = buildBackboneMoveState(basePrev, { x: 50, y: 0 }, findThemeSpan, columns);
    expect(result.insertIndex).toBe(0);
  });

  it('appends at end when past all columns', () => {
    const findThemeSpan = () => ({ themeId: 't1' });
    const columns = [
      { themeId: 't1', backboneId: 'b2', x: 0 },
    ];
    const result = buildBackboneMoveState(basePrev, { x: 500, y: 0 }, findThemeSpan, columns);
    expect(result.insertIndex).toBe(1);
  });

  it('excludes the dragged backbone from insert computation', () => {
    const findThemeSpan = () => ({ themeId: 't1' });
    const columns = [
      { themeId: 't1', backboneId: 'b1', x: 0 },   // dragged, excluded
      { themeId: 't1', backboneId: 'b2', x: 204 },
    ];
    const result = buildBackboneMoveState(basePrev, { x: 500, y: 0 }, findThemeSpan, columns);
    // Only b2 remains, so inserting after it = index 1
    expect(result.insertIndex).toBe(1);
  });
});

describe('buildThemeMoveState', () => {
  it('computes insert index among other themes', () => {
    const prev = { themeId: 't2' };
    const spans = [
      { themeId: 't1', x: 0, width: 400 },     // mid = 200
      { themeId: 't2', x: 404, width: 200 },    // dragged, excluded
      { themeId: 't3', x: 608, width: 400 },    // mid = 808
    ];
    // mapPos.x = 500 is after t1 mid (200) but before t3 mid (808) → insert at 1
    const result = buildThemeMoveState(prev, { x: 500, y: 0 }, spans);
    expect(result.insertIndex).toBe(1);
  });

  it('inserts at 0 when before all themes', () => {
    const prev = { themeId: 't2' };
    const spans = [
      { themeId: 't1', x: 200, width: 400 },    // mid = 400
      { themeId: 't2', x: 604, width: 200 },    // dragged
    ];
    const result = buildThemeMoveState(prev, { x: 50, y: 0 }, spans);
    expect(result.insertIndex).toBe(0);
  });
});

describe('commitRibDrag', () => {
  it('is a no-op when nothing changed and no insertIndex', () => {
    const updateProduct = vi.fn();
    commitRibDrag({
      ribId: 'r1', themeId: 't1', backboneId: 'b1', releaseId: 'rel-1',
      targetReleaseId: 'rel-1', targetBackboneId: 'b1', targetThemeId: 't1',
    }, updateProduct, []);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('reorders within same lane when insertIndex is set', () => {
    const updateProduct = vi.fn();
    commitRibDrag({
      ribId: 'r1', themeId: 't1', backboneId: 'b1', releaseId: 'rel-1',
      targetReleaseId: 'rel-1', targetBackboneId: 'b1', targetThemeId: 't1',
      insertIndex: 2, selectedIds: null,
    }, updateProduct, []);
    expect(updateProduct).toHaveBeenCalled();
  });

  it('is a no-op when targetReleaseId is undefined (never set)', () => {
    const updateProduct = vi.fn();
    commitRibDrag({
      ribId: 'r1', themeId: 't1', backboneId: 'b1', releaseId: 'rel-1',
      targetReleaseId: undefined, targetBackboneId: null,
    }, updateProduct, []);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('calls updateProduct when release changed', () => {
    const updateProduct = vi.fn();
    commitRibDrag({
      ribId: 'r1', themeId: 't1', backboneId: 'b1', releaseId: 'rel-1',
      targetReleaseId: 'rel-2', targetBackboneId: 'b1', targetThemeId: 't1',
      insertIndex: 0, selectedIds: null,
    }, updateProduct, []);
    expect(updateProduct).toHaveBeenCalled();
  });

  it('calls updateProduct when backbone changed', () => {
    const updateProduct = vi.fn();
    commitRibDrag({
      ribId: 'r1', themeId: 't1', backboneId: 'b1', releaseId: 'rel-1',
      targetReleaseId: 'rel-1', targetBackboneId: 'b2', targetThemeId: 't1',
      insertIndex: 0, selectedIds: null,
    }, updateProduct, []);
    expect(updateProduct).toHaveBeenCalled();
  });
});

describe('commitBackboneDrag', () => {
  it('is a no-op when targetThemeId is null', () => {
    const updateProduct = vi.fn();
    commitBackboneDrag({ backboneId: 'b1', themeId: 't1', targetThemeId: null, insertIndex: 0 }, updateProduct);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('calls updateProduct when targetThemeId is set', () => {
    const updateProduct = vi.fn();
    commitBackboneDrag({ backboneId: 'b1', themeId: 't1', targetThemeId: 't2', insertIndex: 0 }, updateProduct);
    expect(updateProduct).toHaveBeenCalled();
  });
});

describe('commitThemeDrag', () => {
  it('is a no-op when insertIndex is null', () => {
    const updateProduct = vi.fn();
    commitThemeDrag({ themeId: 't1', insertIndex: null }, updateProduct);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('calls updateProduct when insertIndex is set', () => {
    const updateProduct = vi.fn();
    commitThemeDrag({ themeId: 't1', insertIndex: 2 }, updateProduct);
    expect(updateProduct).toHaveBeenCalled();
  });

  it('calls updateProduct when insertIndex is 0', () => {
    const updateProduct = vi.fn();
    commitThemeDrag({ themeId: 't1', insertIndex: 0 }, updateProduct);
    expect(updateProduct).toHaveBeenCalled();
  });
});
