// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sortByOrder } from '../lib/sortByOrder';
import { reorderShown, sanitizeProjectPrefs, type ProjectPrefs } from '../lib/projectPrefs';
import type { StorageDriver, UserSettings } from '../types';

/** A clone created but not yet listed by a refresh: its name is taken and its place is held. */
interface InFlight { name: string; settledAt?: number }

/**
 * The first settings read on a driver (v0.56.0): `loading` until it answers; `failed` when a cloud
 * read failed (R88), until a later read succeeds. `prefs` is the tile colours and archive it read.
 */
export interface FirstSettingsRead {
  status: 'loading' | 'ready' | 'failed';
  prefs: ProjectPrefs;
}

const EMPTY: ProjectPrefs = {};

/**
 * The Products page's order (v0.55.0): the persisted `projectOrder`, drops, and where a clone goes.
 *
 * Every order write builds from a FRESH read of the stored order (v0.56.0, R-6, R65): until then a
 * drop or a clone wrote the order this tab had read at load, so in a tab opened earlier it undid a
 * reorder made in another. The writes run one at a time, so two quick drops in one tab each read
 * the other's. A failed read keeps the order this tab holds; a tab that never read an order (its
 * first read failed, R88) writes none. The window left is the other tab's 200 ms debounce, plus
 * round trips in the cloud, and the whole time a tab is offline (the read then serves the cache).
 *
 * `projectOrder` (state) is what the list is sorted by. `orderRef` is the latest order this tab
 * holds. A clone in flight also holds its name until a refresh lists it, so a double-click on Clone
 * gives "(Copy)" and "(Copy 2)", as import's running list of names does (`import-utils.ts`).
 */
export function useProjectOrder<P extends { id: string; name: string }>(driver: StorageDriver | null, products: P[]) {
  const [projectOrder, setProjectOrder] = useState<string[] | undefined>(undefined);
  const [read, setRead] = useState<{ driver: StorageDriver | null } & FirstSettingsRead>({ driver: null, status: 'loading', prefs: EMPTY });
  const orderRef = useRef<string[] | undefined>(undefined);
  /** Whether this tab has ever read the stored order (R88: if not, a failed read writes nothing). */
  const everReadRef = useRef(false);
  const listedRef = useRef<P[]>([]);
  const inFlightRef = useRef(new Map<string, InFlight>());
  const refreshGenRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const retryingRef = useRef(false);
  /** The first read's state, for `listed`, which must stay stable: `refresh` depends on it. */
  const failedForRef = useRef<StorageDriver | null>(null);

  const sorted = useMemo(() => sortByOrder(products, projectOrder), [products, projectOrder]);
  const settings: FirstSettingsRead = read.driver === driver ? read : { status: 'loading', prefs: EMPTY };

  /** A read that answered: take its order and its colours and archive. */
  const took = useCallback((d: StorageDriver, prefs: UserSettings) => {
    everReadRef.current = true;
    const order = Array.isArray(prefs.projectOrder) ? prefs.projectOrder : undefined;
    if (order) {
      orderRef.current = order;
      setProjectOrder(order);
    }
    failedForRef.current = null;
    setRead({ driver: d, status: 'ready', prefs: sanitizeProjectPrefs(prefs.projectPrefs) });
  }, []);

  // The first read, once per driver. Strict (R88): a failure is not an empty document.
  useEffect(() => {
    if (!driver) return;
    let live = true;
    everReadRef.current = false;
    driver.loadPreferences({ throwOnError: true }).then(
      prefs => { if (live) took(driver, prefs); },
      () => {
        if (!live) return;
        failedForRef.current = driver;
        setRead({ driver, status: 'failed', prefs: EMPTY });
      },
    );
    return () => { live = false; };
  }, [driver, took]);

  /** Every listed product and every in-flight clone, in `stored`'s order. */
  const orderFrom = useCallback((stored: string[] | undefined): string[] => {
    const ids = listedRef.current.map(p => p.id);
    for (const id of inFlightRef.current.keys()) if (!ids.includes(id)) ids.push(id);
    return sortByOrder(ids.map(id => ({ id })), stored).map(x => x.id);
  }, []);

  /**
   * The stored order now, for a write: an `undefined` order means none is stored. A failed read
   * gives the order this tab holds, or `null` (write nothing) when it never read one.
   */
  const freshOrder = useCallback(async (): Promise<{ order: string[] | undefined } | null> => {
    if (!driver) return null;
    try {
      const prefs = await driver.loadPreferences({ throwOnError: true });
      if (!everReadRef.current) took(driver, prefs);
      return { order: Array.isArray(prefs.projectOrder) ? prefs.projectOrder : undefined };
    } catch {
      return everReadRef.current ? { order: orderRef.current } : null;
    }
  }, [driver, took]);

  /** One order write at a time: each reads what the one before it wrote. */
  const enqueue = useCallback((task: () => Promise<void>): Promise<void> => {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.catch(() => {});
    return run;
  }, []);

  /** Show and persist an order. Writes `projectOrder` alone (v0.55.14). */
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
   * name and place for ever. After a failed first read (R88), each refresh reads the settings again.
   */
  const listed = useCallback((list: P[], gen: number) => {
    const ids = new Set(list.map(p => p.id));
    for (const [id, f] of inFlightRef.current) {
      if (ids.has(id) || (f.settledAt !== undefined && f.settledAt < gen)) inFlightRef.current.delete(id);
    }
    listedRef.current = list;
    orderRef.current = orderFrom(orderRef.current);
    if (driver && failedForRef.current === driver && !retryingRef.current) {
      retryingRef.current = true;
      driver.loadPreferences({ throwOnError: true })
        .then(prefs => { if (!everReadRef.current) took(driver, prefs); }, () => {})
        .finally(() => { retryingRef.current = false; });
    }
  }, [driver, orderFrom, took]);

  /** Names taken: the list's, and every in-flight clone's. */
  const takenNames = useCallback(
    () => [...listedRef.current.map(p => p.name), ...[...inFlightRef.current.values()].map(f => f.name)],
    [],
  );

  /**
   * Hold a clone's name and place it right after its source, from a fresh read; call `settled` once
   * it is created. `placed` resolves when the order is written (or, R88, not written).
   */
  const placeClone = useCallback((sourceId: string, cloneId: string, name: string) => {
    const flight: InFlight = { name };
    inFlightRef.current.set(cloneId, flight);
    const placed = enqueue(async () => {
      const fresh = await freshOrder();
      if (!fresh) return;
      const ids = orderFrom(fresh.order).filter(id => id !== cloneId);
      const at = ids.indexOf(sourceId);
      ids.splice(at < 0 ? ids.length : at + 1, 0, cloneId);
      saveOrder(ids);
    });
    return { placed, settled: () => { flight.settledAt = refreshGenRef.current; } };
  }, [enqueue, freshOrder, orderFrom, saveOrder]);

  /**
   * Dropping one product on another's tile puts it in that tile's place, in both directions.
   * `hidden` are the tiles the grid leaves out: each keeps its slot (Forecaster's slot rule). The
   * move shows at once from the order this tab holds; the write then builds from a fresh read and
   * shows what it wrote, which differs only when another tab's reorder was read.
   */
  const moveOnto = useCallback((draggedId: string, targetId: string, hidden: ReadonlySet<string> = new Set()) => {
    const place = (full: string[]): string[] | null => {
      const shown = full.filter(id => !hidden.has(id));
      const from = shown.indexOf(draggedId);
      const to = shown.indexOf(targetId);
      if (from < 0 || to < 0 || from === to) return null;
      shown.splice(from, 1);
      shown.splice(to, 0, draggedId);
      return reorderShown(full, shown);
    };
    const now = place(orderFrom(orderRef.current));
    if (!now) return Promise.resolve();
    setProjectOrder(now);
    return enqueue(async () => {
      const fresh = await freshOrder();
      const ids = fresh ? place(orderFrom(fresh.order)) : null;
      if (ids) saveOrder(ids);
      else setProjectOrder(fresh ? orderFrom(fresh.order) : orderRef.current);
    });
  }, [enqueue, freshOrder, orderFrom, saveOrder]);

  return { sorted, settings, refreshStarted, listed, takenNames, placeClone, moveOnto };
}
