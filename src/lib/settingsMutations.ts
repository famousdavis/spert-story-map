// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product } from '../types';

/**
 * Pure functions for release/sprint cascade deletion.
 * Each takes a product and returns a new product with the entity removed
 * and all references cleaned up.
 */

/** Remove a release and clean all references from allocations, progressHistory, and card order. */
export function deleteReleaseFromProduct(product: Product, releaseId: string): Product {
  const { [releaseId]: _, ...restCardOrder } = product.releaseCardOrder || {};
  return {
    ...product,
    releases: product.releases.filter(r => r.id !== releaseId).map((r, i) => ({ ...r, order: i + 1 })),
    themes: product.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r => ({
          ...r,
          releaseAllocations: r.releaseAllocations.filter(a => a.releaseId !== releaseId),
          progressHistory: r.progressHistory.filter(p => p.releaseId !== releaseId),
        })),
      })),
    })),
    releaseCardOrder: restCardOrder,
  };
}

/** Remove a sprint and clean all progressHistory references. */
export function deleteSprintFromProduct(product: Product, sprintId: string): Product {
  return {
    ...product,
    sprints: product.sprints.filter(s => s.id !== sprintId).map((s, i) => ({ ...s, order: i + 1 })),
    themes: product.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r => ({
          ...r,
          progressHistory: r.progressHistory.filter(p => p.sprintId !== sprintId),
        })),
      })),
    })),
  };
}

/** Check if any rib items have allocations referencing a release. */
export function releaseHasAllocations(product: Product, releaseId: string): boolean {
  for (const t of product.themes) {
    for (const b of t.backboneItems) {
      for (const r of b.ribItems) {
        if (r.releaseAllocations.some(a => a.releaseId === releaseId)) return true;
      }
    }
  }
  return false;
}
