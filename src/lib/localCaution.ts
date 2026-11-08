// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * State the local-storage caution shares across pages, read through
 * `useSyncExternalStore` (see `LocalStorageCaution`).
 *
 * Module memory on purpose. Each page mounts its own caution, so component state
 * would bring it back on every navigation; module memory survives navigation and
 * resets on a page load, which is exactly when the caution should return. It
 * writes no storage key, so sign-out has nothing to clean up.
 *
 * - `dismissed`: "Got it" was pressed during this page load.
 * - `suppressed`: the Settings switch's latest value and the storage driver it
 *   was saved through, or `null` until the switch is used. The caution needs it
 *   because preferences save after a 200 ms debounce, so re-reading them
 *   straight after a toggle returns the old value. It applies only while that
 *   driver is current: a different driver reads its own preferences.
 */

export interface LocalCautionState {
  dismissed: boolean;
  suppressed: { value: boolean; driver: unknown } | null;
}

const INITIAL: LocalCautionState = { dismissed: false, suppressed: null };

let state: LocalCautionState = INITIAL;
const listeners = new Set<() => void>();

function set(next: Partial<LocalCautionState>): void {
  const merged = { ...state, ...next };
  if (merged.dismissed === state.dismissed && merged.suppressed === state.suppressed) return;
  state = merged;
  for (const l of listeners) l();
}

export function subscribeLocalCaution(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getLocalCaution(): LocalCautionState {
  return state;
}

/** "Got it": hide the caution until the next page load. */
export function dismissLocalCaution(): void {
  set({ dismissed: true });
}

/** The Settings switch changed, saved through `driver`: `true` turns the caution off. */
export function setLocalCautionSuppressed(value: boolean, driver: unknown): void {
  set({ suppressed: { value, driver } });
}

/** A page load, for tests. */
export function resetLocalCaution(): void {
  state = INITIAL;
  for (const l of listeners) l();
}
