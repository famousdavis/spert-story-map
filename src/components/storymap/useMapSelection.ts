// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Theme } from '../../types';
import type { MapCell } from './useMapLayout';
import { pruneSelection } from './collapseHelpers';
import { entityKey, isEntity, resolveEntity } from './mapEntity';
import type { MapEntityTarget, MapSelection } from './mapEntity';

/** A single click on a theme or backbone name opens its panel this much later; a double click renames instead. */
export const NAME_CLICK_DELAY = 200;

interface Args {
  cells: MapCell[];
  themes: Theme[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drag state is the map drag hook's four-variant union
  dragState: any;
  /** Set while a press on the map may still become a drag. Read live when a pending open fires, never as state. */
  dragPointerRef: RefObject<unknown>;
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  /** Called when a pending open fires, with the name that was clicked. */
  onEntityOpened?: (anchor: HTMLElement | null) => void;
}

/**
 * The map's one selection: which of the four panels is open (rib, release, theme,
 * backbone), plus the pending open of a theme or backbone name. Every path that opens
 * or closes a panel goes through here, so two panels cannot be open at once and no
 * path forgets to cancel a pending open.
 *
 * The pending open: a name click arms it; a second click on the same name while it
 * is pending is ignored (a double click keeps one timer); a click on another name
 * replaces it. It is cancelled by a double click, by any other selection change or
 * close, by a press anywhere in the map or the panel other than on that name, and by
 * unmount. It does nothing if a drag is armed when it fires.
 */
export default function useMapSelection({ cells, themes, dragState, dragPointerRef, selectedIds, setSelectedIds, onEntityOpened }: Args) {
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const pending = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const onOpened = useRef(onEntityOpened);
  useEffect(() => { onOpened.current = onEntityOpened; });

  // A click straight after a drag is the drag's own release: ignore it.
  const recentDragRef = useRef(false);
  useEffect(() => {
    if (dragState?.isDragging) {
      recentDragRef.current = true;
    } else if (recentDragRef.current) {
      const t = setTimeout(() => { recentDragRef.current = false; }, 100);
      return () => clearTimeout(t);
    }
  }, [dragState]);

  const cancelPending = useCallback(() => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);
  useEffect(() => cancelPending, [cancelPending]);

  const select = useCallback((next: MapSelection | null) => {
    cancelPending();
    setSelection(next);
  }, [cancelPending]);

  const armEntityOpen = useCallback((target: MapEntityTarget, anchor: HTMLElement | null) => {
    const key = entityKey(target);
    if (pending.current?.key === key) return;
    cancelPending();
    const timer = setTimeout(() => {
      pending.current = null;
      if (dragPointerRef.current) return;
      setSelectedIds(new Set());
      setSelection(target);
      onOpened.current?.(anchor);
    }, NAME_CLICK_DELAY);
    pending.current = { key, timer };
  }, [cancelPending, dragPointerRef, setSelectedIds]);

  /** A press in the map or the panel: cancels the pending open unless it is on the pending name. */
  const cancelPendingUnlessOn = useCallback((target: EventTarget | null) => {
    const current = pending.current;
    if (!current) return;
    const name = target instanceof Element ? target.closest('[data-map-name]') : null;
    if (name?.getAttribute('data-map-name') !== current.key) cancelPending();
  }, [cancelPending]);

  const handleRibClick = useCallback((cell: { id: string }, e?: { shiftKey?: boolean }) => {
    if (recentDragRef.current) return;
    if (e?.shiftKey) {
      // Shift starts or extends a multi-selection, and closes whatever panel is open.
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(cell.id)) next.delete(cell.id);
        else next.add(cell.id);
        return next;
      });
      select(null);
    } else {
      setSelectedIds(new Set());
      select({ kind: 'rib', id: cell.id, isNew: false });
    }
  }, [select, setSelectedIds]);

  const handleReleaseClick = useCallback((releaseId: string) => {
    if (recentDragRef.current) return;
    setSelectedIds(new Set());
    select({ kind: 'release', id: releaseId });
  }, [select, setSelectedIds]);

  const handleRibAdded = useCallback((id: string) => {
    setSelectedIds(new Set());
    select({ kind: 'rib', id, isNew: true });
  }, [select, setSelectedIds]);

  /** Every panel's `×`, and the rib and release backdrops. */
  const close = useCallback(() => select(null), [select]);

  /** Clicking empty canvas: the escape hatch for a multi-selection and any open panel. */
  const handleBackgroundDeselect = useCallback(() => {
    setSelectedIds(new Set());
    select(null);
  }, [select, setSelectedIds]);

  /** A release was deleted: its panel, if that is the open one, goes with it. */
  const closeRelease = useCallback((releaseId: string) => {
    cancelPending();
    setSelection(s => (s?.kind === 'release' && s.id === releaseId ? null : s));
  }, [cancelPending]);

  const selectedRib = useMemo(() => {
    if (selection?.kind !== 'rib') return null;
    return cells.find(c => c.id === selection.id) || null;
  }, [selection, cells]);

  const entity = useMemo(() => {
    if (!isEntity(selection)) return null;
    const resolved = resolveEntity(themes, selection);
    if (!resolved) return null;
    // The ring follows the backbone to the theme that holds it now; the editor stays keyed to the click.
    const ringKey = resolved.kind === 'theme'
      ? entityKey(selection)
      : entityKey({ kind: 'backbone', id: selection.id, themeIdAtClick: resolved.theme.id });
    return { target: selection, editorKey: entityKey(selection), ringKey };
  }, [selection, themes]);

  /* eslint-disable react-hooks/set-state-in-effect -- reconcile the selection to what still exists after a collapse/bulk/delete/remote change; every setter is guarded and converges */
  // A panel whose rib is no longer visible, or whose theme or backbone no longer exists, closes.
  useEffect(() => {
    if ((selection?.kind === 'rib' && !selectedRib) || (isEntity(selection) && !entity)) select(null);
  }, [selection, selectedRib, entity, select]);

  // Prune the multi-selection to ids that still resolve to a visible cell.
  useEffect(() => {
    const visible = new Set(cells.map(c => c.id));
    const pruned = pruneSelection(selectedIds, visible);
    if (pruned) setSelectedIds(pruned);
  }, [selectedIds, cells, setSelectedIds]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    selection,
    selectedRib,
    selectedReleaseId: selection?.kind === 'release' ? selection.id : null,
    isNewRib: selection?.kind === 'rib' && selection.isNew,
    entity,
    armEntityOpen,
    cancelPending,
    cancelPendingUnlessOn,
    handleRibClick,
    handleReleaseClick,
    handleRibAdded,
    handleBackgroundDeselect,
    close,
    closeRelease,
  };
}
