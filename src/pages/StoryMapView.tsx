// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useProductMutations } from '../hooks/useProductMutations';
import { useSessionState } from '../hooks/useSessionState';
import { stripOrphans, bulkNextCollapsed, pruneSelection } from '../components/storymap/collapseHelpers';
import MapCanvas from '../components/storymap/MapCanvas';
import MapContent from '../components/storymap/MapContent';
import RibDetailPanel from '../components/storymap/RibDetailPanel';
import ReleaseDetailPanel from '../components/storymap/ReleaseDetailPanel';
import DragGhost from '../components/storymap/DragGhost';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import useMapDrag from '../components/storymap/useMapDrag';
import useMapLayout from '../components/storymap/useMapLayout';
import type { MapCell } from '../components/storymap/useMapLayout';
import useMapKeyboard from '../components/storymap/useMapKeyboard';
import useMapHandlers from '../components/storymap/useMapHandlers';
import useEdgeAutoPan from '../hooks/useEdgeAutoPan';
import CardColorLegend from '../components/ui/CardColorLegend';
import type { OutletContextValue } from '../types';

export default function StoryMapView() {
  const { product, updateProduct, undo, redo } = useOutletContext<OutletContextValue>();
  const mutations = useProductMutations(updateProduct);
  const [collapsedIds, setCollapsedIds] = useSessionState<string[]>(`collapsed-releases:${product.id}`, []);
  const layout = useMapLayout(product, collapsedIds);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedRibId, setSelectedRibId] = useState<string | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isNewRib, setIsNewRib] = useState(false);

  // Derive selectedRib from layout so it stays in sync with product changes (e.g. renames)
  const selectedRib = useMemo(() => {
    if (!selectedRibId) return null;
    return layout.cells.find(c => c.id === selectedRibId) || null;
  }, [selectedRibId, layout.cells]);
  const mapSizeRef = useRef({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const didAutoFit = useRef(false);

  const { dragState, dragPointerRef, handleDragStart, handleBackboneDragStart, handleThemeDragStart, handleReleaseDragStart, handleDragMove, handleDragEnd, cancelDrag } = useMapDrag({
    layout,
    zoom,
    pan,
    updateProduct,
    selectedIds,
  });

  useEdgeAutoPan({
    isDragging: !!dragState?.isDragging,
    pointerRef: dragPointerRef,
    setPan,
  });

  // Track recent drag completion to suppress click-after-drag
  const recentDragRef = useRef(false);
  useEffect(() => {
    if (dragState?.isDragging) {
      recentDragRef.current = true;
    } else if (recentDragRef.current) {
      // Clear after a short delay so the click event can check it
      const t = setTimeout(() => { recentDragRef.current = false; }, 100);
      return () => clearTimeout(t);
    }
  }, [dragState]);

  // --- Collapsible release lanes ---

  const allReleaseIds = useMemo(() => (product.releases ?? []).map(r => r.id), [product.releases]);
  const allCollapsed = allReleaseIds.length > 0 && allReleaseIds.every(id => collapsedIds.includes(id));

  // Drop stale collapsed ids whose release no longer exists.
  useEffect(() => {
    const valid = new Set(allReleaseIds);
    const next = stripOrphans(collapsedIds, valid);
    if (next.length !== collapsedIds.length) setCollapsedIds(next);
  }, [allReleaseIds, collapsedIds, setCollapsedIds]);

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, [setCollapsedIds]);

  const handleBulkCollapse = useCallback(() => {
    setCollapsedIds(prev => bulkNextCollapsed(allReleaseIds, prev));
  }, [allReleaseIds, setCollapsedIds]);

  // Drop-only auto-expand: when a rib is dropped into a collapsed lane, expand it. The drop
  // target is read from dragState (fresh via deps); the expand is dispatched in the same
  // handler as the commit, so they batch into one render (no momentary hidden card). Escape
  // runs cancelDrag (not this), so a cancelled drag never expands.
  const handleDragEndExpand = useCallback(() => {
    const isRibDrag = dragState?.isDragging && dragState.dragType === 'rib';
    const dropTarget = isRibDrag ? dragState.targetReleaseId : undefined;
    // A bulk move carries the selection set on dragState; deselect the group once it lands
    // so the user isn't stuck with a lingering selection (re-select to move again).
    const wasBulkMove = isRibDrag && dragState.selectedIds && dragState.selectedIds.size > 0;
    handleDragEnd();
    if (dropTarget != null) {
      setCollapsedIds(prev => prev.includes(dropTarget) ? prev.filter(id => id !== dropTarget) : prev);
    }
    if (wasBulkMove) setSelectedIds(new Set());
  }, [dragState, handleDragEnd, setCollapsedIds]);

  /* eslint-disable react-hooks/set-state-in-effect -- reconcile selection to cell visibility after a collapse/bulk/delete reflow; both setters are guarded and converge */
  // Close a zombie panel selection when its rib is no longer visible (collapse / bulk / delete).
  useEffect(() => {
    if (selectedRibId && !selectedRib) setSelectedRibId(null);
  }, [selectedRibId, selectedRib]);

  // Prune multi-select to ids that still resolve to a visible cell.
  useEffect(() => {
    const visible = new Set(layout.cells.map(c => c.id));
    const pruned = pruneSelection(selectedIds, visible);
    if (pruned) setSelectedIds(pruned);
  }, [selectedIds, layout.cells]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRibClick = useCallback((ribData: MapCell, e: React.MouseEvent) => {
    // Don't open detail panel if we just finished dragging
    if (recentDragRef.current) return;

    if (e?.shiftKey) {
      // Toggle in/out of multi-selection
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(ribData.id)) {
          next.delete(ribData.id);
        } else {
          next.add(ribData.id);
        }
        return next;
      });
      setSelectedRibId(null);
      setSelectedReleaseId(null);
    } else {
      // Single select — clear multi-select, open detail panel
      setSelectedIds(new Set());
      setSelectedReleaseId(null);
      setSelectedRibId(ribData.id);
      setIsNewRib(false);
    }
  }, []);

  const handleReleaseClick = useCallback((releaseId: string) => {
    if (recentDragRef.current) return;
    setSelectedIds(new Set());
    setSelectedRibId(null);
    setSelectedReleaseId(releaseId);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedRibId(null);
    setSelectedReleaseId(null);
    setIsNewRib(false);
  }, []);

  // Clicking empty canvas deselects everything — the escape hatch for a multi-selection
  // (and any open detail panel) without having to click another card.
  const handleBackgroundDeselect = useCallback(() => {
    setSelectedIds(new Set());
    setSelectedRibId(null);
    setSelectedReleaseId(null);
    setIsNewRib(false);
  }, []);

  // Auto-fit on first render once map dimensions are known
  useEffect(() => {
    if (didAutoFit.current) return;
    const { width, height } = mapSizeRef.current;
    const el = containerRef.current;
    if (width > 0 && height > 0 && el) {
      didAutoFit.current = true;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const scaleX = cw / width;
      const scaleY = ch / height;
      const fitZoom = Math.min(scaleX, scaleY, 2) * 0.95;
      setZoom(Math.max(0.2, fitZoom));
      setPan({ x: 0, y: 0 });
    }
  }, [layout]);

  const handleFit = useCallback((containerWidth: number, containerHeight: number) => {
    const { width, height } = mapSizeRef.current;
    if (!width || !height) return;
    const scaleX = containerWidth / width;
    const scaleY = containerHeight / height;
    const fitZoom = Math.min(scaleX, scaleY, 2) * 0.95;
    setZoom(Math.max(0.2, fitZoom));
    setPan({ x: 0, y: 0 });
  }, []);

  // Keyboard shortcuts (undo/redo, escape, delete)
  useMapKeyboard({
    undo, redo, dragState, cancelDrag,
    selectedIds, setSelectedIds, layoutCells: layout.cells, mutations,
  });

  // CRUD handlers (rename, delete, add) + drag label
  const handleRibAdded = useCallback((id: string) => {
    setSelectedIds(new Set());
    setSelectedReleaseId(null);
    setSelectedRibId(id);
    setIsNewRib(true);
  }, []);

  const {
    handleRenameTheme, handleRenameBackbone, handleRenameRib, handleRenameRelease,
    handleDeleteTheme, handleDeleteBackbone, handleDeleteRib, handleDeleteRelease,
    handleConfirmDelete, deleteTarget, setDeleteTarget,
    handleAddTheme, handleAddBackbone, handleAddRib, handleAddRibToRelease, handleAddReleaseAfter,
    handleCloneRib,
    handleSetRibCardColor,
    dragLabel,
  } = useMapHandlers({
    product, updateProduct, mutations,
    setSelectedReleaseId, onRibAdded: handleRibAdded, layout, dragState,
  });

  return (
    <div ref={containerRef} className="-mx-6 -mt-6 relative" style={{ height: 'calc(100vh - 112px)' }}>
      <MapCanvas
        zoom={zoom}
        setZoom={setZoom}
        pan={pan}
        setPan={setPan}
        onFit={handleFit}
        dragState={dragState}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEndExpand}
        onBackgroundClick={handleBackgroundDeselect}
        overlayControls={product.releases.length >= 2 ? (
          <button
            type="button"
            onClick={handleBulkCollapse}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 px-2.5 py-1.5"
            title="Collapse all release lanes except Unassigned"
          >
            {allCollapsed ? 'Expand all' : 'Collapse releases'}
          </button>
        ) : undefined}
      >
        <MapContent
          layout={layout}
          themes={product.themes}
          product={product}
          onRibClick={handleRibClick}
          onReleaseClick={handleReleaseClick}
          mapSizeRef={mapSizeRef}
          onRenameTheme={handleRenameTheme}
          onRenameBackbone={handleRenameBackbone}
          onRenameRib={handleRenameRib}
          onRenameRelease={handleRenameRelease}
          onDeleteTheme={handleDeleteTheme}
          onDeleteBackbone={handleDeleteBackbone}
          onDeleteRib={handleDeleteRib}
          onCloneRib={handleCloneRib}
          onSetCardColor={handleSetRibCardColor}
          onDeleteRelease={handleDeleteRelease}
          onAddTheme={handleAddTheme}
          onAddBackbone={handleAddBackbone}
          onAddRib={handleAddRib}
          onAddRibToRelease={handleAddRibToRelease}
          onAddReleaseAfter={handleAddReleaseAfter}
          dragState={dragState}
          onDragStart={handleDragStart}
          onBackboneDragStart={handleBackboneDragStart}
          onThemeDragStart={handleThemeDragStart}
          onReleaseDragStart={handleReleaseDragStart}
          onToggleCollapse={handleToggleCollapse}
          selectedIds={selectedIds}
          editingRibId={selectedRibId}
        />
      </MapCanvas>

      {selectedRib && (
        <RibDetailPanel
          rib={selectedRib}
          product={product}
          onClose={handleCloseDetail}
          onRename={handleRenameRib}
          onUpdate={(tid, bid, rid, updates) => mutations.updateRib(tid, bid, rid, updates)}
          autoEdit={isNewRib}
        />
      )}

      {selectedReleaseId && (
        <ReleaseDetailPanel
          releaseId={selectedReleaseId}
          product={product}
          onClose={handleCloseDetail}
          onRename={handleRenameRelease}
          onDelete={handleDeleteRelease}
        />
      )}

      {/* Drag ghost (follows cursor during rib drags) */}
      <DragGhost dragState={dragState} cells={layout.cells} zoom={zoom} />

      {/* Color-flag legend (bottom-right; auto-hides when no card is colored) */}
      <CardColorLegend product={product} onLabelChange={mutations.setCardColorLabel} />

      {/* Drag indicator badge */}
      {dragLabel && (
        <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded shadow z-50 pointer-events-none">
          {dragLabel}
        </div>
      )}

      {/* Selection count badge */}
      {selectedIds.size > 0 && !dragState?.isDragging && (
        <div className="absolute bottom-3 left-3 bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded shadow z-50 pointer-events-none">
          {selectedIds.size} selected — press Delete to remove
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={`Delete ${
          deleteTarget?.type === 'theme' ? 'Theme'
            : deleteTarget?.type === 'backbone' ? 'Backbone'
            : deleteTarget?.type === 'release' ? 'Release'
            : 'Rib Item'
        }`}
        message={
          deleteTarget?.type === 'theme'
            ? `Delete "${deleteTarget.name}"? All backbone items and rib items within it will also be deleted.`
            : deleteTarget?.type === 'backbone'
              ? `Delete "${deleteTarget.name}"? All rib items within it will also be deleted.`
              : deleteTarget?.type === 'release'
                ? `Delete "${deleteTarget.name}"? Any remaining allocations and progress history for this release will be removed.`
                : `Delete "${deleteTarget?.name}"?`
        }
      />
    </div>
  );
}
