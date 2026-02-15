import { useState, useCallback, useMemo } from 'react';
import { deleteReleaseFromProduct } from '../../lib/settingsMutations';

/**
 * All CRUD handlers for the story map: rename, delete, add, and drag label.
 * Extracted from StoryMapView to reduce its size.
 */
export default function useMapHandlers({
  product, updateProduct, mutations,
  setSelectedReleaseId, layout, dragState,
}) {
  const [deleteTarget, setDeleteTarget] = useState(null);

  // --- Rename handlers ---

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

  // --- Delete handlers ---

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
  }, [deleteTarget, mutations, updateProduct, setSelectedReleaseId]);

  // --- Add handlers ---

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

  // --- Drag indicator label ---

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

  return {
    handleRenameTheme, handleRenameBackbone, handleRenameRib, handleRenameRelease,
    handleDeleteTheme, handleDeleteBackbone, handleDeleteRib, handleDeleteRelease,
    handleConfirmDelete, deleteTarget, setDeleteTarget,
    handleAddTheme, handleAddBackbone, handleAddRib, handleAddRelease,
    dragLabel,
  };
}
