/**
 * Pure functions for release/sprint cascade deletion.
 * Each takes a product and returns a new product with the entity removed
 * and all references cleaned up.
 */

/** Remove a release and clean all references from allocations, progressHistory, and card order. */
export function deleteReleaseFromProduct(product, releaseId) {
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
export function deleteSprintFromProduct(product, sprintId) {
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
export function releaseHasAllocations(product, releaseId) {
  for (const t of product.themes) {
    for (const b of t.backboneItems) {
      for (const r of b.ribItems) {
        if (r.releaseAllocations.some(a => a.releaseId === releaseId)) return true;
      }
    }
  }
  return false;
}
