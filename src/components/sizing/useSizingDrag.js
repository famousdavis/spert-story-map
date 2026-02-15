import { useState, useCallback, useRef, useEffect } from 'react';
import { CELL_HEIGHT, CELL_GAP, CELL_PAD } from './useSizingLayout';

const DRAG_THRESHOLD = 8;

/**
 * Pointer-event drag hook for the sizing board.
 * Only handles rib drags between size columns / unsized zone.
 */
export default function useSizingDrag({ layout, zoom, pan, mutations, updateProduct }) {
  const [dragState, setDragState] = useState(null);
  const dragRef = useRef(null);

  // Keep current zoom/pan in refs so screenToMap always uses latest values
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  const screenToMap = useCallback((screenX, screenY, containerRect) => ({
    x: (screenX - containerRect.left - panRef.current.x) / zoomRef.current,
    y: (screenY - containerRect.top - panRef.current.y) / zoomRef.current,
  }), []);

  const getContainerRect = useCallback((e) => {
    const container = e.currentTarget.closest('[data-map-container]') || e.currentTarget.closest('[data-map-bg]');
    return container ? container.getBoundingClientRect() : null;
  }, []);

  // --- Hit testing ---

  const findTargetSize = useCallback((mapX, mapY) => {
    // Above size columns → unsized
    if (mapY < layout.unsizedZone.y + layout.unsizedZone.height) {
      return null; // unsized
    }
    // In or below size columns
    if (mapY >= layout.sizeColumnsY - 8) { // small buffer above headers
      for (const col of layout.sizeColumns) {
        if (mapX >= col.x && mapX < col.x + col.width) {
          return col.label;
        }
      }
    }
    return undefined; // in the gap, no change
  }, [layout]);

  const computeInsertIndex = useCallback((targetSize, excludeId, mapX, mapY) => {
    if (targetSize === null) {
      // Unsized zone: grid position
      const cellWidth = layout.cells.length > 0 ? layout.cells[0].width : 188;
      const gridCol = Math.max(0, Math.floor(mapX / (cellWidth + CELL_GAP)));
      const gridRow = Math.max(0, Math.floor(mapY / (CELL_HEIGHT + CELL_GAP)));
      const idx = gridRow * layout.unsizedGridCols + gridCol;
      const unsizedCount = layout.cells.filter(c => c.sizeLabel === null && c.id !== excludeId).length;
      return Math.min(idx, unsizedCount);
    }

    // Sized column: vertical position
    const colCells = layout.cells
      .filter(c => c.sizeLabel === targetSize && c.id !== excludeId)
      .sort((a, b) => a.y - b.y);

    if (colCells.length === 0) return 0;

    for (let i = 0; i < colCells.length; i++) {
      const mid = colCells[i].y + CELL_HEIGHT / 2;
      if (mapY < mid) return i;
    }
    return colCells.length;
  }, [layout]);

  // --- Drag start ---

  const handleDragStart = useCallback((e, cell) => {
    if (cell.locked) return;
    const rect = getContainerRect(e);
    if (!rect) return;
    const mapPos = screenToMap(e.clientX, e.clientY, rect);

    const state = {
      dragType: 'rib',
      ribId: cell.id,
      themeId: cell.themeId,
      backboneId: cell.backboneId,
      sourceSize: cell.sizeLabel,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      screenX: e.clientX,
      screenY: e.clientY,
      currentMapX: mapPos.x,
      currentMapY: mapPos.y,
      targetSize: cell.sizeLabel,
      insertIndex: null,
      isDragging: false,
      mapContainerRect: rect,
    };
    dragRef.current = state;
    setDragState(state);
  }, [screenToMap, getContainerRect]);

  // --- Drag move ---

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

    let targetSize = findTargetSize(mapPos.x, mapPos.y);
    if (targetSize === undefined) targetSize = prev.targetSize; // in gap, keep previous

    const insertIndex = computeInsertIndex(targetSize, prev.ribId, mapPos.x, mapPos.y);

    const state = {
      ...prev,
      currentMapX: mapPos.x,
      currentMapY: mapPos.y,
      screenX: e.clientX,
      screenY: e.clientY,
      targetSize,
      insertIndex,
      isDragging: true,
    };
    dragRef.current = state;
    setDragState(state);
  }, [screenToMap, findTargetSize, computeInsertIndex]);

  // --- Drag end ---

  const handleDragEnd = useCallback(() => {
    const state = dragRef.current;
    if (!state || !state.isDragging) {
      dragRef.current = null;
      setDragState(null);
      return;
    }

    const { sourceSize, targetSize, ribId, themeId, backboneId, insertIndex } = state;
    const sizeChanged = targetSize !== sourceSize;

    // Commit size change + card order in a single updateProduct call
    updateProduct(prev => {
      let next = prev;

      // Update size on the rib item if it changed
      if (sizeChanged) {
        next = {
          ...next,
          themes: next.themes.map(t =>
            t.id === themeId
              ? {
                ...t,
                backboneItems: t.backboneItems.map(b =>
                  b.id === backboneId
                    ? { ...b, ribItems: b.ribItems.map(r => r.id === ribId ? { ...r, size: targetSize || null } : r) }
                    : b
                ),
              }
              : t
          ),
        };
      }

      // Update sizingCardOrder
      const cardOrder = { ...(next.sizingCardOrder || {}) };
      const dstKey = targetSize === null ? 'unsized' : targetSize;
      const srcKey = sourceSize === null ? 'unsized' : sourceSize;

      // Remove from source list
      if (sizeChanged && cardOrder[srcKey]) {
        cardOrder[srcKey] = cardOrder[srcKey].filter(id => id !== ribId);
      }

      // Insert into destination list at correct position
      const dstList = [...(cardOrder[dstKey] || [])].filter(id => id !== ribId);

      // Ensure all sibling ribs in the target column are in the list
      // (prevents layout instability when sizingCardOrder was previously empty)
      const siblingIds = new Set();
      for (const cell of layout.cells) {
        if (cell.sizeLabel === targetSize && cell.id !== ribId) {
          siblingIds.add(cell.id);
        }
      }
      for (const sibId of siblingIds) {
        if (!dstList.includes(sibId)) {
          dstList.push(sibId);
        }
      }

      // Insert at the correct position
      const idx = insertIndex != null && insertIndex >= 0 && insertIndex <= dstList.length
        ? insertIndex : dstList.length;
      dstList.splice(idx, 0, ribId);
      cardOrder[dstKey] = dstList;

      return { ...next, sizingCardOrder: cardOrder };
    });

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
    handleDragMove,
    handleDragEnd,
    cancelDrag,
  };
}
