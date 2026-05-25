// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Single-slot registry for the active driver's teardown callback.
 *
 * Decouples sign-out cleanup from React context — signOutCleanup no longer
 * needs the live driver reference because StorageProvider registers a
 * teardown function whenever it creates/swaps drivers. AuthProvider's three
 * sign-out paths (UI sign-out, ToS-failure stale, ToS-failure error) can
 * therefore call runDriverCleanup() without owning a driver reference.
 *
 * Single-slot is sufficient — only one driver is alive at a time per
 * StorageProvider instance, and StorageProvider re-registers on each swap.
 */

let registered: (() => Promise<void>) | null = null;

export function registerDriverCleanup(fn: () => Promise<void>): void {
  registered = fn;
}

export function clearDriverCleanup(): void {
  registered = null;
}

export async function runDriverCleanup(): Promise<void> {
  if (!registered) return;
  try {
    await registered();
  } catch (e) {
    console.error('Driver cleanup failed:', e);
  }
}
