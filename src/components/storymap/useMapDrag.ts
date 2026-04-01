// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Product } from '../../types';
import {
  buildRibMoveState, buildBackboneMoveState, buildThemeMoveState, buildReleaseMoveState,
  commitRibDrag, commitBackboneDrag, commitThemeDrag, commitReleaseDrag,
} from './mapDragHelpers';

type UpdateProduct = (updater: (prev: Product) => Product) => void;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- drag state is a union of RibDragState | BackboneDragState | ThemeDragState
export default function useMapDrag({ layout, zoom, pan, updateProduct, selectedIds }: { layout: any; zoom: number; pan: { x: number; y: number }; updateProduct: UpdateProduct; selectedIds: Set<string> | null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- layout/cell objects from computeLayout have complex inferred shape
  const [dragState, setDragState] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- layout/cell objects from computeLayout have complex inferred shape
  const dragRef = useRef<any>(null);

  // Keep current zoom/pan in refs so screenToMap always uses latest values
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // Convert screen coords to map (logical) coords
  const screenToMap = useCallback((screenX: number, screenY: number, mapContainerRect: DOMRect) => ({
    x: (screenX - mapContainerRect.left - panRef.current.x) / zoomRef.current,
    y: (screenY - mapContainerRect.top - panRef.current.y) / zoomRef.current,
  }), []);

  // Hit-test helpers
  const findReleaseLane = useCallback((mapY: number) => {
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

  const findColumn = useCallback((mapX: number) => {
    for (const col of layout.columns) {
      if (mapX >= col.x && mapX < col.x + col.width) return col;
    }
    return null;
  }, [layout]);

  const findThemeSpan = useCallback((mapX: number) => {
    for (const ts of layout.themeSpans) {
      if (mapX >= ts.x && mapX < ts.x + ts.width) return ts;
    }
    return null;
  }, [layout]);

  const getContainerRect = useCallback((e: React.PointerEvent) => {
    const mapContainer = e.currentTarget.closest('[data-map-container]') || e.currentTarget.closest('[data-map-bg]');
    return mapContainer ? mapContainer.getBoundingClientRect() : null;
  }, []);

  // --- Rib drag start ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- layout/cell objects from computeLayout have complex inferred shape
  const handleDragStart = useCallback((e: React.PointerEvent, cell: any) => {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- layout/cell objects from computeLayout have complex inferred shape
  const handleBackboneDragStart = useCallback((e: React.PointerEvent, column: any) => {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- layout/cell objects from computeLayout have complex inferred shape
  const handleThemeDragStart = useCallback((e: React.PointerEvent, themeSpan: any) => {
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

  // --- Release drag start ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lane objects from computeLayout have complex inferred shape
  const handleReleaseDragStart = useCallback((e: React.PointerEvent, lane: any) => {
    const rect = getContainerRect(e);
    if (!rect) return;
    const mapPos = screenToMap(e.clientX, e.clientY, rect);

    const state = {
      dragType: 'release',
      releaseId: lane.releaseId,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startMapX: mapPos.x,
      startMapY: mapPos.y,
      currentMapX: mapPos.x,
      currentMapY: mapPos.y,
      insertIndex: null,
      isDragging: false,
      mapContainerRect: rect,
    };
    dragRef.current = state;
    setDragState(state);
  }, [screenToMap, getContainerRect]);

  // --- Shared move handler ---
  const handleDragMove = useCallback((e: PointerEvent) => {
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
    } else if (prev.dragType === 'release') {
      state = buildReleaseMoveState(prev, mapPos, layout.releaseLanes);
    } else {
      state = buildThemeMoveState(prev, mapPos, layout.themeSpans);
    }

    dragRef.current = state;
    setDragState(state);
  }, [screenToMap, findReleaseLane, findColumn, findThemeSpan, layout.cells, layout.columns, layout.themeSpans]);

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
    } else if (state.dragType === 'release') {
      commitReleaseDrag(state, updateProduct);
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
    handleReleaseDragStart,
    handleDragMove,
    handleDragEnd,
    cancelDrag,
  };
}
