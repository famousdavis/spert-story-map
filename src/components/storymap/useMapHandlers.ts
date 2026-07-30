// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useMemo } from 'react';
import type { Product } from '../../types';
import type { RibCardColorKey } from '../../lib/ribCardColors';
import type { MapLayout } from './useMapLayout';
import { deleteReleaseFromProduct } from '../../lib/settingsMutations';

type UpdateProduct = (updater: (prev: Product) => Product) => void;

/**
 * All CRUD handlers for the story map: rename, delete, add, and drag label.
 * Extracted from StoryMapView to reduce its size.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- mutations and layout objects have complex hook-derived shapes */
export default function useMapHandlers({ product, updateProduct, mutations, setSelectedReleaseId, onRibAdded, layout, dragState }: {
  product: Product;
  updateProduct: UpdateProduct;
  mutations: any;
  setSelectedReleaseId: (id: string | null) => void;
  onRibAdded: (id: string) => void;
  layout: MapLayout;
  dragState: any;
}) {
/* eslint-enable @typescript-eslint/no-explicit-any */
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; themeId?: string; backboneId?: string; ribId?: string; releaseId?: string; name: string } | null>(null);

  // --- Rename handlers ---

  const handleRenameTheme = useCallback((themeId: string, newName: string) => {
    mutations.updateTheme(themeId, { name: newName });
  }, [mutations]);

  const handleRenameBackbone = useCallback((themeId: string, backboneId: string, newName: string) => {
    mutations.updateBackbone(themeId, backboneId, { name: newName });
  }, [mutations]);

  const handleRenameRib = useCallback((themeId: string, backboneId: string, ribId: string, newName: string) => {
    mutations.updateRib(themeId, backboneId, ribId, { name: newName });
  }, [mutations]);

  const handleRenameRelease = useCallback((releaseId: string, newName: string) => {
    updateProduct(prev => ({
      ...prev,
      releases: prev.releases.map(r =>
        r.id === releaseId ? { ...r, name: newName } : r
      ),
    }));
  }, [updateProduct]);

  // --- Delete handlers ---

  const handleDeleteTheme = useCallback((themeId: string) => {
    const theme = product.themes.find(t => t.id === themeId);
    setDeleteTarget({ type: 'theme', themeId, name: theme?.name || 'Theme' });
  }, [product.themes]);

  const handleDeleteBackbone = useCallback((themeId: string, backboneId: string) => {
    const theme = product.themes.find(t => t.id === themeId);
    const bb = theme?.backboneItems?.find(b => b.id === backboneId);
    setDeleteTarget({ type: 'backbone', themeId, backboneId, name: bb?.name || 'Backbone' });
  }, [product.themes]);

  const handleDeleteRib = useCallback((themeId: string, backboneId: string, ribId: string) => {
    const theme = product.themes.find(t => t.id === themeId);
    const bb = theme?.backboneItems?.find(b => b.id === backboneId);
    const rib = bb?.ribItems?.find(r => r.id === ribId);
    setDeleteTarget({ type: 'rib', themeId, backboneId, ribId, name: rib?.name || 'Rib Item' });
  }, [product.themes]);

  const handleDeleteRelease = useCallback((releaseId: string) => {
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
  }, [deleteTarget, mutations, updateProduct, setSelectedReleaseId]);

  // --- Add handlers ---

  const handleAddTheme = useCallback(() => {
    mutations.addTheme();
  }, [mutations]);

  const handleAddBackbone = useCallback((themeId: string) => {
    mutations.addBackbone(themeId);
  }, [mutations]);

  const handleAddRib = useCallback((themeId: string, backboneId: string) => {
    const id = mutations.addRib(themeId, backboneId);
    onRibAdded(id);
  }, [mutations, onRibAdded]);

  const handleAddRibToRelease = useCallback((themeId: string, backboneId: string, releaseId: string) => {
    const id = mutations.addRibToRelease(themeId, backboneId, releaseId);
    onRibAdded(id);
  }, [mutations, onRibAdded]);

  const handleCloneRib = useCallback((themeId: string, backboneId: string, ribId: string) => {
    const id = mutations.cloneRib(themeId, backboneId, ribId);
    onRibAdded(id);
  }, [mutations, onRibAdded]);

  const handleSetRibCardColor = useCallback((themeId: string, backboneId: string, ribId: string, color: RibCardColorKey | undefined) => {
    mutations.updateRib(themeId, backboneId, ribId, { cardColor: color });
  }, [mutations]);

  const handleAddRelease = useCallback((beforeReleaseId: string | null) => {
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

  const handleAddReleaseAfter = useCallback((releaseId: string) => {
    mutations.addReleaseAfter(releaseId);
  }, [mutations]);

  // --- Drag indicator label ---

  const dragLabel = useMemo(() => {
    if (!dragState?.isDragging) return null;
    if (dragState.dragType === 'theme') return '↔ Reordering theme';
    if (dragState.dragType === 'backbone') return '↔ Moving backbone';
    if (dragState.dragType === 'release') return '↕ Reordering release';

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

  return {
    handleRenameTheme, handleRenameBackbone, handleRenameRib, handleRenameRelease,
    handleDeleteTheme, handleDeleteBackbone, handleDeleteRib, handleDeleteRelease,
    handleConfirmDelete, deleteTarget, setDeleteTarget,
    handleAddTheme, handleAddBackbone, handleAddRib, handleAddRibToRelease, handleAddRelease, handleAddReleaseAfter,
    handleCloneRib,
    handleSetRibCardColor,
    dragLabel,
  };
}
