import { useState, useCallback, useRef, useEffect } from 'react';
import { loadProduct, saveProduct } from '../lib/storage';

export function useProduct(productId) {
  const [product, setProductState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    if (!productId) {
      setProductState(null);
      setLoading(false);
      return;
    }
    const data = loadProduct(productId);
    setProductState(data);
    setLoading(false);
    if (data) setLastSaved(new Date(data.updatedAt));
  }, [productId]);

  const updateProduct = useCallback((updater) => {
    setProductState(prev => {
      if (!prev) return prev;
      const next = typeof updater === 'function' ? updater(prev) : updater;

      // Debounced save
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveProduct(next);
        setLastSaved(new Date());
      }, 500);

      return next;
    });
  }, []);

  const forceRefresh = useCallback(() => {
    if (productId) {
      const data = loadProduct(productId);
      setProductState(data);
      if (data) setLastSaved(new Date(data.updatedAt));
    }
  }, [productId]);

  return { product, loading, lastSaved, updateProduct, forceRefresh };
}
