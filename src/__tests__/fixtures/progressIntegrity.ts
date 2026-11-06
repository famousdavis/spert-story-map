// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, ProgressEntry, ReleaseAllocation, RibItem, Size, Sprint } from '../../types';

/**
 * Fixtures and a test-local oracle for the progress-integrity tests.
 *
 * ⚠️ THE ORACLE IS NOT THE APP'S RULE, AND THAT IS THE POINT. It restates §5 of
 * the campaign brief and imports nothing from `src/lib`. At v0.53.17 the app has
 * no `completion`: Rule 1 still sums every release in the history, so it reads
 * 11 on the 1-plus-stray-10 case before and after any move, and a test reading it
 * could not tell carry from no carry. The next release replaces this oracle with
 * the real function.
 */

export const SPRINTS: Sprint[] = ['S1', 'S2', 'S3'].map((id, i) => ({
  id, name: id, order: i + 1, endDate: `2026-01-0${i + 1}`,
}));

export function entry(sprintId: string, releaseId: string, percentComplete: number | null, comment = ''): ProgressEntry {
  return { sprintId, releaseId, percentComplete, comment };
}

export function makeRib(id: string, allocations: ReleaseAllocation[], history: ProgressEntry[], size: Size = 'L'): RibItem {
  return {
    id, name: id, description: '', order: 1, size, category: 'core',
    releaseAllocations: allocations, progressHistory: history, notes: '',
  };
}

export function makeProduct(ribs: RibItem[], releaseCardOrder: Record<string, string[]> = {}): Product {
  return {
    id: 'p', name: 'P', description: '', createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 2,
    sizeMapping: [{ label: 'L', points: 40 }, { label: 'M', points: 20 }],
    releases: ['R1', 'R2', 'R3', 'X', 'Y', 'Z'].map((id, i) => ({ id, name: `Release ${id}`, order: i + 1 })),
    sprints: SPRINTS,
    releaseCardOrder,
    themes: [{ id: 't', name: 'T', order: 1, backboneItems: [{ id: 'b', name: 'B', order: 1, ribItems: ribs }] }],
  };
}

export function ribOf(product: Product, id: string): RibItem {
  for (const t of product.themes) {
    for (const b of t.backboneItems) {
      const rib = b.ribItems.find(r => r.id === id);
      if (rib) return rib;
    }
  }
  throw new Error(`no rib ${id}`);
}

/** Run a mutation against a product, as `updateProduct` would, and require exactly one call. */
export function applyUpdate(product: Product, mutate: (update: (updater: (prev: Product) => Product) => void) => void): Product {
  let result = product;
  let calls = 0;
  mutate(updater => { calls++; result = updater(result); });
  if (calls !== 1) throw new Error(`expected one updateProduct call, saw ${calls}`);
  return result;
}

// ─── §5, restated ───────────────────────────────────────────────────

/** Current allocations: first row per distinct `releaseId`. */
function currentAllocations(rib: Pick<RibItem, 'releaseAllocations'>): ReleaseAllocation[] {
  const seen = new Set<string>();
  return rib.releaseAllocations.filter(a => {
    if (seen.has(a.releaseId)) return false;
    seen.add(a.releaseId);
    return true;
  });
}

/** The effective non-null value at the latest sprint at or before `sprintId`; 0 if none. */
function progressAsOf(history: ProgressEntry[], releaseId: string, sprintId: string, sprints: Sprint[]): number {
  const orderOf = (id: string) => sprints.find(s => s.id === id)?.order;
  const target = orderOf(sprintId);
  if (target === undefined) throw new Error(`no sprint ${sprintId}`);

  const effective = new Map<string, ProgressEntry>(); // first entry per sprint wins
  for (const e of history) {
    if (e.releaseId === releaseId && !effective.has(e.sprintId)) effective.set(e.sprintId, e);
  }

  let best: number | null = null;
  let bestOrder = -Infinity;
  for (const [id, e] of effective) {
    const order = orderOf(id);
    if (order === undefined || e.percentComplete === null || e.percentComplete === undefined) continue;
    if (order <= target && order > bestOrder) {
      best = e.percentComplete;
      bestOrder = order;
    }
  }
  return best ?? 0;
}

/** `share(a, s)`: what one allocation counts, capped at the allocation. */
function share(rib: Pick<RibItem, 'progressHistory'>, alloc: ReleaseAllocation, sprintId: string, sprints: Sprint[]): number {
  return Math.min(progressAsOf(rib.progressHistory ?? [], alloc.releaseId, sprintId, sprints), alloc.percentage);
}

/** `completion(rib, s)`: the rib's percentage, from current allocations only. */
export function completion(rib: Pick<RibItem, 'releaseAllocations' | 'progressHistory'>, sprintId: string, sprints: Sprint[] = SPRINTS): number {
  return Math.min(100, currentAllocations(rib).reduce((sum, a) => sum + share(rib, a, sprintId, sprints), 0));
}

/** `completion` at every sprint, so an assertion sees the whole series. */
export function completionSeries(rib: Pick<RibItem, 'releaseAllocations' | 'progressHistory'>, sprints: Sprint[] = SPRINTS): number[] {
  return sprints.map(s => completion(rib, s.id, sprints));
}

/** Project completed `C(s)`: points × completion, over every rib. Sizes come from `product.sizeMapping`. */
export function projectCompleted(product: Product, sprintId: string): number {
  let total = 0;
  for (const t of product.themes) {
    for (const b of t.backboneItems) {
      for (const rib of b.ribItems) {
        const points = product.sizeMapping.find(m => m.label === rib.size)?.points ?? 0;
        total += points * completion(rib, sprintId, product.sprints) / 100;
      }
    }
  }
  return total;
}
