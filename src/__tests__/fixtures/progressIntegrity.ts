// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { moveRib2D } from '../../components/storymap/mapMutations';
import { getProjectTotals } from '../../lib/calculations';
import { saveRibAllocations, updateProgress } from '../../lib/progressMutations';
import { completion as ruleCompletion } from '../../lib/progressRule';
import type { Product, ProgressEntry, ReleaseAllocation, RibItem, Size, Sprint } from '../../types';

/**
 * Fixtures for the progress-integrity tests, and short names for the real rule.
 *
 * ⚠️ `completion`, `completionSeries` and `projectCompleted` below ARE the app's
 * rule, so a test reading them proves nothing about the rule by itself. The
 * independent check is the hand-computed figure a test compares them with.
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

// ─── §9's walkthrough, through the real writers ─────────────────────

const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });

/** A drag on the map, as `commitRibDrag` makes it. `null` is the Unassigned lane. */
export function dragRib(product: Product, ribId: string, from: string | null, to: string | null): Product {
  return applyUpdate(product, update =>
    moveRib2D(update, ribId, { themeId: 't', backboneId: 'b', releaseId: from }, { themeId: 't', backboneId: 'b', releaseId: to, insertIndex: null }));
}

export function typeProgress(product: Product, ribId: string, sprintId: string, releaseId: string, percent: number): Product {
  return applyUpdate(product, update => updateProgress(update, ribId, releaseId, sprintId, percent));
}

/**
 * §9's project after `row` of its table. Each row is a real writer, so a test of
 * the figures is also a test that the writers keep working with the rule.
 */
export function walkthrough(row: number): Product {
  const steps: ((p: Product) => Product)[] = [
    p => typeProgress(typeProgress(typeProgress(p, 'a', 'S1', 'R1', 10), 'b', 'S1', 'R1', 20), 'c', 'S1', 'R2', 30),
    p => dragRib(p, 'a', 'R1', 'R3'),
    p => typeProgress(typeProgress(p, 'a', 'S2', 'R3', 25), 'b', 'S2', 'R2', 10),
    p => dragRib(p, 'c', 'R2', null),
    p => dragRib(p, 'c', null, 'R2'),
    p => saveRibAllocations(p, 'b', [on('R2', 50)]),
    p => saveRibAllocations(p, 'c', [on('R2'), on('R3', 30)]),
    p => typeProgress(typeProgress(p, 'c', 'S2', 'R2', 90), 'c', 'S2', 'R3', 30),
  ];
  const start: Product = {
    ...makeProduct([
      makeRib('a', [on('R1')], []),
      makeRib('b', [on('R1', 50), on('R2', 50)], []),
      makeRib('c', [on('R2', 60)], [], 'M'),
      makeRib('d', [], [], 'M'),
    ]),
    sprints: SPRINTS.slice(0, 2),
  };
  return steps.slice(0, row).reduce((product, step) => step(product), start);
}

// ─── The rule, by the names these tests use ─────────────────────────

/** `completion(rib, s)`. */
export function completion(rib: Pick<RibItem, 'releaseAllocations' | 'progressHistory'>, sprintId: string, sprints: Sprint[] = SPRINTS): number {
  return ruleCompletion(rib, sprintId, sprints);
}

/** `completion` at every sprint, so an assertion sees the whole series. */
export function completionSeries(rib: Pick<RibItem, 'releaseAllocations' | 'progressHistory'>, sprints: Sprint[] = SPRINTS): number[] {
  return sprints.map(s => ruleCompletion(rib, s.id, sprints));
}

/** Project completed `C(s)`. */
export function projectCompleted(product: Product, sprintId: string): number {
  return getProjectTotals(product, sprintId).completed;
}
