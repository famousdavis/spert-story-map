// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo } from 'react';
import type { Product, Category, Size } from '../../types';
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

// Excel-style headers on the unsized grid — sized to read clearly against
// `text-sm` (14px) card titles. Header text itself is 14px semibold (see SizingContent).
export const LETTER_STRIP_HEIGHT = 24;  // top band for A/B/C column letters
export const NUMBER_GUTTER_WIDTH = 36;  // left gutter for 1/2/3 row numbers (3 digits)

export const CELL_WIDTH = COL_WIDTH - CELL_PAD * 2;

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
 *
 * `targetWidth` (optional): when provided and larger than the minimum stacked-column
 * width, each sized column zone expands to fill its proportional share of the canvas
 * and cards inside flow in a sub-column grid (like the unsized zone). When 0 or
 * smaller than the minimum, layout falls back to the legacy 1-card-wide columns —
 * preserves back-compat for tests and SSR.
 */
/** A t-shirt size column on the sizing board. */
export interface SizingColumn {
  label: string;
  points: number;
  colIdx: number;
  x: number;
  width: number;
  count: number;
}

/**
 * A rib projected for the sizing board. Deliberately NOT a RibItem — the board
 * needs only these fields plus theme/backbone context and derived state.
 */
export interface SizingRib {
  id: string;
  name: string;
  size: Size;
  category: Category;
  points: number;
  themeId: string;
  themeName: string;
  backboneId: string;
  backboneName: string;
  percentComplete: number;
  /** Progress > 0 — size editing is disabled to protect points x delta math. */
  locked: boolean;
  cardColor?: string;
}

/** A rib placed on the board with absolute geometry. */
export interface SizingCell extends SizingRib {
  x: number;
  y: number;
  width: number;
  height: number;
  sizeLabel: string | null;
  zone: 'unsized' | 'sized';
}

/** The unsized grid zone above the size columns. */
export interface SizingZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything the sizing board needs to render, in logical pixel space. */
export interface SizingLayout {
  sizeColumns: SizingColumn[];
  unsizedZone: SizingZone;
  unsizedCount: number;
  unsizedRows: number;
  sizeColumnsY: number;
  cells: SizingCell[];
  totalWidth: number;
  totalHeight: number;
  unsizedGridCols: number;
  sizedSubColsByLabel: Record<string, number>;
}

export function computeSizingLayout(product: Product, filter: SizingFilter = DEFAULT_SIZING_FILTER, targetWidth: number = 0): SizingLayout {
  const sizeMapping = product.sizeMapping || [];
  const sizeLabels = new Set(sizeMapping.map(m => m.label));

  // 1. Build size columns (positions/widths are set in step 1.5 once we know expansion)
  const sizeColumns = sizeMapping.map((m, i) => ({
    label: m.label,
    points: m.points,
    colIdx: i,
    x: 0,       // assigned in step 1.5
    width: 0,   // assigned in step 1.5
    count: 0,
  }));

  // 1.5. Decide column widths and zone width.
  // Total canvas = NUMBER_GUTTER_WIDTH (Excel row-number gutter) + content width.
  // Content min = current narrow layout (each column = COL_WIDTH).
  // If targetWidth exceeds that, expand content columns proportionally.
  const minContentWidth = sizeColumns.length > 0
    ? sizeColumns.length * (COL_WIDTH + COL_GAP) - COL_GAP
    : COL_WIDTH; // fallback minimum width
  const totalWidth = Math.max(targetWidth, NUMBER_GUTTER_WIDTH + minContentWidth);
  const totalColumnsWidth = totalWidth - NUMBER_GUTTER_WIDTH;
  if (sizeColumns.length > 0) {
    const totalGap = (sizeColumns.length - 1) * COL_GAP;
    const expandedColWidth = Math.floor((totalColumnsWidth - totalGap) / sizeColumns.length);
    sizeColumns.forEach((col, i) => {
      col.width = expandedColWidth;
      col.x = NUMBER_GUTTER_WIDTH + i * (expandedColWidth + COL_GAP);
    });
  }

  // 2. Gather all ribs
  const unsizedRibs: SizingRib[] = [];
  const sizedByLabel = new Map<string, SizingRib[]>();
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
      cardColor: rib.cardColor,
    };

    // Treat ribs with orphan sizes (not in current sizeMapping) as unsized
    if (!rib.size || !sizeLabels.has(rib.size)) {
      unsizedRibs.push(enriched);
    } else {
      // sizedByLabel is seeded from the same sizeMapping as sizeLabels, so the
      // bucket is always present once the label has passed the check above.
      const bucket = sizedByLabel.get(rib.size);
      if (bucket) bucket.push(enriched);
    }
  });

  // 3. Sort ribs by sizingCardOrder (if present)
  const cardOrder = product.sizingCardOrder || {};
  const sortByCardOrder = (ribs: SizingRib[], key: string) => {
    const order = cardOrder[key];
    if (!order || order.length === 0) return ribs;
    const posMap: Record<string, number> = {};
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      if (id !== undefined) posMap[id] = i;
    }
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

  // 4. Compute unsized zone (multi-column grid). The unsized zone sits below the
  // letter strip and to the right of the row-number gutter so the Excel-style
  // headers can render in those bands.
  const unsizedGridCols = Math.max(1, Math.floor(totalColumnsWidth / (CELL_WIDTH + CELL_GAP)));
  const unsizedRows = Math.ceil(sortedUnsized.length / unsizedGridCols) || 0;
  const unsizedContentHeight = Math.max(
    unsizedRows * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2,
    UNSIZED_MIN_HEIGHT,
  );
  const unsizedZone = {
    x: NUMBER_GUTTER_WIDTH,
    y: LETTER_STRIP_HEIGHT,
    width: totalColumnsWidth,
    height: unsizedContentHeight,
  };

  // 5. Place unsized cells in grid (positions relative to the canvas origin —
  // include the gutter + letter strip offsets so cells align with the column
  // letters and row numbers rendered around them).
  const cells: SizingCell[] = [];
  sortedUnsized.forEach((rib, i) => {
    const row = Math.floor(i / unsizedGridCols);
    const col = i % unsizedGridCols;
    cells.push({
      ...rib,
      x: NUMBER_GUTTER_WIDTH + col * (CELL_WIDTH + CELL_GAP) + CELL_PAD,
      y: LETTER_STRIP_HEIGHT + CELL_PAD + row * (CELL_HEIGHT + CELL_GAP),
      width: CELL_WIDTH,
      height: CELL_HEIGHT,
      sizeLabel: null,
      zone: 'unsized',
    });
  });

  // 6. Compute size column zone + per-column grid dimensions
  const sizeColumnsY = LETTER_STRIP_HEIGHT + unsizedContentHeight + ZONE_GAP + HEADER_HEIGHT;
  const sizedSubColsByLabel: Record<string, number> = {};

  // Find tallest column (taking grid packing into account)
  let maxColContentHeight = CELL_HEIGHT + CELL_PAD * 2; // minimum
  for (const col of sizeColumns) {
    const ribsInCol = sizedByLabel.get(col.label) || [];
    col.count = ribsInCol.length;
    const innerWidth = col.width - CELL_PAD * 2;
    const subCols = Math.max(1, Math.floor((innerWidth + CELL_GAP) / (CELL_WIDTH + CELL_GAP)));
    sizedSubColsByLabel[col.label] = subCols;
    if (ribsInCol.length > 0) {
      const rows = Math.ceil(ribsInCol.length / subCols);
      const h = rows * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2;
      if (h > maxColContentHeight) maxColContentHeight = h;
    }
  }

  // 7. Place sized cells in a grid inside each size column
  for (const col of sizeColumns) {
    const ribsInCol = sizedByLabel.get(col.label) || [];
    const subCols = sizedSubColsByLabel[col.label] || 1;
    ribsInCol.forEach((rib, i) => {
      const row = Math.floor(i / subCols);
      const subCol = i % subCols;
      cells.push({
        ...rib,
        x: col.x + CELL_PAD + subCol * (CELL_WIDTH + CELL_GAP),
        y: sizeColumnsY + CELL_PAD + row * (CELL_HEIGHT + CELL_GAP),
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
    unsizedRows,
    sizeColumnsY,
    cells,
    totalWidth,
    totalHeight,
    unsizedGridCols,
    sizedSubColsByLabel,
  };
}

export default function useSizingLayout(product: Product, filter: SizingFilter = DEFAULT_SIZING_FILTER, targetWidth: number = 0) {
  return useMemo(() => computeSizingLayout(product, filter, targetWidth), [product, filter, targetWidth]);
}
