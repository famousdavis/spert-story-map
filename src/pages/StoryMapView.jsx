import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useProductMutations } from '../hooks/useProductMutations';
import MapCanvas from '../components/storymap/MapCanvas';
import MapContent from '../components/storymap/MapContent';
import RibDetailPanel from '../components/storymap/RibDetailPanel';
import ReleaseDetailPanel from '../components/storymap/ReleaseDetailPanel';
import DragGhost from '../components/storymap/DragGhost';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { deleteReleaseFromProduct } from '../lib/settingsMutations';
import useMapDrag from '../components/storymap/useMapDrag';
import useMapLayout from '../components/storymap/useMapLayout';

export default function StoryMapView() {
  const { product, updateProduct, undo, redo } = useOutletContext();
  const mutations = useProductMutations(updateProduct);
  const layout = useMapLayout(product);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedRibId, setSelectedRibId] = useState(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Derive selectedRib from layout so it stays in sync with product changes (e.g. renames)
  const selectedRib = useMemo(() => {
    if (!selectedRibId) return null;
    return layout.cells.find(c => c.id === selectedRibId) || null;
  }, [selectedRibId, layout.cells]);
  const mapSizeRef = useRef({ width: 0, height: 0 });
  const containerRef = useRef(null);
  const didAutoFit = useRef(false);

  const { dragState, handleDragStart, handleBackboneDragStart, handleThemeDragStart, handleDragMove, handleDragEnd, cancelDrag } = useMapDrag({
    layout,
    zoom,
    pan,
    updateProduct,
    selectedIds,
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

  const handleRibClick = useCallback((ribData, e) => {
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
    }
  }, []);

  const handleReleaseClick = useCallback((releaseId) => {
    if (recentDragRef.current) return;
    setSelectedIds(new Set());
    setSelectedRibId(null);
    setSelectedReleaseId(releaseId);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedRibId(null);
    setSelectedReleaseId(null);
  }, []);

  // Auto-fit on first render once map dimensions are known
  // Depends on layout to re-check after the map computes its size
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

  const handleFit = useCallback((containerWidth, containerHeight) => {
    const { width, height } = mapSizeRef.current;
    if (!width || !height) return;
    const scaleX = containerWidth / width;
    const scaleY = containerHeight / height;
    const fitZoom = Math.min(scaleX, scaleY, 2) * 0.95;
    setZoom(Math.max(0.2, fitZoom));
    setPan({ x: 0, y: 0 });
  }, []);

  // Undo/redo + Escape keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (mod && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      // Escape cancels drag or clears selection
      if (e.key === 'Escape') {
        if (dragState?.isDragging) {
          cancelDrag();
        } else if (selectedIds.size > 0) {
          setSelectedIds(new Set());
        }
      }
      // Delete/Backspace removes selected ribs
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        const entries = [];
        for (const ribId of selectedIds) {
          const cell = layout.cells.find(c => c.id === ribId);
          if (cell) entries.push({ themeId: cell.themeId, backboneId: cell.backboneId, ribId: cell.id });
        }
        if (entries.length > 0) mutations.deleteRibs(entries);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [undo, redo, dragState, cancelDrag, selectedIds, layout.cells, mutations]);

  // Rename handlers
  const handleRenameTheme = useCallback((themeId, newName) => {
    mutations.updateTheme(themeId, { name: newName });
  }, [mutations]);

  const handleRenameBackbone = useCallback((themeId, backboneId, newName) => {
    mutations.updateBackbone(themeId, backboneId, { name: newName });
  }, [mutations]);

  const handleRenameRib = useCallback((themeId, backboneId, ribId, newName) => {
    mutations.updateRib(themeId, backboneId, ribId, { name: newName });
  }, [mutations]);

  // Delete handlers
  const handleDeleteTheme = useCallback((themeId) => {
    const theme = product.themes.find(t => t.id === themeId);
    setDeleteTarget({ type: 'theme', themeId, name: theme?.name || 'Theme' });
  }, [product.themes]);

  const handleDeleteBackbone = useCallback((themeId, backboneId) => {
    const theme = product.themes.find(t => t.id === themeId);
    const bb = theme?.backboneItems?.find(b => b.id === backboneId);
    setDeleteTarget({ type: 'backbone', themeId, backboneId, name: bb?.name || 'Backbone' });
  }, [product.themes]);

  const handleDeleteRib = useCallback((themeId, backboneId, ribId) => {
    const theme = product.themes.find(t => t.id === themeId);
    const bb = theme?.backboneItems?.find(b => b.id === backboneId);
    const rib = bb?.ribItems?.find(r => r.id === ribId);
    setDeleteTarget({ type: 'rib', themeId, backboneId, ribId, name: rib?.name || 'Rib Item' });
  }, [product.themes]);

  const handleDeleteRelease = useCallback((releaseId) => {
    const release = product.releases.find(r => r.id === releaseId);
    setDeleteTarget({ type: 'release', releaseId, name: release?.name || 'Release' });
  }, [product.releases]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'theme') {
      mutations.deleteTheme(deleteTarget.themeId);
    } else if (deleteTarget.type === 'backbone') {
      mutations.deleteBackbone(deleteTarget.themeId, deleteTarget.backboneId);
    } else if (deleteTarget.type === 'rib') {
      mutations.deleteRib(deleteTarget.themeId, deleteTarget.backboneId, deleteTarget.ribId);
    } else if (deleteTarget.type === 'release') {
      updateProduct(prev => deleteReleaseFromProduct(prev, deleteTarget.releaseId));
      setSelectedReleaseId(null);
    }
    setDeleteTarget(null);
  }, [deleteTarget, mutations, updateProduct]);

  // Add handlers
  const handleAddTheme = useCallback(() => {
    mutations.addTheme();
  }, [mutations]);

  const handleAddBackbone = useCallback((themeId) => {
    mutations.addBackbone(themeId);
  }, [mutations]);

  const handleAddRib = useCallback((themeId, backboneId) => {
    mutations.addRib(themeId, backboneId);
  }, [mutations]);

  const handleAddRelease = useCallback((beforeReleaseId) => {
    if (!beforeReleaseId) {
      // Clicked on unassigned lane divider — append after all releases
      const sorted = [...product.releases].sort((a, b) => a.order - b.order);
      const lastId = sorted.length > 0 ? sorted[sorted.length - 1].id : null;
      mutations.addReleaseAfter(lastId);
    } else {
      // Clicked on a release divider — insert before that release (= after the previous one)
      const sorted = [...product.releases].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex(r => r.id === beforeReleaseId);
      const prevId = idx > 0 ? sorted[idx - 1].id : null;
      mutations.addReleaseAfter(prevId);
    }
  }, [product.releases, mutations]);

  const handleRenameRelease = useCallback((releaseId, newName) => {
    updateProduct(prev => ({
      ...prev,
      releases: prev.releases.map(r =>
        r.id === releaseId ? { ...r, name: newName } : r
      ),
    }));
  }, [updateProduct]);

  // Compute drag indicator label
  const dragLabel = useMemo(() => {
    if (!dragState?.isDragging) return null;
    if (dragState.dragType === 'theme') return '↔ Reordering theme';
    if (dragState.dragType === 'backbone') return '↔ Moving backbone';

    const backboneChanged = dragState.targetBackboneId && dragState.targetBackboneId !== dragState.backboneId;
    const releaseChanged = dragState.targetReleaseId !== undefined && dragState.targetReleaseId !== dragState.releaseId;
    if (!backboneChanged && !releaseChanged) return null;

    const targetCol = layout.columns.find(c => c.backboneId === dragState.targetBackboneId);
    const targetLane = layout.releaseLanes.find(l => l.releaseId === dragState.targetReleaseId);
    const releaseName = targetLane?.releaseName || (dragState.targetReleaseId === null ? 'Unassigned' : '');

    const count = dragState.selectedIds?.size || 1;
    const prefix = count > 1 ? `Moving ${count} items` : 'Moving';

    if (backboneChanged && releaseChanged) return `${prefix} → ${targetCol?.backboneName} / ${releaseName}`;
    if (backboneChanged) return `${prefix} → ${targetCol?.backboneName}`;
    return `${prefix} → ${releaseName}`;
  }, [dragState, layout.columns, layout.releaseLanes]);

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
        onDragEnd={handleDragEnd}
        layoutCells={layout.cells}
      >
        <MapContent
          layout={layout}
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
          onAddTheme={handleAddTheme}
          onAddBackbone={handleAddBackbone}
          onAddRib={handleAddRib}
          onAddRelease={handleAddRelease}
          dragState={dragState}
          onDragStart={handleDragStart}
          onBackboneDragStart={handleBackboneDragStart}
          onThemeDragStart={handleThemeDragStart}
          selectedIds={selectedIds}
        />
      </MapCanvas>

      {selectedRib && (
        <RibDetailPanel
          rib={selectedRib}
          product={product}
          onClose={handleCloseDetail}
          onRename={handleRenameRib}
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
