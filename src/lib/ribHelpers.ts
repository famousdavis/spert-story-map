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

/**
 * Compute sibling name(s) for a rib being split or cloned, honoring the
 * "(N)" trailing-suffix collision-avoidance contract. Shared by
 * splitRibInProduct and cloneRibInProduct (productTransforms.ts).
 *
 * keepOriginal=true  (clone): original keeps its name; new sibling = prefix (max+1).
 * keepOriginal=false (split): if original already ends in "(N)", keep it and
 *   new sibling = prefix (max+1); otherwise rename original → prefix (max+1),
 *   new sibling = prefix (max+2).
 *
 * `siblings` is the parent backbone's full ribItems list (including the rib
 * being split/cloned, so an already-suffixed original counts toward `max`).
 * `currentName` is that rib's present name. Pure; no side effects.
 */
export function computeRibSiblingName(
  siblings: Pick<RibItem, 'name'>[],
  currentName: string,
  keepOriginal: boolean,
): { originalName: string; newName: string } {
  const trailingSuffix = /^(.*?)\s*\((\d+)\)\s*$/;
  const match = currentName.match(trailingSuffix);
  const prefix = match?.[1] ?? currentName;

  // Find the highest existing (N) suffix among siblings sharing this prefix.
  // Prevents collisions when splitting an earlier-numbered sibling (e.g.,
  // splitting "Foo (1)" while "Foo (2)" exists must yield "Foo (3)").
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const siblingPattern = new RegExp(`^${escapedPrefix}\\s*\\((\\d+)\\)\\s*$`);
  const siblingNumbers = siblings
    .map(r => {
      const m = r.name.match(siblingPattern);
      const digits = m?.[1];
      return digits !== undefined ? parseInt(digits, 10) : null;
    })
    .filter((n): n is number => n !== null);
  const maxExisting = siblingNumbers.length > 0 ? Math.max(...siblingNumbers) : 0;

  // keepOriginal (clone) OR an already-suffixed original (split): the original
  // name is preserved and the new sibling takes the next number.
  if (keepOriginal || match) {
    return { originalName: currentName, newName: `${prefix} (${maxExisting + 1})` };
  }
  // Unsuffixed split: assign the next two available numbers in the prefix family.
  return {
    originalName: `${prefix} (${maxExisting + 1})`,
    newName: `${prefix} (${maxExisting + 2})`,
  };
}
