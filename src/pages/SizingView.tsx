// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useProductMutations } from '../hooks/useProductMutations';
import MapCanvas from '../components/storymap/MapCanvas';
import DragGhost from '../components/storymap/DragGhost';
import useSizingLayout from '../components/sizing/useSizingLayout';
import { DEFAULT_SIZING_FILTER } from '../components/sizing/useSizingLayout';
import type { SizingFilter } from '../components/sizing/useSizingLayout';
import useSizingDrag from '../components/sizing/useSizingDrag';
import SizingContent from '../components/sizing/SizingContent';
import SizingFilterPanel from '../components/sizing/SizingFilterPanel';
import type { OutletContextValue } from '../types';

export default function SizingView() {
  const { product, updateProduct, undo, redo } = useOutletContext<OutletContextValue>();
  const mutations = useProductMutations(updateProduct);
  const [filter, setFilter] = useState<SizingFilter>(DEFAULT_SIZING_FILTER);
  const layout = useSizingLayout(product, filter);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const mapSizeRef = useRef({ width: 0, height: 0 });
  const containerRef = useRef(null);
  const didAutoFit = useRef(false);

  const { dragState, handleDragStart, handleDragMove, handleDragEnd, cancelDrag } =
    useSizingDrag({ layout, zoom, pan, mutations, updateProduct });

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

  const themes = useMemo(() =>
    product.themes.map(t => ({ id: t.id, name: t.name, color: t.color })),
    [product.themes]
  );

  const releases = useMemo(() =>
    (product.releases || []).map(r => ({ id: r.id, name: r.name })),
    [product.releases]
  );

  const handleFilterChange = useCallback((next: SizingFilter) => {
    didAutoFit.current = false;
    setFilter(next);
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
      if (e.key === 'Escape' && dragState?.isDragging) {
        cancelDrag();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [undo, redo, dragState, cancelDrag]);

  // Drag label badge
  const dragLabel = useMemo(() => {
    if (!dragState?.isDragging) return null;
    if (dragState.targetSize === dragState.sourceSize) return null;
    const target = dragState.targetSize || 'Unsized';
    return `Moving → ${target}`;
  }, [dragState]);

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
        overlayControls={
          <SizingFilterPanel
            themes={themes}
            releases={releases}
            filter={filter}
            onFilterChange={handleFilterChange}
          />
        }
      >
        <SizingContent
          layout={layout}
          mapSizeRef={mapSizeRef}
          dragState={dragState}
          onDragStart={handleDragStart}
        />
      </MapCanvas>

      <DragGhost dragState={dragState} cells={layout.cells} zoom={zoom} />

      {dragLabel && (
        <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded shadow z-50 pointer-events-none">
          {dragLabel}
        </div>
      )}
    </div>
  );
}
