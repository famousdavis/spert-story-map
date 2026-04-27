// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback } from 'react';

/**
 * Read a JSON value from sessionStorage. Returns `defaultValue` on miss,
 * parse error, or non-browser environments.
 *
 * Pure-ish wrapper around sessionStorage.getItem so the read path is
 * unit-testable without a DOM (tests inject a Storage-shaped mock).
 */
export function readSessionValue<T>(
  key: string,
  defaultValue: T,
  storage: Storage | null = typeof window !== 'undefined' ? window.sessionStorage : null,
): T {
  if (!storage) return defaultValue;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Write a JSON value to sessionStorage. Swallows quota / unavailable errors.
 * Returns true if the write completed, false if it was skipped or failed.
 */
export function writeSessionValue<T>(
  key: string,
  value: T,
  storage: Storage | null = typeof window !== 'undefined' ? window.sessionStorage : null,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * useState-shaped hook backed by sessionStorage.
 * Survives in-app navigation; clears on tab close / refresh.
 * No schema validation inside — caller is responsible for sanitizing
 * stored values (e.g., orphan ID strips against current product state).
 */
export function useSessionState<T>(
  key: string,
  defaultValue: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readSessionValue(key, defaultValue));

  const setStoredValue = useCallback((next: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = typeof next === 'function'
        ? (next as (prev: T) => T)(prev)
        : next;
      writeSessionValue(key, resolved);
      return resolved;
    });
  }, [key]);

  return [value, setStoredValue];
}
