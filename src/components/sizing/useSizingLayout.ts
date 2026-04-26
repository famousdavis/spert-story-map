// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo } from 'react';
import type { Product } from '../../types';
import { forEachRib } from '../../lib/ribHelpers';
import { getRibItemPoints, getRibItemPercentComplete } from '../../lib/calculations';

// Layout constants (pixels in logical/unzoomed space)
export const COL_WIDTH = 200;
export const COL_GAP = 8;
export const CELL_HEIGHT = 68;
export const CELL_GAP = 6;
export const CELL_PAD = 6;
export const HEADER_HEIGHT = 40;
export const UNSIZED_MIN_HEIGHT = 100;
export const ZONE_GAP = 16;

const CELL_WIDTH = COL_WIDTH - CELL_PAD * 2;

export interface SizingFilter {
  themeIds: string[];    // [] = all themes shown
  releaseIds: string[];  // [] = all releases shown; non-empty = only ribs allocated to these releases
  hideLocked: boolean;   // true = exclude percentComplete > 0
}

export const DEFAULT_SIZING_FILTER: SizingFilter = {
  themeIds: [],
  releaseIds: [],
  hideLocked: false,
};

/**
 * Pure layout computation for the sizing board.
 * Unsized zone (multi-column grid) on top, size columns below.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- layout return type is complex and frequently evolving; explicit interface would be over-engineering
export function computeSizingLayout(product: Product, filter: SizingFilter = DEFAULT_SIZING_FILTER): any {
  const sizeMapping = product.sizeMapping || [];
  const sizeLabels = new Set(sizeMapping.map(m => m.label));

  // 1. Build size columns
  const sizeColumns = sizeMapping.map((m, i) => ({
    label: m.label,
    points: m.points,
    colIdx: i,
    x: i * (COL_WIDTH + COL_GAP),
    width: COL_WIDTH,
    count: 0,
  }));

  const totalColumnsWidth = sizeColumns.length > 0
    ? sizeColumns.length * (COL_WIDTH + COL_GAP) - COL_GAP
    : COL_WIDTH; // fallback minimum width

  // 2. Gather all ribs
  const unsizedRibs = [];
  const sizedByLabel = new Map();
  sizeMapping.forEach(m => sizedByLabel.set(m.label, []));

  forEachRib(product, (rib, { theme, backbone }) => {
    // Theme filter (cheap check first)
    if (filter.themeIds.length > 0 && !filter.themeIds.includes(theme.id)) return;

    // Release filter — show only ribs allocated to selected releases
    if ((filter.releaseIds?.length ?? 0) > 0) {
      const allocated = rib.releaseAllocations?.some(a => filter.releaseIds!.includes(a.releaseId));
      if (!allocated) return;
    }

    const pctComplete = getRibItemPercentComplete(rib);

    // Locked filter
    if (filter.hideLocked && pctComplete > 0) return;

    const enriched = {
      id: rib.id,
      name: rib.name,
      size: rib.size || null,
      category: rib.category,
      points: getRibItemPoints(rib, sizeMapping),
      themeId: theme.id,
      themeName: theme.name,
      backboneId: backbone.id,
      backboneName: backbone.name,
      percentComplete: pctComplete,
      locked: pctComplete > 0,
    };

    // Treat ribs with orphan sizes (not in current sizeMapping) as unsized
    if (!rib.size || !sizeLabels.has(rib.size)) {
      unsizedRibs.push(enriched);
    } else {
      sizedByLabel.get(rib.size).push(enriched);
    }
  });

  // 3. Sort ribs by sizingCardOrder (if present)
  const cardOrder = product.sizingCardOrder || {};
  const sortByCardOrder = (ribs, key) => {
    const order = cardOrder[key];
    if (!order || order.length === 0) return ribs;
    const posMap = {};
    for (let i = 0; i < order.length; i++) posMap[order[i]] = i;
    return [...ribs].sort((a, b) => {
      const pa = posMap[a.id] ?? Infinity;
      const pb = posMap[b.id] ?? Infinity;
      return pa - pb;
    });
  };

  const sortedUnsized = sortByCardOrder(unsizedRibs, 'unsized');
  for (const [label, ribs] of sizedByLabel.entries()) {
    sizedByLabel.set(label, sortByCardOrder(ribs, label));
  }

  // 4. Compute unsized zone (multi-column grid)
  const unsizedGridCols = Math.max(1, Math.floor(totalColumnsWidth / (CELL_WIDTH + CELL_GAP)));
  const unsizedRows = Math.ceil(sortedUnsized.length / unsizedGridCols) || 0;
  const unsizedHeight = Math.max(
    unsizedRows * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2,
    UNSIZED_MIN_HEIGHT,
  );
  const unsizedZone = { y: 0, height: unsizedHeight, width: totalColumnsWidth };

  // 5. Place unsized cells in grid
  const cells = [];
  sortedUnsized.forEach((rib, i) => {
    const row = Math.floor(i / unsizedGridCols);
    const col = i % unsizedGridCols;
    cells.push({
      ...rib,
      x: col * (CELL_WIDTH + CELL_GAP) + CELL_PAD,
      y: CELL_PAD + row * (CELL_HEIGHT + CELL_GAP),
      width: CELL_WIDTH,
      height: CELL_HEIGHT,
      sizeLabel: null,
      zone: 'unsized',
    });
  });

  // 6. Compute size column zone
  const sizeColumnsY = unsizedHeight + ZONE_GAP + HEADER_HEIGHT;

  // Find tallest column
  let maxColContentHeight = CELL_HEIGHT + CELL_PAD * 2; // minimum
  for (const col of sizeColumns) {
    const ribsInCol = sizedByLabel.get(col.label) || [];
    col.count = ribsInCol.length;
    if (ribsInCol.length > 0) {
      const h = ribsInCol.length * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2;
      if (h > maxColContentHeight) maxColContentHeight = h;
    }
  }

  // 7. Place sized cells
  for (const col of sizeColumns) {
    const ribsInCol = sizedByLabel.get(col.label) || [];
    ribsInCol.forEach((rib, i) => {
      cells.push({
        ...rib,
        x: col.x + CELL_PAD,
        y: sizeColumnsY + CELL_PAD + i * (CELL_HEIGHT + CELL_GAP),
        width: CELL_WIDTH,
        height: CELL_HEIGHT,
        sizeLabel: col.label,
        zone: 'sized',
      });
    });
  }

  const totalHeight = sizeColumnsY + maxColContentHeight;

  return {
    sizeColumns,
    unsizedZone,
    unsizedCount: sortedUnsized.length,
    sizeColumnsY,
    cells,
    totalWidth: totalColumnsWidth,
    totalHeight,
    unsizedGridCols,
  };
}

export default function useSizingLayout(product: Product, filter: SizingFilter = DEFAULT_SIZING_FILTER) {
  return useMemo(() => computeSizingLayout(product, filter), [product, filter]);
}
