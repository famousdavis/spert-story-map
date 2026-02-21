import { useState, useCallback, useRef, useEffect } from 'react';
import { useStorage } from '../lib/StorageProvider';

const MAX_UNDO = 30;

export function useProduct(productId) {
  const { driver, mode, storageReady } = useStorage();
  const [state, setState] = useState({ product: null, lastSaved: null, loading: true });
  const saveTimeoutRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  // Load product when driver is ready or productId changes
  useEffect(() => {
    if (!storageReady || !driver || !productId) {
      setState({ product: null, lastSaved: null, loading: !storageReady });
      return;
    }
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true }));
    driver.loadProduct(productId).then(data => {
      if (!cancelled) {
        setState({
          product: data,
          lastSaved: data ? new Date(data.updatedAt) : null,
          loading: false,
        });
        undoStackRef.current = [];
        redoStackRef.current = [];
      }
    });
    return () => { cancelled = true; };
  }, [productId, driver, storageReady]);

  // Subscribe to remote changes (cloud mode only)
  useEffect(() => {
    if (!storageReady || !driver || !productId || mode !== 'cloud') return;
    return driver.onProductChange(productId, (remoteProduct) => {
      if (!remoteProduct) return;
      setState(prev => ({
        ...prev,
        product: remoteProduct,
        lastSaved: new Date(remoteProduct.updatedAt),
      }));
      // Don't clear undo stack — user may still want to undo local changes
    });
  }, [productId, driver, mode, storageReady]);

  // Stable updater that only touches product
  const setProduct = useCallback((updater) => {
    setState(prev => {
      const next = typeof updater === 'function' ? updater(prev.product) : updater;
      return { ...prev, product: next };
    });
  }, []);

  const scheduleSave = useCallback((next) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (driver) driver.saveProduct(next);
      setState(prev => ({ ...prev, lastSaved: new Date() }));
    }, 500);
  }, [driver]);

  const updateProduct = useCallback((updater) => {
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

  // Flush pending debounced saves before the tab closes
  useEffect(() => {
    const flush = () => { if (driver) driver.flushPendingSaves(); };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [driver]);

  const forceRefresh = useCallback(() => {
    if (productId && driver) {
      driver.loadProduct(productId).then(data => {
        setState({
          product: data,
          lastSaved: data ? new Date(data.updatedAt) : null,
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
