// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createLocalStorageDriver, createFirestoreDriver } from './storageDriver';
import { isFirebaseAvailable } from './firebase';
import { useAuth } from './AuthProvider';
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
    if (authLoading && persistedMode === 'cloud' && isFirebaseAvailable) {
      return; // Still waiting for auth
    }

    if (effectiveMode === 'cloud' && user) {
      setDriver(createFirestoreDriver(user.uid));
    } else {
      setDriver(createLocalStorageDriver());
    }
  }, [authLoading, effectiveMode, user?.uid, persistedMode]); // eslint-disable-line react-hooks/exhaustive-deps -- user?.uid captures the needed dependency
  /* eslint-enable react-hooks/set-state-in-effect */

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
