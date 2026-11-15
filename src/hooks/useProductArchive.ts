// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import {
  canHoldPref, hasRoomFor, isArchived, prefEntries, prefOf, withPref,
  type ProjectPref, type ProjectPrefs, type TileColor,
} from '../lib/projectPrefs';
import { REMOVE } from '../lib/prefEntries';
import {
  CAP_NOTICE, REFUSED_ID_REASON, SETTINGS_UNREAD_REASON, archivedMessage, importArchivedLine, unarchivedMessage,
} from '../components/product/archive-text';
import { focusAfterTileLeaves, resolveFocusTarget, type TileFocusTarget } from '../components/product/tile-focus';
import type { FirstSettingsRead } from './useProjectOrder';
import type { StorageDriver } from '../types';

interface Args<P> {
  driver: StorageDriver | null;
  /** Every listed product, in order. */
  products: P[];
  /** The first settings read (`useProjectOrder`): what it read, or that it failed (R88). */
  settings: FirstSettingsRead;
  rootRef: RefObject<HTMLElement | null>;
  newProductRef: RefObject<HTMLButtonElement | null>;
  /** ProductList's own live region (R-3: no second one). */
  announce: (message: string) => void;
}

/**
 * Tile colour, Archive and "Show archived (N)" on the Products page (v0.56.0), shaped like
 * Forecaster's `useProjectArchive` (09c4cda):
 * - "Show archived (N)" counts listed products, never map entries; not saved, off on each visit and
 *   off again once N returns to 0.
 * - Focus after Archive with the box off: the next shown tile's open button, else the previous, else
 *   New Product; with the box on, that tile's Unarchive. After Unarchive: that tile's Archive.
 * - Every write is one entry per changed field (`prefEntries`), never the whole map, with no read
 *   first. The map shown is what the first read gave plus this tab's own changes: no listener.
 */
export function useProductArchive<P extends { id: string; name: string }>(
  { driver, products, settings, rootRef, newProductRef, announce }: Args<P>,
) {
  const [held, setHeld] = useState<{ base: ProjectPrefs; prefs: ProjectPrefs }>({ base: settings.prefs, prefs: settings.prefs });
  // A new read replaces what this tab holds (React's "storing information from previous renders").
  if (held.base !== settings.prefs) setHeld({ base: settings.prefs, prefs: settings.prefs });
  const prefs = held.base === settings.prefs ? held.prefs : settings.prefs;

  const [showArchived, setShowArchived] = useState(false);
  const [colorOpenFor, setColorOpenFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ target: TileFocusTarget } | null>(null);

  const archivedCount = useMemo(() => products.filter(p => isArchived(prefs, p.id)).length, [products, prefs]);
  if (showArchived && archivedCount === 0) setShowArchived(false);
  const shown = useMemo(
    () => (showArchived ? products : products.filter(p => !isArchived(prefs, p.id))),
    [products, prefs, showArchived],
  );
  const hiddenIds = useMemo(
    () => new Set(showArchived ? [] : products.filter(p => isArchived(prefs, p.id)).map(p => p.id)),
    [products, prefs, showArchived],
  );
  if (colorOpenFor !== null && !shown.some(p => p.id === colorOpenFor)) setColorOpenFor(null);

  useEffect(() => {
    if (focusRequest) resolveFocusTarget(rootRef.current, focusRequest.target, newProductRef.current)?.focus();
  }, [focusRequest, rootRef, newProductRef]);

  /** Why colour and archive are off for this product, or null. */
  const disabledReason = useCallback((id: string): string | null => {
    if (settings.status === 'failed') return SETTINGS_UNREAD_REASON;
    return canHoldPref(id) ? null : REFUSED_ID_REASON;
  }, [settings.status]);

  /** Set `id`'s entry to `after`; false when refused (disabled, or the cap, which says so). */
  const write = useCallback((id: string, after: ProjectPref): boolean => {
    if (disabledReason(id) !== null || !driver) return false;
    const before = prefOf(prefs, id);
    const entries = prefEntries(id, before, after);
    if (entries.length === 0) return true;
    if (!before.color && !before.archived && !hasRoomFor(prefs, id)) {
      setNotice(CAP_NOTICE);
      announce(CAP_NOTICE);
      return false;
    }
    setHeld(h => ({ base: h.base, prefs: withPref(h.prefs, id, after) }));
    driver.writePreferences(entries);
    return true;
  }, [disabledReason, driver, prefs, announce]);

  const archive = useCallback((p: P) => {
    if (!write(p.id, { ...prefOf(prefs, p.id), archived: true })) return;
    setColorOpenFor(null);
    if (showArchived) {
      setFocusRequest({ target: { kind: 'named', projectId: p.id, name: `Unarchive ${p.name}` } });
      announce(archivedMessage(p.name, null));
      return;
    }
    setFocusRequest({ target: focusAfterTileLeaves(shown, p.id) });
    announce(archivedMessage(p.name, archivedCount + 1));
  }, [write, prefs, showArchived, shown, archivedCount, announce]);

  const unarchive = useCallback((p: P) => {
    if (!write(p.id, { ...prefOf(prefs, p.id), archived: undefined })) return;
    setFocusRequest({ target: { kind: 'named', projectId: p.id, name: `Archive ${p.name}` } });
    announce(unarchivedMessage(p.name));
  }, [write, prefs, announce]);

  /** R61 with R86: an archived product is unarchived as it opens, with no message after. */
  const unarchiveForOpen = useCallback((id: string) => {
    if (isArchived(prefs, id)) write(id, { ...prefOf(prefs, id), archived: undefined });
  }, [prefs, write]);

  const pickColor = useCallback(
    (id: string, color: TileColor | null) => write(id, { ...prefOf(prefs, id), color: color ?? undefined }),
    [prefs, write],
  );

  /** R-5: a clone takes its source's colour, never its archive. */
  const copyColor = useCallback((fromId: string, toId: string) => {
    const color = prefOf(prefs, fromId).color;
    if (color) write(toId, { color });
  }, [prefs, write]);

  /**
   * R-5: a deleted product's entry goes, once the list no longer holds it (the caller checks). Written
   * even when this tab holds no entry for it: with no listener, another tab may have set one since.
   */
  const dropEntry = useCallback((id: string) => {
    if (!driver || !canHoldPref(id)) return;
    setHeld(h => ({ base: h.base, prefs: withPref(h.prefs, id, {}) }));
    driver.writePreferences([{ path: ['projectPrefs', id], value: REMOVE }]);
  }, [driver]);

  /** By id, for the grid; a tile that has gone does nothing. */
  const archiveId = useCallback((id: string) => { const p = shown.find(x => x.id === id); if (p) archive(p); }, [shown, archive]);
  const unarchiveId = useCallback((id: string) => { const p = shown.find(x => x.id === id); if (p) unarchive(p); }, [shown, unarchive]);

  /** R84: the import banner's line for the products an import wrote that are archived, or null. */
  const importNote = useCallback(
    (written: readonly { id: string; name: string }[]) => importArchivedLine(written.filter(w => isArchived(prefs, w.id)).map(w => w.name)),
    [prefs],
  );

  const setColorOpen = useCallback((id: string, open: boolean) => {
    setColorOpenFor(current => (open ? id : current === id ? null : current));
  }, []);

  return {
    prefs, showArchived, setShowArchived, archivedCount, shown, hiddenIds, notice,
    colorOpenFor, setColorOpen, disabledReason,
    archive, unarchive, archiveId, unarchiveId, unarchiveForOpen, pickColor, copyColor, dropEntry, importNote,
  };
}
