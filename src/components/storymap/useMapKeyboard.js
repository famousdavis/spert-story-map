import { useEffect } from 'react';

/**
 * Keyboard shortcuts for the story map.
 * Side-effect-only hook — returns nothing.
 *
 * Handles: undo/redo, Escape (cancel drag or clear selection),
 * Delete/Backspace (bulk-delete selected ribs).
 */
export default function useMapKeyboard({
  undo, redo, dragState, cancelDrag,
  selectedIds, setSelectedIds, layoutCells, mutations,
}) {
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
          const cell = layoutCells.find(c => c.id === ribId);
          if (cell) entries.push({ themeId: cell.themeId, backboneId: cell.backboneId, ribId: cell.id });
        }
        if (entries.length > 0) mutations.deleteRibs(entries);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [undo, redo, dragState, cancelDrag, selectedIds, layoutCells, mutations, setSelectedIds]);
}
