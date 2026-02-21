import { useState, useCallback, useRef } from 'react';
import { transferAllocation } from '../components/storymap/mapMutations';

/**
 * Drag-and-drop logic for ReleasePlanningView.
 *
 * Handles two independent drag systems:
 * 1. Card drag — move rib items between columns (unassigned ↔ releases)
 * 2. Column drag — reorder release columns
 *
 * @param {Function} updateProduct - product state updater
 * @param {Array} allRibs - all rib items from product
 * @param {Array} unassigned - rib items not assigned to any release
 * @param {Function} ribsForRelease - (releaseId) => rib items for that release
 */
export function useReleaseDrag(updateProduct, allRibs, unassigned, ribsForRelease) {
  // Card drag state
  const [dragRibId, setDragRibId] = useState(null);
  const [dragFromCol, setDragFromCol] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const dropTargetRef = useRef(null);

  // Column drag state
  const [dragColId, setDragColId] = useState(null);
  const [dropBeforeColId, setDropBeforeColId] = useState(null);
  const dropBeforeColRef = useRef(null);

  const setDropTargetBoth = useCallback((val) => {
    setDropTarget(val);
    dropTargetRef.current = val;
  }, []);

  // ── Card drag handlers ──

  const handleDragStart = useCallback((ribId, fromCol) => {
    setDragRibId(ribId);
    setDragFromCol(fromCol);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragRibId(null);
    setDragFromCol(null);
    setDropTargetBoth(null);
  }, [setDropTargetBoth]);

  const handleDrop = useCallback((targetCol) => {
    if (!dragRibId) return;

    const rib = allRibs.find(r => r.id === dragRibId);
    if (!rib) { handleDragEnd(); return; }

    const sameColumn = dragFromCol === targetCol;
    const currentDropTarget = dropTargetRef.current;
    const beforeRibId = currentDropTarget?.col === targetCol ? currentDropTarget.beforeRibId : undefined;

    let targetRibs;
    if (targetCol === 'unassigned') {
      targetRibs = sameColumn ? unassigned : [...unassigned.filter(r => r.id !== dragRibId), rib];
    } else {
      targetRibs = sameColumn ? ribsForRelease(targetCol) : [...ribsForRelease(targetCol).filter(r => r.id !== dragRibId), rib];
    }
    const currentIds = targetRibs.map(r => r.id);

    let newOrder;
    if (beforeRibId && beforeRibId !== dragRibId) {
      const withoutDragged = currentIds.filter(id => id !== dragRibId);
      const insertIdx = withoutDragged.indexOf(beforeRibId);
      if (insertIdx >= 0) {
        newOrder = [...withoutDragged.slice(0, insertIdx), dragRibId, ...withoutDragged.slice(insertIdx)];
      } else {
        newOrder = [...withoutDragged, dragRibId];
      }
    } else {
      const withoutDragged = currentIds.filter(id => id !== dragRibId);
      newOrder = [...withoutDragged, dragRibId];
    }

    updateProduct(prev => {
      let next = { ...prev };

      if (!sameColumn) {
        const fromId = dragFromCol === 'unassigned' ? null : dragFromCol;
        const toId = targetCol === 'unassigned' ? null : targetCol;
        next = {
          ...next,
          themes: next.themes.map(t => ({
            ...t,
            backboneItems: t.backboneItems.map(b => ({
              ...b,
              ribItems: b.ribItems.map(r => {
                if (r.id !== dragRibId) return r;
                const newAlloc = transferAllocation(r, fromId, toId);
                return newAlloc !== null ? { ...r, releaseAllocations: newAlloc } : r;
              }),
            })),
          })),
        };
      }

      const prevCardOrder = { ...(next.releaseCardOrder || {}) };
      prevCardOrder[targetCol] = newOrder;

      if (!sameColumn) {
        const srcOrder = prevCardOrder[dragFromCol] || [];
        if (srcOrder.includes(dragRibId)) {
          prevCardOrder[dragFromCol] = srcOrder.filter(id => id !== dragRibId);
        }
      }

      next.releaseCardOrder = prevCardOrder;
      return next;
    });

    handleDragEnd();
  }, [dragRibId, dragFromCol, allRibs, unassigned, ribsForRelease, updateProduct, handleDragEnd]);

  const handleColumnDragOver = (e, col) => {
    e.preventDefault();
    if (!dropTargetRef.current || dropTargetRef.current.col !== col) {
      setDropTargetBoth({ col });
    }
  };

  const handleCardDragOver = (e, col, ribId) => {
    e.preventDefault();
    e.stopPropagation();
    if (ribId === dragRibId) return;
    if (dropTargetRef.current?.col !== col || dropTargetRef.current?.beforeRibId !== ribId) {
      setDropTargetBoth({ col, beforeRibId: ribId });
    }
  };

  // ── Column drag handlers ──

  const handleColDragStart = (e, releaseId) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragColId(releaseId);
  };

  const handleColDragEnd = () => {
    setDragColId(null);
    setDropBeforeColId(null);
    dropBeforeColRef.current = null;
  };

  const handleColDragOver = (e, releaseId) => {
    if (!dragColId || dragColId === releaseId) return;
    e.preventDefault();
    e.stopPropagation();
    if (dropBeforeColRef.current !== releaseId) {
      dropBeforeColRef.current = releaseId;
      setDropBeforeColId(releaseId);
    }
  };

  const handleColDrop = (e) => {
    e.preventDefault();
    if (!dragColId) return;
    const beforeId = dropBeforeColRef.current;

    updateProduct(prev => {
      const releases = [...prev.releases];
      const dragIdx = releases.findIndex(r => r.id === dragColId);
      if (dragIdx < 0) return prev;
      const [dragged] = releases.splice(dragIdx, 1);

      if (beforeId) {
        const beforeIdx = releases.findIndex(r => r.id === beforeId);
        if (beforeIdx >= 0) {
          releases.splice(beforeIdx, 0, dragged);
        } else {
          releases.push(dragged);
        }
      } else {
        releases.push(dragged);
      }

      return { ...prev, releases: releases.map((r, i) => ({ ...r, order: i + 1 })) };
    });

    handleColDragEnd();
  };

  return {
    // Card drag
    dragRibId,
    dropTarget,
    handleDragStart,
    handleDragEnd,
    handleDrop,
    handleColumnDragOver,
    handleCardDragOver,
    // Column drag
    dragColId,
    dropBeforeColId,
    handleColDragStart,
    handleColDragEnd,
    handleColDragOver,
    handleColDrop,
  };
}
