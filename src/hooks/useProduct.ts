// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product, ProductUpdater } from '../types';
import { useStorage } from '../lib/StorageProvider';
import { parseDate } from '../lib/formatDate';

const MAX_UNDO = 30;

interface ProductState {
  product: Product | null;
  lastSaved: Date | null;
  loading: boolean;
}

export function useProduct(productId: string) {
  const { driver, mode, storageReady } = useStorage();
  const navigate = useNavigate();
  const [state, setState] = useState<ProductState>({ product: null, lastSaved: null, loading: true });
  const undoStackRef = useRef<Product[]>([]);
  const redoStackRef = useRef<Product[]>([]);
  // Stable navigate ref so the loadProduct effect doesn't re-fire on every
  // route change. navigate's identity is unstable across renders in some
  // react-router versions; effect-write per React 19 rule (`react-hooks/refs`)
  // bans assigning to ref.current during render.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // Load product when driver is ready or productId changes.
  //
  // Cold-start permission-denied handling: if Firestore rejects the load
  // because the caller is no longer a member of the project (e.g. the
  // owner revoked their access between sessions), we navigate to / with
  // router state so ProductList can show a one-shot "access denied"
  // banner. Other errors fall through to the spinner-stops branch and
  // let ProductLayout's "Project not found" UI render.
  /* eslint-disable react-hooks/set-state-in-effect -- loading async data requires setState in effect */
  useEffect(() => {
    if (!storageReady || !driver || !productId) {
      setState({ product: null, lastSaved: null, loading: !storageReady });
      return;
    }
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true }));
    driver.loadProduct(productId)
      .then(data => {
        if (cancelled) return;
        setState({
          product: data,
          lastSaved: data ? parseDate(data.updatedAt) : null,
          loading: false,
        });
        undoStackRef.current = [];
        redoStackRef.current = [];
      })
      .catch(err => {
        if (cancelled) return;
        const code = (err as { code?: string })?.code;
        if (code === 'permission-denied') {
          navigateRef.current('/', { replace: true, state: { productAccessDenied: true } });
        } else {
          // Stop the spinner so ProductLayout's `!loading && !product`
          // branch renders the "Project not found" fallback. We do NOT
          // route through setSaveError here — that lives in ProductLayout
          // scope and is appropriate for write failures, not read ones.
          console.error('Failed to load product:', err);
          setState({ product: null, lastSaved: null, loading: false });
        }
      });
    return () => { cancelled = true; };
  }, [productId, driver, storageReady]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Subscribe to remote changes (cloud mode only).
  //
  // INVARIANT: onProductChange echoes are WHOLESALE REPLACEMENTS of the
  // product tree. Components that buffer in-progress user input (text fields,
  // inline edits) MUST gate sync on focus state, or an echo arriving mid-type
  // will overwrite the user's pending characters. See useBufferedField and
  // InlineEdit for the buffer pattern.
  //
  // Live permission-denied handling: if the owner revokes our access mid-
  // session, the listener fires with `permission-denied`. We unsubscribe via
  // the unsub ref AND navigate to / with router state — without unsubscribe,
  // the listener keeps firing as Firestore retries; without navigation, the
  // user is stranded on a "Project not found" dead end after the next
  // setState(null) (which we deliberately avoid here — no state change keeps
  // the previous render visible until navigation completes).
  useEffect(() => {
    if (!storageReady || !driver || !productId || mode !== 'cloud') return;
    let unsub: (() => void) | null = null;
    unsub = driver.onProductChange(
      productId,
      (remoteProduct) => {
        if (!remoteProduct) return;
        setState(prev => ({
          ...prev,
          product: remoteProduct,
          lastSaved: parseDate(remoteProduct.updatedAt),
        }));
        // Don't clear undo stack — user may still want to undo local changes
      },
      (error) => {
        const code = (error as { code?: string })?.code;
        if (code === 'permission-denied') {
          unsub?.();
          unsub = null;
          navigateRef.current('/', { replace: true, state: { productAccessDenied: true } });
        }
      },
    );
    return () => { unsub?.(); };
  }, [productId, driver, mode, storageReady]);

  // Stable updater that only touches product
  const setProduct = useCallback((updater: ProductUpdater) => {
    setState(prev => {
      const next = typeof updater === 'function' ? updater(prev.product) : updater;
      return { ...prev, product: next };
    });
  }, []);

  // Hand the update directly to the driver — the driver owns the debounce
  // (200ms). The previous 500ms outer setTimeout stacked on top of the driver's
  // 500ms inner debounce, producing ~1s of perceived input latency on saves.
  //
  // lastSaved is mode-aware:
  //   - local: set optimistically (write is synchronous and very reliable)
  //   - cloud: do NOT set — the Firestore echo via onProductChange updates
  //     lastSaved from the server timestamp. Setting here would produce a
  //     "Saved 0s ago" flash that gets overwritten 100-500ms later.
  //
  // Both `driver` and `mode` must be in the deps — a stale mode capture
  // would keep showing the optimistic local time after a swap to cloud.
  const scheduleSave = useCallback((next: Product) => {
    if (!driver) return;
    driver.saveProduct(next);
    if (mode !== 'cloud') {
      setState(prev => ({ ...prev, lastSaved: new Date() }));
    }
  }, [driver, mode]);

  const updateProduct = useCallback((updater: ProductUpdater) => {
    setProduct(prev => {
      if (!prev) return prev;
      const next = typeof updater === 'function' ? updater(prev) : updater;

      // Push current state onto undo stack
      undoStackRef.current = [...undoStackRef.current.slice(-MAX_UNDO + 1), prev];
      redoStackRef.current = [];

      scheduleSave(next);
      return next;
    });
  }, [setProduct, scheduleSave]);

  const undo = useCallback(() => {
    setProduct(prev => {
      if (!prev) return prev;
      const stack = undoStackRef.current;
      if (stack.length === 0) return prev;

      const previous = stack[stack.length - 1];
      undoStackRef.current = stack.slice(0, -1);
      redoStackRef.current = [...redoStackRef.current, prev];

      scheduleSave(previous);
      return previous;
    });
  }, [setProduct, scheduleSave]);

  const redo = useCallback(() => {
    setProduct(prev => {
      if (!prev) return prev;
      const stack = redoStackRef.current;
      if (stack.length === 0) return prev;

      const next = stack[stack.length - 1];
      redoStackRef.current = stack.slice(0, -1);
      undoStackRef.current = [...undoStackRef.current, prev];

      scheduleSave(next);
      return next;
    });
  }, [setProduct, scheduleSave]);

  // Flush pending debounced saves before the tab closes AND on driver swap.
  // pagehide fires reliably on mobile (where beforeunload often doesn't) and
  // on bfcache navigations; beforeunload is kept for desktop browsers that
  // don't fire pagehide on tab close.
  useEffect(() => {
    const flush = () => { if (driver) driver.flushPendingSaves(); };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      // Driver about to be replaced (mode swap / sign-out) — land any
      // buffered writes against the OUTGOING driver before its closure
      // is torn down. cancelPendingSaves in the registry will fire too,
      // but only after this flush.
      if (driver) driver.flushPendingSaves();
    };
  }, [driver]);

  const forceRefresh = useCallback(() => {
    if (productId && driver) {
      driver.loadProduct(productId).then(data => {
        setState({
          product: data,
          lastSaved: data ? parseDate(data.updatedAt) : null,
          loading: false,
        });
        undoStackRef.current = [];
        redoStackRef.current = [];
      });
    }
  }, [productId, driver]);

  return {
    product: state.product,
    loading: state.loading,
    lastSaved: state.lastSaved,
    updateProduct,
    forceRefresh,
    undo,
    redo,
  };
}
