import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useProductMutations } from '../hooks/useProductMutations';
import MapCanvas from '../components/storymap/MapCanvas';
import MapContent from '../components/storymap/MapContent';
import RibDetailPanel from '../components/storymap/RibDetailPanel';
import ReleaseDetailPanel from '../components/storymap/ReleaseDetailPanel';
import DragGhost from '../components/storymap/DragGhost';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import useMapDrag from '../components/storymap/useMapDrag';
import useMapLayout from '../components/storymap/useMapLayout';
import useMapKeyboard from '../components/storymap/useMapKeyboard';
import useMapHandlers from '../components/storymap/useMapHandlers';

export default function StoryMapView() {
  const { product, updateProduct, undo, redo } = useOutletContext();
  const mutations = useProductMutations(updateProduct);
  const layout = useMapLayout(product);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedRibId, setSelectedRibId] = useState(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

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

  // Keyboard shortcuts (undo/redo, escape, delete)
  useMapKeyboard({
    undo, redo, dragState, cancelDrag,
    selectedIds, setSelectedIds, layoutCells: layout.cells, mutations,
  });

  // CRUD handlers (rename, delete, add) + drag label
  const {
    handleRenameTheme, handleRenameBackbone, handleRenameRib, handleRenameRelease,
    handleDeleteTheme, handleDeleteBackbone, handleDeleteRib, handleDeleteRelease,
    handleConfirmDelete, deleteTarget, setDeleteTarget,
    handleAddTheme, handleAddBackbone, handleAddRib, handleAddRelease,
    dragLabel,
  } = useMapHandlers({
    product, updateProduct, mutations,
    setSelectedReleaseId, layout, dragState,
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
