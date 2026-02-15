import { useMemo } from 'react';
import { forEachRib } from '../../lib/ribHelpers';
import { getRibItemPoints, getRibItemPercentComplete } from '../../lib/calculations';

// Layout constants (pixels in logical/unzoomed space)
export const COL_WIDTH = 200;
export const COL_GAP = 8;
export const CELL_HEIGHT = 52;
export const CELL_GAP = 6;
export const CELL_PAD = 6;
export const HEADER_HEIGHT = 40;
export const UNSIZED_MIN_HEIGHT = 100;
export const ZONE_GAP = 16;

const CELL_WIDTH = COL_WIDTH - CELL_PAD * 2;

/**
 * Pure layout computation for the sizing board.
 * Unsized zone (multi-column grid) on top, size columns below.
 */
export function computeSizingLayout(product) {
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
    const pctComplete = getRibItemPercentComplete(rib);
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

export default function useSizingLayout(product) {
  return useMemo(() => computeSizingLayout(product), [product]);
}
