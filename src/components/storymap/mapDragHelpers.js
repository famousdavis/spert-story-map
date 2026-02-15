import { moveRib2D, moveRibs2D, reorderRibInRelease, moveBackboneToTheme, reorderTheme } from './mapMutations';
import { CELL_HEIGHT, COL_WIDTH } from './useMapLayout';

/**
 * Pure helper functions for drag-and-drop state computation and commit.
 * Extracted from useMapDrag.js — no hooks, no closures over component state.
 */

export function buildRibMoveState(prev, mapPos, screenX, screenY, findReleaseLane, findColumn, cells) {
  let targetReleaseId = prev.targetReleaseId;
  let targetBackboneId = prev.targetBackboneId;
  let targetThemeId = prev.targetThemeId;

  // Track both axes simultaneously for free-form 2D drags
  const lane = findReleaseLane(mapPos.y);
  if (lane) targetReleaseId = lane.releaseId;

  const col = findColumn(mapPos.x);
  if (col) {
    targetBackboneId = col.backboneId;
    targetThemeId = col.themeId;
  }

  // Compute insertion index — exclude all dragged IDs from existing cells
  const excludeIds = prev.selectedIds || new Set([prev.ribId]);
  const insertIndex = computeInsertIndex(
    cells, targetBackboneId, targetReleaseId, excludeIds, mapPos.y,
  );

  return {
    ...prev,
    currentMapX: mapPos.x,
    currentMapY: mapPos.y,
    screenX,
    screenY,
    targetReleaseId,
    targetBackboneId,
    targetThemeId,
    insertIndex,
    isDragging: true,
  };
}

export function buildBackboneMoveState(prev, mapPos, findThemeSpan, columns) {
  const ts = findThemeSpan(mapPos.x);
  const targetThemeId = ts ? ts.themeId : prev.targetThemeId;

  // Compute insertion index among columns in the target theme (excluding the dragged backbone)
  const themeCols = columns
    .filter(c => c.themeId === targetThemeId && c.backboneId !== prev.backboneId)
    .sort((a, b) => a.x - b.x);

  let insertIndex = themeCols.length; // default: append at end
  for (let i = 0; i < themeCols.length; i++) {
    const colMid = themeCols[i].x + COL_WIDTH / 2;
    if (mapPos.x < colMid) {
      insertIndex = i;
      break;
    }
  }

  return {
    ...prev,
    currentMapX: mapPos.x,
    currentMapY: mapPos.y,
    targetThemeId,
    insertIndex,
    isDragging: true,
  };
}

export function computeInsertIndex(cells, backboneId, releaseId, excludeIds, mapY) {
  if (!backboneId) return null;
  const laneCells = cells
    .filter(c =>
      c.backboneId === backboneId &&
      (releaseId === null ? c.releaseId === null : c.releaseId === releaseId) &&
      !excludeIds.has(c.id)
    )
    .sort((a, b) => a.y - b.y);

  if (laneCells.length === 0) return 0;

  for (let i = 0; i < laneCells.length; i++) {
    const cellMid = laneCells[i].y + CELL_HEIGHT / 2;
    if (mapY < cellMid) return i;
  }
  return laneCells.length;
}

export function commitRibDrag(state, updateProduct, layoutCells) {
  const { ribId, themeId, backboneId, releaseId, targetReleaseId, targetBackboneId, targetThemeId, insertIndex, selectedIds } = state;

  const releaseChanged = targetReleaseId !== undefined && targetReleaseId !== releaseId;
  const backboneChanged = targetBackboneId && targetBackboneId !== backboneId;

  // Same lane reorder — just update card order within this release
  if (!releaseChanged && !backboneChanged) {
    if (insertIndex != null && targetReleaseId !== undefined) {
      reorderRibInRelease(updateProduct, ribId, targetReleaseId, insertIndex, backboneId);
    }
    return;
  }

  const to = {
    themeId: targetThemeId || themeId,
    backboneId: targetBackboneId || backboneId,
    releaseId: releaseChanged ? targetReleaseId : releaseId,
    insertIndex,
  };

  // Bulk move if multi-selected
  if (selectedIds && selectedIds.size > 1) {
    const entries = [];
    for (const id of selectedIds) {
      const cell = layoutCells.find(c => c.id === id);
      if (cell) {
        entries.push({
          ribId: id,
          fromThemeId: cell.themeId,
          fromBackboneId: cell.backboneId,
          fromReleaseId: cell.releaseId,
        });
      }
    }
    moveRibs2D(updateProduct, entries, to);
  } else {
    moveRib2D(updateProduct, ribId,
      { themeId, backboneId, releaseId },
      to,
    );
  }
}

export function commitBackboneDrag(state, updateProduct) {
  const { backboneId, themeId, targetThemeId, insertIndex } = state;
  if (!targetThemeId) return;

  // Cross-theme move or same-theme reorder
  moveBackboneToTheme(updateProduct, backboneId, themeId, targetThemeId, insertIndex);
}

export function buildThemeMoveState(prev, mapPos, themeSpans) {
  // Compute insertion index among themes (excluding the dragged theme)
  const otherSpans = themeSpans
    .filter(ts => ts.themeId !== prev.themeId)
    .sort((a, b) => a.x - b.x);

  let insertIndex = otherSpans.length; // default: append at end
  for (let i = 0; i < otherSpans.length; i++) {
    const spanMid = otherSpans[i].x + otherSpans[i].width / 2;
    if (mapPos.x < spanMid) {
      insertIndex = i;
      break;
    }
  }

  return {
    ...prev,
    currentMapX: mapPos.x,
    currentMapY: mapPos.y,
    insertIndex,
    isDragging: true,
  };
}

export function commitThemeDrag(state, updateProduct) {
  const { themeId, insertIndex } = state;
  if (insertIndex == null) return;
  reorderTheme(updateProduct, themeId, insertIndex);
}
