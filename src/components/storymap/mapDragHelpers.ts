// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product } from '../../types';
import { moveRib2D, moveRibs2D, reorderRibInRelease, moveBackboneToTheme, reorderTheme, reorderRelease } from './mapMutations';
import { CELL_HEIGHT, COL_WIDTH } from './useMapLayout';

type UpdateProduct = (updater: (prev: Product) => Product) => void;

interface MapPoint { x: number; y: number }

interface RibDragState {
  dragType: 'rib';
  ribId: string;
  themeId: string;
  backboneId: string;
  releaseId: string | null;
  selectedIds: Set<string> | null;
  startScreenX: number;
  startScreenY: number;
  startMapX: number;
  startMapY: number;
  currentMapX: number;
  currentMapY: number;
  screenX: number;
  screenY: number;
  targetReleaseId: string | null | undefined;
  targetBackboneId: string | null;
  targetThemeId: string | null;
  insertIndex: number | null;
  isDragging: boolean;
  mapContainerRect: DOMRect;
}

interface BackboneDragState {
  dragType: 'backbone';
  backboneId: string;
  themeId: string;
  startScreenX: number;
  startScreenY: number;
  currentMapX: number;
  currentMapY: number;
  targetThemeId: string;
  insertIndex: number;
  isDragging: boolean;
}

interface ThemeDragState {
  dragType: 'theme';
  themeId: string;
  startScreenX: number;
  startScreenY: number;
  currentMapX: number;
  currentMapY: number;
  insertIndex: number | null;
  isDragging: boolean;
}

interface LayoutCell {
  id: string;
  themeId: string;
  backboneId: string;
  releaseId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Column {
  backboneId: string;
  themeId: string;
  x: number;
  width: number;
}

interface ThemeSpan {
  themeId: string;
  x: number;
  width: number;
}

/**
 * Pure helper functions for drag-and-drop state computation and commit.
 * Extracted from useMapDrag.ts — no hooks, no closures over component state.
 */

export function buildRibMoveState(
  prev: RibDragState,
  mapPos: MapPoint,
  screenX: number,
  screenY: number,
  findReleaseLane: (y: number) => { releaseId: string | null } | null,
  findColumn: (x: number) => { backboneId: string; themeId: string } | null,
  cells: LayoutCell[],
): RibDragState {
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
    // `?? null` bridges the drag state's `string | null | undefined` to the
    // `string | null` the helper declares; both mean "no target release".
    cells, targetBackboneId, targetReleaseId ?? null, excludeIds, mapPos.y,
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

export function buildBackboneMoveState(
  prev: BackboneDragState,
  mapPos: MapPoint,
  findThemeSpan: (x: number) => ThemeSpan | null,
  columns: Column[],
): BackboneDragState {
  const ts = findThemeSpan(mapPos.x);
  const targetThemeId = ts ? ts.themeId : prev.targetThemeId;

  // Compute insertion index among columns in the target theme (excluding the dragged backbone)
  const themeCols = columns
    .filter(c => c.themeId === targetThemeId && c.backboneId !== prev.backboneId)
    .sort((a, b) => a.x - b.x);

  let insertIndex = themeCols.length; // default: append at end
  for (const [i, col] of themeCols.entries()) {
    const colMid = col.x + COL_WIDTH / 2;
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

export function computeInsertIndex(cells: LayoutCell[], backboneId: string | null, releaseId: string | null, excludeIds: Set<string>, mapY: number): number | null {
  if (!backboneId) return null;
  const laneCells = cells
    .filter(c =>
      c.backboneId === backboneId &&
      (releaseId === null ? c.releaseId === null : c.releaseId === releaseId) &&
      !excludeIds.has(c.id)
    )
    .sort((a, b) => a.y - b.y);

  if (laneCells.length === 0) return 0;

  for (const [i, cell] of laneCells.entries()) {
    const cellMid = cell.y + CELL_HEIGHT / 2;
    if (mapY < cellMid) return i;
  }
  return laneCells.length;
}

export function commitRibDrag(state: RibDragState, updateProduct: UpdateProduct, layoutCells: LayoutCell[]): void {
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

export function commitBackboneDrag(state: BackboneDragState, updateProduct: UpdateProduct): void {
  const { backboneId, themeId, targetThemeId, insertIndex } = state;
  if (!targetThemeId) return;

  // Cross-theme move or same-theme reorder
  moveBackboneToTheme(updateProduct, backboneId, themeId, targetThemeId, insertIndex);
}

export function buildThemeMoveState(prev: ThemeDragState, mapPos: MapPoint, themeSpans: ThemeSpan[]): ThemeDragState {
  // Compute insertion index among themes (excluding the dragged theme)
  const otherSpans = themeSpans
    .filter(ts => ts.themeId !== prev.themeId)
    .sort((a, b) => a.x - b.x);

  let insertIndex = otherSpans.length; // default: append at end
  for (const [i, span] of otherSpans.entries()) {
    const spanMid = span.x + span.width / 2;
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

export function commitThemeDrag(state: ThemeDragState, updateProduct: UpdateProduct): void {
  const { themeId, insertIndex } = state;
  if (insertIndex == null) return;
  reorderTheme(updateProduct, themeId, insertIndex);
}

// --- Release drag (Y-axis reorder) ---

interface ReleaseLane {
  releaseId: string;
  releaseName: string;
  y: number;
  height: number;
}

interface ReleaseDragState {
  dragType: 'release';
  releaseId: string;
  startScreenX: number;
  startScreenY: number;
  currentMapX: number;
  currentMapY: number;
  insertIndex: number | null;
  isDragging: boolean;
  mapContainerRect: DOMRect;
}

export function buildReleaseMoveState(prev: ReleaseDragState, mapPos: MapPoint, releaseLanes: ReleaseLane[]): ReleaseDragState {
  // Compute insertion index among releases (excluding the dragged release)
  const otherLanes = releaseLanes
    .filter(l => l.releaseId !== prev.releaseId)
    .sort((a, b) => a.y - b.y);

  let insertIndex = otherLanes.length; // default: append at end
  for (const [i, otherLane] of otherLanes.entries()) {
    const laneMid = otherLane.y + otherLane.height / 2;
    if (mapPos.y < laneMid) {
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

export function commitReleaseDrag(state: ReleaseDragState, updateProduct: UpdateProduct): void {
  const { releaseId, insertIndex } = state;
  if (insertIndex == null) return;
  reorderRelease(updateProduct, releaseId, insertIndex);
}
