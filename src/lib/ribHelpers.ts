// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, RibItem, RibContext } from '../types';

/**
 * Reusable iterators for the product hierarchy (theme → backbone → rib).
 * Replaces 12+ manual triple-nested loops throughout the codebase.
 */

/**
 * Iterate over every rib item in the product hierarchy.
 */
export function forEachRib(
  product: Product,
  callback: (rib: RibItem, ctx: RibContext) => void,
): void {
  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        callback(rib, { theme, backbone });
      }
    }
  }
}

/**
 * Reduce over all rib items across the product hierarchy.
 */
export function reduceRibs<T>(
  product: Product,
  reducer: (accumulator: T, rib: RibItem, ctx: RibContext) => T,
  initial: T,
): T {
  let acc = initial;
  forEachRib(product, (rib, ctx) => {
    acc = reducer(acc, rib, ctx);
  });
  return acc;
}

/**
 * A rib is locked when any progress entry has percentComplete > 0.
 * Locked ribs must not be re-allocated or unassigned by AI ops.
 * Same predicate used by update_rib in aiOps.ts.
 *
 * @no-throw — safe for use in the drain path.
 */
export function isRibLocked(rib: Pick<RibItem, 'progressHistory'>): boolean {
  return (rib.progressHistory ?? []).some(e => (e.percentComplete ?? 0) > 0);
}
