// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Keyboard shortcuts for the story map.
 * Side-effect-only hook — returns nothing.
 *
 * Handles: undo/redo, Escape, Delete/Backspace (bulk-delete selected ribs).
 *
 * Escape is decided here and only here, in this order: a press that may still become a
 * drag (`dragPointerRef` set, whether or not it has passed the threshold) is cancelled
 * and nothing else happens; else an open theme or backbone panel closes; else the
 * multi-selection clears. A key typed in an input or textarea never reaches any of it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- mutations and layout cells have complex hook-derived shapes */
export default function useMapKeyboard({ undo, redo, dragPointerRef, cancelDrag, entityPanelOpen, closeEntityPanel, selectedIds, setSelectedIds, layoutCells, mutations }: {
  undo: () => void;
  redo: () => void;
  /** Set from a drag's press until it ends or is cancelled. Read live. */
  dragPointerRef: RefObject<unknown>;
  cancelDrag: () => void;
  entityPanelOpen: boolean;
  closeEntityPanel: () => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  layoutCells: any[];
  mutations: any;
}): void {
/* eslint-enable @typescript-eslint/no-explicit-any */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
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
      if (e.key === 'Escape') {
        if (dragPointerRef.current) {
          cancelDrag();
        } else if (entityPanelOpen) {
          closeEntityPanel();
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
  }, [undo, redo, dragPointerRef, cancelDrag, entityPanelOpen, closeEntityPanel, selectedIds, layoutCells, mutations, setSelectedIds]);
}
