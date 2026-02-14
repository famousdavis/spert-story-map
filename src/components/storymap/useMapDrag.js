import { useState, useCallback, useRef, useEffect } from 'react';
import { moveRibToRelease, moveRibToBackbone, moveBackboneToTheme } from './mapMutations';

/**
 * Hook for drag-and-drop on the story map.
 *
 * Supports three operations:
 * 1. Drag rib to a different release lane (Y-axis) — changes allocation
 * 2. Drag rib to a different backbone column (X-axis) — moves rib to new backbone
 * 3. Drag backbone to a different theme (X-axis) — moves backbone + all ribs
 *
 * Uses pointer events (not HTML5 DnD) to work with CSS zoom/pan transforms.
 * For rib drags, detects dominant axis after a small threshold, then locks to it.
 */

const DRAG_THRESHOLD = 8; // pixels before committing to drag
const AXIS_LOCK_THRESHOLD = 6; // px in dominant direction to lock axis

export default function useMapDrag({ layout, zoom, pan, updateProduct }) {
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

    const state = {
      dragType: 'rib',
      ribId: cell.id,
      themeId: cell.themeId,
      backboneId: cell.backboneId,
      releaseId: cell.releaseId,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startMapX: mapPos.x,
      startMapY: mapPos.y,
      currentMapX: mapPos.x,
      currentMapY: mapPos.y,
      axis: null,
      targetReleaseId: undefined,
      targetBackboneId: null,
      targetThemeId: null,
      isDragging: false,
      mapContainerRect: rect,
    };
    dragRef.current = state;
    setDragState(state);
  }, [screenToMap, getContainerRect]);

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
      state = buildRibMoveState(prev, mapPos, dx, dy, dist, findReleaseLane, findColumn);
    } else {
      state = buildBackboneMoveState(prev, mapPos, findThemeSpan);
    }

    dragRef.current = state;
    setDragState(state);
  }, [screenToMap, findReleaseLane, findColumn, findThemeSpan]);

  // --- Shared end handler ---
  const handleDragEnd = useCallback(() => {
    const state = dragRef.current;
    if (!state || !state.isDragging) {
      dragRef.current = null;
      setDragState(null);
      return;
    }

    if (state.dragType === 'rib') {
      commitRibDrag(state, updateProduct);
    } else if (state.dragType === 'backbone') {
      commitBackboneDrag(state, updateProduct);
    }

    dragRef.current = null;
    setDragState(null);
  }, [updateProduct]);

  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    setDragState(null);
  }, []);

  return {
    dragState,
    handleDragStart,
    handleBackboneDragStart,
    handleDragMove,
    handleDragEnd,
    cancelDrag,
  };
}

// --- Internal helpers (pure, not hooks) ---

function buildRibMoveState(prev, mapPos, dx, dy, dist, findReleaseLane, findColumn) {
  let axis = prev.axis;
  if (!axis && dist >= AXIS_LOCK_THRESHOLD) {
    axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }

  let targetReleaseId = prev.targetReleaseId;
  let targetBackboneId = prev.targetBackboneId;
  let targetThemeId = prev.targetThemeId;

  if (axis === 'y') {
    const lane = findReleaseLane(mapPos.y);
    if (lane) targetReleaseId = lane.releaseId;
    targetBackboneId = prev.backboneId;
    targetThemeId = prev.themeId;
  } else if (axis === 'x') {
    const col = findColumn(mapPos.x);
    if (col) {
      targetBackboneId = col.backboneId;
      targetThemeId = col.themeId;
    }
    targetReleaseId = prev.releaseId;
  }

  return {
    ...prev,
    currentMapX: mapPos.x,
    currentMapY: mapPos.y,
    axis,
    targetReleaseId,
    targetBackboneId,
    targetThemeId,
    isDragging: true,
  };
}

function buildBackboneMoveState(prev, mapPos, findThemeSpan) {
  const ts = findThemeSpan(mapPos.x);
  return {
    ...prev,
    currentMapX: mapPos.x,
    currentMapY: mapPos.y,
    targetThemeId: ts ? ts.themeId : prev.targetThemeId,
    isDragging: true,
  };
}

function commitRibDrag(state, updateProduct) {
  const { axis, ribId, themeId, backboneId, releaseId, targetReleaseId, targetBackboneId, targetThemeId } = state;

  if (axis === 'y' && targetReleaseId !== undefined && targetReleaseId !== releaseId) {
    moveRibToRelease(updateProduct, ribId, releaseId, targetReleaseId);
  }
  if (axis === 'x' && targetBackboneId && targetBackboneId !== backboneId) {
    moveRibToBackbone(updateProduct, ribId, themeId, backboneId, targetThemeId, targetBackboneId);
  }
}

function commitBackboneDrag(state, updateProduct) {
  const { backboneId, themeId, targetThemeId } = state;
  if (targetThemeId && targetThemeId !== themeId) {
    moveBackboneToTheme(updateProduct, backboneId, themeId, targetThemeId);
  }
}
