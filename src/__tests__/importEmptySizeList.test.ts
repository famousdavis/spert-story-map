// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * A project whose size list is empty, after an import. A user reaches one by removing
 * every row, which leaves the ribs' sizes in place, or by reading a list with no row
 * left in it. The label check in `validateProduct` keeps those sizes.
 *
 * `validateProduct.test.ts` pins what the check keeps and clears, and
 * `cloudReadParity.test.ts` that all three paths agree. This file pins what a kept
 * label then does: nothing until a row has it again, and the rib counts once one does.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/firebase', () => ({ db: {} }));

import { importProductFromJSON } from '../lib/importExport';
import { validateProduct } from '../lib/validateProduct';
import { getRibItemPoints, getSizingDistribution, getTotalProjectPoints } from '../lib/calculations';
import { computeSizingLayout } from '../components/sizing/useSizingLayout';
import { buildAiSnapshot } from '../lib/aiSnapshot';
import { sizeRibInProduct } from '../lib/productTransforms';
import { isRibLocked } from '../lib/ribHelpers';
import { diff } from '../lib/validatorObserverDiff';
import type { Product, RibItem } from '../types';
import { req } from './testHelpers';

const OPEN = 'open';
const LOCKED = 'locked';

const rib = (id: string, progress: unknown[] = []) => ({
  id, name: id, description: '', order: 1, size: 'M', category: 'core', notes: '',
  releaseAllocations: [{ releaseId: 'rel1', percentage: 100 }],
  progressHistory: progress,
});

const file = () => ({
  id: 'p', name: 'P', schemaVersion: 2, sizeMapping: [],
  releases: [{ id: 'rel1', name: 'R', order: 1 }],
  sprints: [{ id: 's1', name: 'S1', order: 1 }],
  themes: [{
    id: 't1', name: 'T', order: 1, backboneItems: [{
      id: 'b1', name: 'B', order: 1, ribItems: [
        rib(OPEN),
        rib(LOCKED, [{ sprintId: 's1', releaseId: 'rel1', percentComplete: 40 }]),
      ],
    }],
  }],
});

const imported = () => importProductFromJSON(JSON.stringify(file()));
const withRows = (product: Product, ...rows: Product['sizeMapping']): Product =>
  ({ ...product, sizeMapping: [...product.sizeMapping, ...rows] });
const ribsOf = (product: Product): RibItem[] => product.themes[0]?.backboneItems[0]?.ribItems ?? [];
const pointsOf = (product: Product) =>
  ribsOf(product).map(r => getRibItemPoints(r, product.sizeMapping));
const aiSizesOf = (product: Product) =>
  buildAiSnapshot(product).themes[0]?.backboneItems[0]?.ribItems.map(r => r.size);

describe('an imported project with an empty size list', () => {
  it('holds its labels and counts them as nothing', () => {
    const product = imported();
    const layout = computeSizingLayout(product);

    expect(ribsOf(product).map(r => r.size)).toEqual(['M', 'M']);
    expect(getTotalProjectPoints(product)).toBe(0);
    expect(layout.sizeColumns).toEqual([]);
    expect(layout.unsizedCount).toBe(2);
    expect(getSizingDistribution(product)).toEqual({ Unsized: 2 });
    expect(aiSizesOf(product)).toEqual([null, null]);
  });

  it('refuses every size for the AI while it has no rows', () => {
    const product = imported();
    expect(sizeRibInProduct(product, OPEN, 'M')).toBe(product);
  });

  it('gets its sizes back when the row comes back, on a rib with progress too', () => {
    const product = withRows(imported(), { label: 'M', points: 5 });
    const layout = computeSizingLayout(product);

    expect(isRibLocked(req(ribsOf(product)[1], 'locked rib'), product.sprints)).toBe(true);
    expect(pointsOf(product)).toEqual([5, 5]);
    expect(layout.unsizedCount).toBe(0);
    expect(aiSizesOf(product)).toEqual(['M', 'M']);
  });

  it('stays unsized under a different row, and the AI can size the open rib', () => {
    const product = withRows(imported(), { label: 'S', points: 3 });
    const sized = sizeRibInProduct(product, OPEN, 'S');

    expect(pointsOf(product)).toEqual([0, 0]);
    expect(computeSizingLayout(product).unsizedCount).toBe(2);
    expect(ribsOf(sized).map(r => r.size)).toEqual(['S', 'M']);
  });

  it('survives being exported and imported again, twice', () => {
    const once = imported();
    const twice = importProductFromJSON(JSON.stringify(once));
    const thrice = importProductFromJSON(JSON.stringify(twice));

    expect(ribsOf(thrice).map(r => r.size)).toEqual(['M', 'M']);
    expect(thrice.sizeMapping).toEqual([]);
  });

  it('gives the validator observer nothing to report on the sizes', () => {
    const stored = file();
    expect(diff(stored, validateProduct(structuredClone(stored)))).toEqual([]);
  });
});
