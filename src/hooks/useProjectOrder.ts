// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sortByOrder } from '../lib/sortByOrder';
import type { StorageDriver } from '../types';

/** A clone created but not yet listed by a refresh: its name is taken and its place is held. */
interface InFlight { name: string; settledAt?: number }

/**
 * The Products page's order (v0.55.0): the persisted `projectOrder`, drops, and where a clone goes.
 *
 * `projectOrder` (state) is what the list is sorted by. `orderRef` is the LATEST order, updated at
 * once by every clone, drop and refresh. A clone is placed from it, not from the list as shown:
 * from the list, a second Clone before the first refresh would leave the first copy out of the
 * saved order, and it would sort last (`sortByOrder.ts:14`).
 *
 * A clone in flight also holds its name until a refresh lists it, so a double-click on Clone gives
 * "(Copy)" and "(Copy 2)", as import's running list of names does (`import-utils.ts:247-251`).
 */
export function useProjectOrder<P extends { id: string; name: string }>(driver: StorageDriver | null, products: P[]) {
  const [projectOrder, setProjectOrder] = useState<string[] | undefined>(undefined);
  const orderRef = useRef<string[] | undefined>(undefined);
  const listedRef = useRef<P[]>([]);
  const inFlightRef = useRef(new Map<string, InFlight>());
  const refreshGenRef = useRef(0);

  const sorted = useMemo(() => sortByOrder(products, projectOrder), [products, projectOrder]);

  // The persisted order, read once per driver.
  useEffect(() => {
    if (!driver) return;
    driver.loadPreferences().then(prefs => {
      if (prefs?.projectOrder) {
        orderRef.current = prefs.projectOrder;
        setProjectOrder(prefs.projectOrder);
      }
    });
  }, [driver]);

  /** Every listed project and every in-flight clone, in the latest order. */
  const currentOrder = useCallback((): string[] => {
    const ids = listedRef.current.map(p => p.id);
    for (const id of inFlightRef.current.keys()) if (!ids.includes(id)) ids.push(id);
    return sortByOrder(ids.map(id => ({ id })), orderRef.current).map(x => x.id);
  }, []);

  /** Show and persist an order. Writes `projectOrder` alone, with no read first (v0.55.14). */
  const saveOrder = useCallback((ids: string[]) => {
    orderRef.current = ids;
    setProjectOrder(ids);
    driver?.writePreferences([{ path: ['projectOrder'], value: ids }]);
  }, [driver]);

  /** A refresh is starting; returns its number, to hand back to `listed`. */
  const refreshStarted = useCallback(() => ++refreshGenRef.current, []);

  /**
   * A refresh's list arrived. An in-flight clone leaves the pool once listed, or once its create
   * settled before this refresh began: a create that failed is never listed, and must not hold its
   * name and place for ever.
   */
  const listed = useCallback((list: P[], gen: number) => {
    const ids = new Set(list.map(p => p.id));
    for (const [id, f] of inFlightRef.current) {
      if (ids.has(id) || (f.settledAt !== undefined && f.settledAt < gen)) inFlightRef.current.delete(id);
    }
    listedRef.current = list;
    orderRef.current = currentOrder();
  }, [currentOrder]);

  /** Names taken: the list's, and every in-flight clone's. */
  const takenNames = useCallback(
    () => [...listedRef.current.map(p => p.name), ...[...inFlightRef.current.values()].map(f => f.name)],
    [],
  );

  /** Hold a clone's name and place it right after its source; call `settled` once it is created. */
  const placeClone = useCallback((sourceId: string, cloneId: string, name: string) => {
    const flight: InFlight = { name };
    // The order WITHOUT this clone, then the clone in its place: once in flight, currentOrder()
    // would already list it, at the end.
    const ids = currentOrder().filter(id => id !== cloneId);
    inFlightRef.current.set(cloneId, flight);
    const at = ids.indexOf(sourceId);
    ids.splice(at < 0 ? ids.length : at + 1, 0, cloneId);
    saveOrder(ids);
    return { settled: () => { flight.settledAt = refreshGenRef.current; } };
  }, [currentOrder, saveOrder]);

  /** Dropping one project on another's tile puts it in that tile's place, in both directions. */
  const moveOnto = useCallback((draggedId: string, targetId: string) => {
    const shown = sorted.map(p => p.id);
    const from = shown.indexOf(draggedId);
    const to = shown.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    const ids = currentOrder().filter(id => id !== draggedId);
    ids.splice(ids.indexOf(targetId) + (from < to ? 1 : 0), 0, draggedId);
    saveOrder(ids);
  }, [sorted, currentOrder, saveOrder]);

  return { sorted, refreshStarted, listed, takenNames, placeClone, moveOnto };
}
