import { useState, useCallback, useRef } from 'react';
import { loadProduct, saveProduct } from '../lib/storage';

const MAX_UNDO = 30;

function loadInitial(productId) {
  if (!productId) return { product: null, lastSaved: null };
  const data = loadProduct(productId);
  return { product: data, lastSaved: data ? new Date(data.updatedAt) : null };
}

export function useProduct(productId) {
  const [state, setState] = useState(() => loadInitial(productId));
  const loading = false; // Data is loaded synchronously from localStorage
  const saveTimeoutRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

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
      saveProduct(next);
      setState(prev => ({ ...prev, lastSaved: new Date() }));
    }, 500);
  }, []);

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

  const forceRefresh = useCallback(() => {
    if (productId) {
      const data = loadProduct(productId);
      setState({ product: data, lastSaved: data ? new Date(data.updatedAt) : null });
      undoStackRef.current = [];
      redoStackRef.current = [];
    }
  }, [productId]);

  return { product: state.product, loading, lastSaved: state.lastSaved, updateProduct, forceRefresh, undo, redo };
}
