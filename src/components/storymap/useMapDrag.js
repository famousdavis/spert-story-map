import { useState, useCallback, useRef, useEffect } from 'react';
import { moveRib2D, moveRibs2D, moveBackboneToTheme, reorderTheme } from './mapMutations';
import { CELL_HEIGHT, CELL_GAP, COL_WIDTH, COL_GAP } from './useMapLayout';

/**
 * Hook for drag-and-drop on the story map.
 *
 * Supports three operations:
 * 1. Drag rib to a different release lane (Y-axis) — changes allocation
 * 2. Drag rib to a different backbone column (X-axis) — moves rib to new backbone
 * 3. Drag backbone to a different theme (X-axis) — moves backbone + all ribs
 *
 * Uses pointer events (not HTML5 DnD) to work with CSS zoom/pan transforms.
 * Rib drags are free-form (2D) — both release and backbone targets update continuously.
 */

const DRAG_THRESHOLD = 8; // pixels before committing to drag

export default function useMapDrag({ layout, zoom, pan, updateProduct, selectedIds }) {
  const [dragState, setDragState] = useState(null);
  const dragRef = useRef(null);

  // Keep current zoom/pan in refs so screenToMap always uses latest values
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // Convert screen coords to map (logical) coords
  const screenToMap = useCallback((screenX, screenY, mapContainerRect) => ({
    x: (screenX - mapContainerRect.left - panRef.current.x) / zoomRef.current,
    y: (screenY - mapContainerRect.top - panRef.current.y) / zoomRef.current,
  }), []);

  // Hit-test helpers
  const findReleaseLane = useCallback((mapY) => {
    for (const lane of layout.releaseLanes) {
      if (mapY >= lane.y && mapY < lane.y + lane.height) {
        return { releaseId: lane.releaseId, releaseName: lane.releaseName };
      }
    }
    const { unassignedLane } = layout;
    if (unassignedLane && mapY >= unassignedLane.y && mapY < unassignedLane.y + unassignedLane.height) {
      return { releaseId: null, releaseName: 'Unassigned' };
    }
    return null;
  }, [layout]);

  const findColumn = useCallback((mapX) => {
    for (const col of layout.columns) {
      if (mapX >= col.x && mapX < col.x + col.width) return col;
    }
    return null;
  }, [layout]);

  const findThemeSpan = useCallback((mapX) => {
    for (const ts of layout.themeSpans) {
      if (mapX >= ts.x && mapX < ts.x + ts.width) return ts;
    }
    return null;
  }, [layout]);

  const getContainerRect = useCallback((e) => {
    const mapContainer = e.currentTarget.closest('[data-map-container]') || e.currentTarget.closest('[data-map-bg]');
    return mapContainer ? mapContainer.getBoundingClientRect() : null;
  }, []);

  // --- Rib drag start ---
  const handleDragStart = useCallback((e, cell) => {
    const rect = getContainerRect(e);
    if (!rect) return;
    const mapPos = screenToMap(e.clientX, e.clientY, rect);

    // If the dragged item is part of a multi-selection, drag them all
    const bulkIds = selectedIds?.size > 0 && selectedIds.has(cell.id) ? selectedIds : null;

    const state = {
      dragType: 'rib',
      ribId: cell.id,
      themeId: cell.themeId,
      backboneId: cell.backboneId,
      releaseId: cell.releaseId,
      selectedIds: bulkIds,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startMapX: mapPos.x,
      startMapY: mapPos.y,
      currentMapX: mapPos.x,
      currentMapY: mapPos.y,
      screenX: e.clientX,
      screenY: e.clientY,
      targetReleaseId: undefined,
      targetBackboneId: null,
      targetThemeId: null,
      isDragging: false,
      mapContainerRect: rect,
    };
    dragRef.current = state;
    setDragState(state);
  }, [screenToMap, getContainerRect, selectedIds]);

  // --- Backbone drag start ---
  const handleBackboneDragStart = useCallback((e, column) => {
    const rect = getContainerRect(e);
    if (!rect) return;
    const mapPos = screenToMap(e.clientX, e.clientY, rect);

    const state = {
      dragType: 'backbone',
      backboneId: column.backboneId,
      themeId: column.themeId,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startMapX: mapPos.x,
      startMapY: mapPos.y,
      currentMapX: mapPos.x,
      currentMapY: mapPos.y,
      axis: 'x', // Backbone drags are always X-axis
      targetThemeId: column.themeId,
      isDragging: false,
      mapContainerRect: rect,
    };
    dragRef.current = state;
    setDragState(state);
  }, [screenToMap, getContainerRect]);

  // --- Theme drag start ---
  const handleThemeDragStart = useCallback((e, themeSpan) => {
    const rect = getContainerRect(e);
    if (!rect) return;
    const mapPos = screenToMap(e.clientX, e.clientY, rect);

    const state = {
      dragType: 'theme',
      themeId: themeSpan.themeId,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startMapX: mapPos.x,
      startMapY: mapPos.y,
      currentMapX: mapPos.x,
      currentMapY: mapPos.y,
      targetInsertIndex: null,
      isDragging: false,
      mapContainerRect: rect,
    };
    dragRef.current = state;
    setDragState(state);
  }, [screenToMap, getContainerRect]);

  // --- Shared move handler ---
  const handleDragMove = useCallback((e) => {
    const prev = dragRef.current;
    if (!prev) return;

    const container = document.querySelector('[data-map-container]');
    const rect = container ? container.getBoundingClientRect() : prev.mapContainerRect;
    const mapPos = screenToMap(e.clientX, e.clientY, rect);
    const dx = e.clientX - prev.startScreenX;
    const dy = e.clientY - prev.startScreenY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!prev.isDragging && dist < DRAG_THRESHOLD) return;

    let state;
    if (prev.dragType === 'rib') {
      state = buildRibMoveState(prev, mapPos, e.clientX, e.clientY, findReleaseLane, findColumn, layout.cells);
    } else if (prev.dragType === 'backbone') {
      state = buildBackboneMoveState(prev, mapPos, findThemeSpan, layout.columns);
    } else {
      state = buildThemeMoveState(prev, mapPos, layout.themeSpans);
    }

    dragRef.current = state;
    setDragState(state);
  }, [screenToMap, findReleaseLane, findColumn, findThemeSpan, layout.cells]);

  // --- Shared end handler ---
  const handleDragEnd = useCallback(() => {
    const state = dragRef.current;
    if (!state || !state.isDragging) {
      dragRef.current = null;
      setDragState(null);
      return;
    }

    if (state.dragType === 'rib') {
      commitRibDrag(state, updateProduct, layout.cells);
    } else if (state.dragType === 'backbone') {
      commitBackboneDrag(state, updateProduct);
    } else if (state.dragType === 'theme') {
      commitThemeDrag(state, updateProduct);
    }

    dragRef.current = null;
    setDragState(null);
  }, [updateProduct, layout.cells]);

  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    setDragState(null);
  }, []);

  return {
    dragState,
    handleDragStart,
    handleBackboneDragStart,
    handleThemeDragStart,
    handleDragMove,
    handleDragEnd,
    cancelDrag,
  };
}

// --- Internal helpers (pure, not hooks) ---

function buildRibMoveState(prev, mapPos, screenX, screenY, findReleaseLane, findColumn, cells) {
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

function buildBackboneMoveState(prev, mapPos, findThemeSpan, columns) {
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

function computeInsertIndex(cells, backboneId, releaseId, excludeIds, mapY) {
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

function commitRibDrag(state, updateProduct, layoutCells) {
  const { ribId, themeId, backboneId, releaseId, targetReleaseId, targetBackboneId, targetThemeId, insertIndex, selectedIds } = state;

  const releaseChanged = targetReleaseId !== undefined && targetReleaseId !== releaseId;
  const backboneChanged = targetBackboneId && targetBackboneId !== backboneId;
  if (!releaseChanged && !backboneChanged) return;

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

function commitBackboneDrag(state, updateProduct) {
  const { backboneId, themeId, targetThemeId, insertIndex } = state;
  if (!targetThemeId) return;

  // Cross-theme move or same-theme reorder
  moveBackboneToTheme(updateProduct, backboneId, themeId, targetThemeId, insertIndex);
}

function buildThemeMoveState(prev, mapPos, themeSpans) {
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

function commitThemeDrag(state, updateProduct) {
  const { themeId, insertIndex } = state;
  if (insertIndex == null) return;
  reorderTheme(updateProduct, themeId, insertIndex);
}
