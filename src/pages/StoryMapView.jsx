import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useProductMutations } from '../hooks/useProductMutations';
import MapCanvas from '../components/storymap/MapCanvas';
import MapContent from '../components/storymap/MapContent';
import RibDetailPanel from '../components/storymap/RibDetailPanel';
import ReleaseDetailPanel from '../components/storymap/ReleaseDetailPanel';
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

  // Derive selectedRib from layout so it stays in sync with product changes (e.g. renames)
  const selectedRib = useMemo(() => {
    if (!selectedRibId) return null;
    return layout.cells.find(c => c.id === selectedRibId) || null;
  }, [selectedRibId, layout.cells]);
  const mapSizeRef = useRef({ width: 0, height: 0 });
  const containerRef = useRef(null);
  const didAutoFit = useRef(false);

  const { dragState, handleDragStart, handleBackboneDragStart, handleDragMove, handleDragEnd, cancelDrag } = useMapDrag({
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

    const isMod = e?.metaKey || e?.ctrlKey;
    const isShift = e?.shiftKey;

    if (isMod || isShift) {
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
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [undo, redo, dragState, cancelDrag, selectedIds]);

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
    if (dragState.dragType === 'backbone') return '↔ Moving backbone between themes';

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
          dragState={dragState}
          onDragStart={handleDragStart}
          onBackboneDragStart={handleBackboneDragStart}
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
        />
      )}

      {/* Drag indicator badge */}
      {dragLabel && (
        <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded shadow z-50 pointer-events-none">
          {dragLabel}
        </div>
      )}

      {/* Selection count badge */}
      {selectedIds.size > 0 && !dragState?.isDragging && (
        <div className="absolute bottom-3 left-3 bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded shadow z-50 pointer-events-none">
          {selectedIds.size} selected
        </div>
      )}
    </div>
  );
}
