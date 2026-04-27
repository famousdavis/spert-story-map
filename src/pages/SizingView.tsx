// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useProductMutations } from '../hooks/useProductMutations';
import { useSessionState } from '../hooks/useSessionState';
import MapCanvas from '../components/storymap/MapCanvas';
import DragGhost from '../components/storymap/DragGhost';
import useSizingLayout from '../components/sizing/useSizingLayout';
import { DEFAULT_SIZING_FILTER } from '../components/sizing/useSizingLayout';
import type { SizingFilter } from '../components/sizing/useSizingLayout';
import useSizingDrag from '../components/sizing/useSizingDrag';
import SizingContent from '../components/sizing/SizingContent';
import type { SizingCell } from '../components/sizing/SizingContent';
import SizingFilterPanel from '../components/sizing/SizingFilterPanel';
import SizingRibModal from '../components/sizing/SizingRibModal';
import type { SizingRibModalSaveInput, SizingRibModalCreateInput } from '../components/sizing/SizingRibModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { OutletContextValue } from '../types';

export default function SizingView() {
  const { product, updateProduct, undo, redo } = useOutletContext<OutletContextValue>();
  const mutations = useProductMutations(updateProduct);
  const [filter, setFilter] = useSessionState<SizingFilter>(
    `sizing-filter:${product.id}`,
    DEFAULT_SIZING_FILTER,
  );

  // Orphan strip: drop any themeIds/releaseIds in the persisted filter that no longer
  // exist in the current product. Self-heals when entities are deleted in another tab.
  useEffect(() => {
    const validThemeIds = new Set(product.themes.map(t => t.id));
    const validReleaseIds = new Set((product.releases ?? []).map(r => r.id));
    const cleanThemes = filter.themeIds.filter(id => validThemeIds.has(id));
    const cleanReleases = (filter.releaseIds ?? []).filter(id => validReleaseIds.has(id));
    if (
      cleanThemes.length !== filter.themeIds.length ||
      cleanReleases.length !== (filter.releaseIds ?? []).length
    ) {
      setFilter({ ...filter, themeIds: cleanThemes, releaseIds: cleanReleases });
    }
  }, [product.themes, product.releases, filter, setFilter]);
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
  }, [setFilter]);

  // Per-rib actions wired into kebab menu on each card
  const [pendingDeleteCell, setPendingDeleteCell] = useState<SizingCell | null>(null);
  const [editingCell, setEditingCell] = useState<SizingCell | null>(null);

  const handleRibEdit = useCallback((cell: SizingCell) => {
    setEditingCell(cell);
  }, []);

  const handleEditSave = useCallback((updates: SizingRibModalSaveInput) => {
    if (!editingCell) return;
    // Locked-state size-omission boundary: when the original cell was locked,
    // strip `size` from the mutation payload so historical points/percent math is preserved.
    const payload = editingCell.locked
      ? { name: updates.name, description: updates.description, category: updates.category, notes: updates.notes }
      : updates;
    mutations.updateRib(editingCell.themeId, editingCell.backboneId, editingCell.id, payload);
  }, [editingCell, mutations]);

  // Add Rib flow — modal create mode with smart defaults frozen at click time
  const [createPresets, setCreatePresets] = useState<{ presetThemeId?: string; presetBackboneId?: string } | null>(null);

  const openAddModal = useCallback(() => {
    // Compute presets from the current filter at the moment of click; frozen for modal lifetime.
    const presetThemeId = filter.themeIds.length === 1 ? filter.themeIds[0] : undefined;
    let presetBackboneId: string | undefined;
    if (presetThemeId) {
      const theme = product.themes.find(t => t.id === presetThemeId);
      if (theme && theme.backboneItems.length === 1) {
        presetBackboneId = theme.backboneItems[0].id;
      }
    }
    setCreatePresets({ presetThemeId, presetBackboneId });
  }, [filter, product.themes]);

  const handleCreate = useCallback((input: SizingRibModalCreateInput) => {
    mutations.addNamedRib(input.themeId, input.backboneId, {
      name: input.name,
      category: input.category,
      size: input.size,
      description: input.description,
      notes: input.notes,
    });
  }, [mutations]);

  const handleRibSplit = useCallback((cell: SizingCell) => {
    mutations.splitRib(cell.themeId, cell.backboneId, cell.id);
  }, [mutations]);

  const handleRibDelete = useCallback((cell: SizingCell) => {
    setPendingDeleteCell(cell);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!pendingDeleteCell) return;
    mutations.deleteRib(pendingDeleteCell.themeId, pendingDeleteCell.backboneId, pendingDeleteCell.id);
    setPendingDeleteCell(null);
  }, [pendingDeleteCell, mutations]);

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
          <div className="flex flex-col items-end gap-2">
            <SizingFilterPanel
              themes={themes}
              releases={releases}
              filter={filter}
              onFilterChange={handleFilterChange}
            />
            <button
              type="button"
              onClick={openAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded shadow-sm"
            >
              + Rib
            </button>
          </div>
        }
      >
        <SizingContent
          layout={layout}
          mapSizeRef={mapSizeRef}
          dragState={dragState}
          onDragStart={handleDragStart}
          onRibEdit={handleRibEdit}
          onRibSplit={handleRibSplit}
          onRibDelete={handleRibDelete}
        />
      </MapCanvas>

      <DragGhost dragState={dragState} cells={layout.cells} zoom={zoom} />

      {dragLabel && (
        <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded shadow z-50 pointer-events-none">
          {dragLabel}
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteCell !== null}
        onClose={() => setPendingDeleteCell(null)}
        onConfirm={confirmDelete}
        title="Delete rib item?"
        message={pendingDeleteCell ? `Delete "${pendingDeleteCell.name}"? You can undo with Ctrl+Z.` : ''}
        danger
      />

      {editingCell && (
        <SizingRibModal
          key={editingCell.id}
          open
          mode={{ kind: 'edit', themeId: editingCell.themeId, backboneId: editingCell.backboneId, ribId: editingCell.id }}
          product={product}
          locked={editingCell.locked}
          onClose={() => setEditingCell(null)}
          onSave={handleEditSave}
        />
      )}

      {createPresets && (
        <SizingRibModal
          key={`create:${createPresets.presetThemeId ?? ''}:${createPresets.presetBackboneId ?? ''}`}
          open
          mode={{ kind: 'create', presetThemeId: createPresets.presetThemeId, presetBackboneId: createPresets.presetBackboneId }}
          product={product}
          locked={false}
          onClose={() => setCreatePresets(null)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
