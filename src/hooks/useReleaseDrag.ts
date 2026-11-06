// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useState, useCallback, useRef } from 'react';
import type { Product, RibItem } from '../types';
import { applyRibTransfer } from '../lib/progressMutations';

type UpdateProduct = (updater: (prev: Product) => Product) => void;

interface DropTargetInfo {
  col: string;
  beforeRibId?: string;
}

/**
 * Drop a card on a Release Planning column. Pure, and the test seam for the
 * drag below: a move between columns takes the rib's allocation and progress
 * with it (see `applyRibTransfer`), and `newOrder` becomes the target's card order.
 */
export function applyCardDrop(prev: Product, drop: { ribId: string; fromCol: string | null; targetCol: string; newOrder: string[] }): Product {
  const { ribId, fromCol, targetCol, newOrder } = drop;
  const sameColumn = fromCol === targetCol;
  let next = { ...prev };

  if (!sameColumn) {
    const fromId = fromCol === 'unassigned' ? null : fromCol;
    const toId = targetCol === 'unassigned' ? null : targetCol;
    next = {
      ...next,
      themes: next.themes.map(t => ({
        ...t,
        backboneItems: t.backboneItems.map(b => ({
          ...b,
          ribItems: b.ribItems.map(r => (r.id === ribId ? applyRibTransfer(r, fromId, toId) : r)),
        })),
      })),
    };
  }

  const prevCardOrder = { ...(next.releaseCardOrder || {}) };
  prevCardOrder[targetCol] = newOrder;

  // `sameColumn` is `fromCol === targetCol`, so reaching here with a null
  // fromCol would mean targetCol is non-null and different — but the key is
  // still only usable once it is known to be a string.
  if (!sameColumn && fromCol !== null) {
    const srcOrder = prevCardOrder[fromCol] || [];
    if (srcOrder.includes(ribId)) {
      prevCardOrder[fromCol] = srcOrder.filter((id: string) => id !== ribId);
    }
  }

  next.releaseCardOrder = prevCardOrder;
  return next;
}

/**
 * Drag-and-drop logic for ReleasePlanningView.
 *
 * Handles two independent drag systems:
 * 1. Card drag — move rib items between columns (unassigned ↔ releases)
 * 2. Column drag — reorder release columns
 */
export function useReleaseDrag(updateProduct: UpdateProduct, allRibs: RibItem[], unassigned: RibItem[], ribsForRelease: (releaseId: string) => RibItem[]) {
  // Card drag state
  const [dragRibId, setDragRibId] = useState<string | null>(null);
  const [dragFromCol, setDragFromCol] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetInfo | null>(null);
  const dropTargetRef = useRef<DropTargetInfo | null>(null);

  // Column drag state
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dropBeforeColId, setDropBeforeColId] = useState<string | null>(null);
  const dropBeforeColRef = useRef<string | null>(null);

  const setDropTargetBoth = useCallback((val: DropTargetInfo | null) => {
    setDropTarget(val);
    dropTargetRef.current = val;
  }, []);

  // ── Card drag handlers ──

  const handleDragStart = useCallback((ribId: string, fromCol: string) => {
    setDragRibId(ribId);
    setDragFromCol(fromCol);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragRibId(null);
    setDragFromCol(null);
    setDropTargetBoth(null);
  }, [setDropTargetBoth]);

  const handleDrop = useCallback((targetCol: string) => {
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

    updateProduct(prev => applyCardDrop(prev, { ribId: dragRibId, fromCol: dragFromCol, targetCol, newOrder }));

    handleDragEnd();
  }, [dragRibId, dragFromCol, allRibs, unassigned, ribsForRelease, updateProduct, handleDragEnd]);

  const handleColumnDragOver = (e: React.DragEvent, col: string) => {
    e.preventDefault();
    if (!dropTargetRef.current || dropTargetRef.current.col !== col) {
      setDropTargetBoth({ col });
    }
  };

  const handleCardDragOver = (e: React.DragEvent, col: string, ribId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (ribId === dragRibId) return;
    if (dropTargetRef.current?.col !== col || dropTargetRef.current?.beforeRibId !== ribId) {
      setDropTargetBoth({ col, beforeRibId: ribId });
    }
  };

  // ── Column drag handlers ──

  const handleColDragStart = (e: React.DragEvent, releaseId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragColId(releaseId);
  };

  const handleColDragEnd = () => {
    setDragColId(null);
    setDropBeforeColId(null);
    dropBeforeColRef.current = null;
  };

  const handleColDragOver = (e: React.DragEvent, releaseId: string) => {
    if (!dragColId || dragColId === releaseId) return;
    e.preventDefault();
    e.stopPropagation();
    if (dropBeforeColRef.current !== releaseId) {
      dropBeforeColRef.current = releaseId;
      setDropBeforeColId(releaseId);
    }
  };

  const handleColDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragColId) return;
    const beforeId = dropBeforeColRef.current;

    updateProduct(prev => {
      const releases = [...prev.releases];
      const dragIdx = releases.findIndex(r => r.id === dragColId);
      if (dragIdx < 0) return prev;
      const [dragged] = releases.splice(dragIdx, 1);
      if (!dragged) return prev; // unreachable: dragIdx came from findIndex

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
