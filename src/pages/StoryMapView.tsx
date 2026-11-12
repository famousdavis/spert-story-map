// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useProductMutations } from '../hooks/useProductMutations';
import { useSessionState } from '../hooks/useSessionState';
import { stripOrphans, bulkNextCollapsed } from '../components/storymap/collapseHelpers';
import MapCanvas from '../components/storymap/MapCanvas';
import MapContent from '../components/storymap/MapContent';
import RibDetailPanel from '../components/storymap/RibDetailPanel';
import ReleaseDetailPanel from '../components/storymap/ReleaseDetailPanel';
import MapEntityPanel from '../components/storymap/MapEntityPanel';
import type { EntityPatch } from '../components/storymap/MapEntityPanel';
import DragGhost from '../components/storymap/DragGhost';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { releaseDeleteMessage } from '../lib/settingsMutations';
import useMapDrag from '../components/storymap/useMapDrag';
import useMapLayout from '../components/storymap/useMapLayout';
import useMapKeyboard from '../components/storymap/useMapKeyboard';
import useMapHandlers from '../components/storymap/useMapHandlers';
import useMapSelection from '../components/storymap/useMapSelection';
import { buildDescriptionLookup, patchBackbone, resolveEntity, revealShift } from '../components/storymap/mapEntity';
import type { MapEntityTarget } from '../components/storymap/mapEntity';
import useEdgeAutoPan from '../hooks/useEdgeAutoPan';
import CardColorLegend from '../components/ui/CardColorLegend';
import type { OutletContextValue } from '../types';

/** The docked panel takes room beside the map from Tailwind's `md` breakpoint up. */
const isDockedViewport = () => typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches;

export default function StoryMapView() {
  const { product, updateProduct, undo, redo } = useOutletContext<OutletContextValue>();
  const mutations = useProductMutations(updateProduct);
  const [collapsedIds, setCollapsedIds] = useSessionState<string[]>(`collapsed-releases:${product.id}`, []);
  const layout = useMapLayout(product, collapsedIds);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const mapSizeRef = useRef({ width: 0, height: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mapAreaRef = useRef<HTMLDivElement | null>(null);
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

  // A docked panel narrows the map: pan just enough that the name clicked to open it stays in view.
  // Measures the name's text, not its flex-1 wrapper, which on a wide theme spans many columns.
  const revealName = useCallback((anchor: HTMLElement | null) => {
    const root = rootRef.current;
    if (!anchor || !root || !isDockedViewport()) return;
    const name = anchor.firstElementChild ?? anchor;
    const dx = revealShift(name.getBoundingClientRect(), root.getBoundingClientRect());
    if (dx > 0) setPan(p => ({ ...p, x: p.x - dx }));
  }, []);

  const sel = useMapSelection({
    cells: layout.cells, themes: product.themes, dragState, dragPointerRef,
    selectedIds, setSelectedIds, onEntityOpened: revealName,
  });

  // The latest product, for a commit that runs as a panel unmounts (a passive cleanup, so after this layout effect).
  const productRef = useRef(product);
  useLayoutEffect(() => { productRef.current = product; }, [product]);

  /** A theme or backbone rename or description. Resolved against the latest product; no write when it is gone. */
  const commitEntity = useCallback((target: MapEntityTarget, patch: EntityPatch) => {
    if (!resolveEntity(productRef.current.themes, target)) return;
    if (target.kind === 'theme') mutations.updateTheme(target.id, patch);
    else updateProduct(prev => patchBackbone(prev, target.id, target.themeIdAtClick, patch));
  }, [mutations, updateProduct]);

  const descriptions = useMemo(() => buildDescriptionLookup(product.themes), [product.themes]);

  // A press in the map: commit the panel's description first (React never blurs it for a
  // card press, which prevents default), so keys reach the map; and cancel a pending open.
  const { cancelPendingUnlessOn } = sel;
  const handleMapAreaPointerDownCapture = useCallback((e: ReactPointerEvent) => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('[data-map-entity-panel]')) active.blur();
    cancelPendingUnlessOn(e.target);
  }, [cancelPendingUnlessOn]);

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

  // Auto-fit on first render once map dimensions are known. Measures the map area, which a docked panel narrows.
  useEffect(() => {
    if (didAutoFit.current) return;
    const { width, height } = mapSizeRef.current;
    const el = mapAreaRef.current;
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
    undo, redo, dragPointerRef, cancelDrag,
    entityPanelOpen: sel.entity !== null, closeEntityPanel: sel.close,
    selectedIds, setSelectedIds, layoutCells: layout.cells, mutations,
  });

  // CRUD handlers (rename, delete, add) + drag label
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
    onReleaseDeleted: sel.closeRelease, onRibAdded: sel.handleRibAdded, layout, dragState,
  });

  return (
    <div ref={rootRef} className="-mx-6 -mt-6 relative flex" style={{ height: 'calc(100vh - 112px)' }}>
      <div ref={mapAreaRef} data-map-area="" className="relative flex-1 min-w-0 h-full" onPointerDownCapture={handleMapAreaPointerDownCapture}>
        <MapCanvas
          zoom={zoom}
          setZoom={setZoom}
          pan={pan}
          setPan={setPan}
          onFit={handleFit}
          dragState={dragState}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEndExpand}
          onDragCancel={cancelDrag}
          onBackgroundClick={sel.handleBackgroundDeselect}
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
            onRibClick={sel.handleRibClick}
            onReleaseClick={sel.handleReleaseClick}
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
            editingRibId={sel.selectedRib?.id ?? null}
            descriptions={descriptions}
            selectedEntityKey={sel.entity?.ringKey ?? null}
            onEntityNameClick={sel.armEntityOpen}
            onEntityNameDoubleClick={sel.cancelPending}
          />
        </MapCanvas>

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
      </div>

      {/* Theme or backbone panel: no backdrop, docked from md up. Keyed, so a switch remounts it. */}
      {sel.entity && (
        <MapEntityPanel
          key={sel.entity.editorKey}
          target={sel.entity.target}
          product={product}
          onClose={sel.close}
          onCommit={commitEntity}
          onPointerDownCapture={sel.cancelPending}
        />
      )}

      {sel.selectedRib && (
        <RibDetailPanel
          rib={sel.selectedRib}
          product={product}
          onClose={sel.close}
          onRename={handleRenameRib}
          onUpdate={(tid, bid, rid, updates) => mutations.updateRib(tid, bid, rid, updates)}
          autoEdit={sel.isNewRib}
        />
      )}

      {sel.selectedReleaseId && (
        <ReleaseDetailPanel
          releaseId={sel.selectedReleaseId}
          product={product}
          onClose={sel.close}
          onRename={handleRenameRelease}
          onDelete={handleDeleteRelease}
        />
      )}

      {/* Drag ghost (follows cursor during rib drags) */}
      <DragGhost dragState={dragState} cells={layout.cells} zoom={zoom} />

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
                ? releaseDeleteMessage(`Delete "${deleteTarget.name}"?`, product, deleteTarget.releaseId ?? '')
                : `Delete "${deleteTarget?.name}"?`
        }
      />
    </div>
  );
}
