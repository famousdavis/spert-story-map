// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createLocalStorageDriver, createFirestoreDriver } from './storageDriver';
import { isFirebaseAvailable } from './firebase';
import { useAuth } from './AuthProvider';
import { registerDriverCleanup, clearDriverCleanup } from './driverCleanupRegistry';
import { setStorageNamespace } from './storage';
import { foldLocalStore } from './localStoreFold';
import { reportFold } from './localFoldNotice';
import type { StorageDriver, StorageMode } from '../types';

interface StorageContextValue {
  driver: StorageDriver | null;
  mode: StorageMode;
  switchMode: (newMode: StorageMode) => void;
  isCloudAvailable: boolean;
  storageReady: boolean;
}

const StorageContext = createContext<StorageContextValue | null>(null);

const STORAGE_MODE_KEY = 'spert-storage-mode';

function getPersistedMode() {
  return localStorage.getItem(STORAGE_MODE_KEY) || 'local';
}

export function StorageProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [persistedMode, setPersistedMode] = useState(getPersistedMode);

  // Auth-aware loading gate:
  // If persisted mode is 'cloud', don't create a driver until auth resolves.
  // This prevents a flash of local data before cloud data loads.
  const isCloudPending = persistedMode === 'cloud' && isFirebaseAvailable && authLoading;

  // Use useState with lazy initializer (not useMemo) to prevent infinite re-render.
  // See GanttApp APP-STATUS.md lessons learned.
  const [driver, setDriver] = useState<StorageDriver | null>(() => {
    if (persistedMode === 'cloud' && isFirebaseAvailable) {
      return null; // Wait for auth to resolve
    }
    return createLocalStorageDriver();
  });

  const storageReady = driver !== null && !isCloudPending;

  // Resolve effective mode: cloud only if Firebase available + signed in + user chose cloud
  const effectiveMode = (isFirebaseAvailable && user && persistedMode === 'cloud') ? 'cloud' : 'local';

  // Update driver when auth resolves or mode changes
  /* eslint-disable react-hooks/set-state-in-effect -- driver must be created after auth resolves */
  useEffect(() => {
    // Bind the preferences namespace before the (cloud-pending) early return so any
    // synchronous code that runs while we wait for auth reads the right person's settings.
    // Products are not namespaced: they live in rp:local signed in or not (v0.56.1, R71).
    setStorageNamespace(user?.uid ?? 'local');

    if (authLoading && persistedMode === 'cloud' && isFirebaseAvailable) {
      return; // Still waiting for auth
    }

    const create = () => (effectiveMode === 'cloud' && user ? createFirestoreDriver(user.uid) : createLocalStorageDriver());
    if (!user) {
      setDriver(create());
      return;
    }
    // R71 R-3: here the uid is bound, which is after setUser and so after the Terms check. The
    // person's products an earlier version kept in rp:{uid} move into rp:local first, under a lock;
    // then the driver for this uid is created, so its first list holds them.
    let cancelled = false;
    void foldLocalStore(user.uid).then(outcome => {
      reportFold(outcome);
      if (!cancelled) setDriver(create());
    });
    return () => { cancelled = true; };
  }, [authLoading, effectiveMode, user?.uid, persistedMode]); // eslint-disable-line react-hooks/exhaustive-deps -- user?.uid captures the needed dependency
  /* eslint-enable react-hooks/set-state-in-effect */

  // Register driver teardown so signOutCleanup (which no longer takes a
  // driver reference) can fire cancelPendingSaves + tearDownListeners
  // before credential revocation, regardless of which sign-out path is
  // taken (UI button, ToS-stale, ToS-error).
  //
  // Leaving the page flushes pending writes wherever the app is (v0.55.14, O32): the Products
  // page, where the settings writers run, had no flush. useProduct keeps its own (and its flush on
  // a driver swap); a second flush finds nothing pending. A swap still CANCELS here.
  useEffect(() => {
    if (!driver) return;
    registerDriverCleanup(async () => {
      driver.cancelPendingSaves();
      driver.tearDownListeners();
    });
    const flush = () => driver.flushPendingSaves();
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      driver.cancelPendingSaves();
      driver.tearDownListeners();
      clearDriverCleanup();
    };
  }, [driver]);

  const switchMode = useCallback((newMode: StorageMode) => {
    localStorage.setItem(STORAGE_MODE_KEY, newMode);
    setPersistedMode(newMode);
  }, []);

  return (
    <StorageContext.Provider value={{
      driver,
      mode: effectiveMode,
      switchMode,
      isCloudAvailable: isFirebaseAvailable,
      storageReady,
    }}>
      {children}
    </StorageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- co-located hook pattern
export function useStorage(): StorageContextValue {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error('useStorage must be used within StorageProvider');
  return ctx;
}
