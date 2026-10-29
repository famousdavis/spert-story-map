// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Which open projects had part of their data set aside by `guardCloudProduct`.
 *
 * Module-level, like `driverCleanupRegistry`, because the guard runs inside the
 * storage driver and the notice renders in `ProductLayout`; neither knows the
 * other. Read through `useSyncExternalStore` (see `CloudLoadNotice`). Holds
 * project ids only — never a value from the document.
 */

const flagged = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/**
 * Log the rules that fired and, for a project the user is opening, raise the
 * notice. The project list passes `notify: false`: nobody has opened it yet, and
 * opening it runs the guard again.
 */
export function reportGuardedLoad(productId: string, rules: string[], notify: boolean): void {
  if (rules.length === 0) return;
  console.warn(`[cloud-load-guard] project ${productId}: ${rules.join(', ')}`);
  if (!notify || flagged.has(productId)) return;
  flagged.add(productId);
  emit();
}

export function isGuardedLoad(productId: string): boolean {
  return flagged.has(productId);
}

export function dismissGuardedLoad(productId: string): void {
  if (flagged.delete(productId)) emit();
}

export function subscribeGuardedLoads(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
