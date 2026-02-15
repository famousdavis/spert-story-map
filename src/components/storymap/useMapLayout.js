import { useMemo } from 'react';
import { getRibItemPoints, getAllocationTotal } from '../../lib/calculations';

// Layout constants (pixels in logical/unzoomed space)
const COL_WIDTH = 200;
const COL_GAP = 4;
const CELL_HEIGHT = 52;
const CELL_GAP = 6;
const CELL_PAD = 6;
const THEME_HEIGHT = 40;
const BACKBONE_HEIGHT = 32;
const LANE_LABEL_WIDTH = 160;
const MIN_LANE_HEIGHT = 72;

export { COL_WIDTH, COL_GAP, CELL_HEIGHT, CELL_GAP, CELL_PAD, THEME_HEIGHT, BACKBONE_HEIGHT, LANE_LABEL_WIDTH, MIN_LANE_HEIGHT };

export default function useMapLayout(product) {
  return useMemo(() => computeLayout(product), [product]);
}

export function computeLayout(product) {
  const themes = product.themes || [];
  const releases = [...(product.releases || [])].sort((a, b) => a.order - b.order);

  if (themes.length === 0) {
    return { columns: [], themeSpans: [], releaseLanes: [], cells: [], unassignedLane: null, totalWidth: 0, totalHeight: 0 };
  }

  // 1. Build columns — one per backbone, grouped by theme
  const columns = [];
  const themeSpans = [];
  let colIdx = 0;

  for (const theme of themes) {
    const startCol = colIdx;
    for (const backbone of theme.backboneItems) {
      const x = LANE_LABEL_WIDTH + colIdx * (COL_WIDTH + COL_GAP);
      columns.push({
        backboneId: backbone.id,
        backboneName: backbone.name,
        themeId: theme.id,
        colIdx,
        x,
        width: COL_WIDTH,
      });
      colIdx++;
    }
    const spanCols = colIdx - startCol;
    if (spanCols > 0) {
      themeSpans.push({
        themeId: theme.id,
        themeName: theme.name,
        x: LANE_LABEL_WIDTH + startCol * (COL_WIDTH + COL_GAP),
        width: spanCols * (COL_WIDTH + COL_GAP) - COL_GAP,
        colStart: startCol,
        colCount: spanCols,
      });
    }
  }

  const totalColumns = colIdx;
  const contentWidth = totalColumns * (COL_WIDTH + COL_GAP) - COL_GAP;
  const totalWidth = LANE_LABEL_WIDTH + contentWidth;

  // 2. Build a lookup: backboneId -> column
  const colByBackbone = {};
  for (const col of columns) {
    colByBackbone[col.backboneId] = col;
  }

  // 3. Gather rib items with context
  const ribsByRelCol = {}; // key: `${releaseId}:${colIdx}` -> rib[]
  const unassignedByCol = {}; // key: colIdx -> rib[]

  for (const theme of themes) {
    for (const backbone of theme.backboneItems) {
      const col = colByBackbone[backbone.id];
      if (!col) continue;

      for (const rib of backbone.ribItems) {
        const ribData = {
          ...rib,
          themeName: theme.name,
          themeId: theme.id,
          backboneName: backbone.name,
          backboneId: backbone.id,
          points: getRibItemPoints(rib, product.sizeMapping),
          allocTotal: getAllocationTotal(rib),
        };

        if (rib.releaseAllocations.length === 0) {
          if (!unassignedByCol[col.colIdx]) unassignedByCol[col.colIdx] = [];
          unassignedByCol[col.colIdx].push({ ...ribData, releaseId: null, allocation: null });
        } else {
          for (const alloc of rib.releaseAllocations) {
            const key = `${alloc.releaseId}:${col.colIdx}`;
            if (!ribsByRelCol[key]) ribsByRelCol[key] = [];
            ribsByRelCol[key].push({
              ...ribData,
              releaseId: alloc.releaseId,
              allocation: alloc,
              isPartial: alloc.percentage < 100,
            });
          }
        }
      }
    }
  }

  // 4. Compute release lane heights
  const bodyTop = THEME_HEIGHT + BACKBONE_HEIGHT;

  const releaseLanes = [];
  let currentY = bodyTop;

  for (const release of releases) {
    let maxRibs = 0;
    for (let ci = 0; ci < totalColumns; ci++) {
      const key = `${release.id}:${ci}`;
      const count = ribsByRelCol[key]?.length || 0;
      if (count > maxRibs) maxRibs = count;
    }
    const height = Math.max(maxRibs * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2, MIN_LANE_HEIGHT);
    releaseLanes.push({
      releaseId: release.id,
      releaseName: release.name,
      y: currentY,
      height,
    });
    currentY += height;
  }

  // 5. Unassigned lane
  let maxUnassigned = 0;
  for (let ci = 0; ci < totalColumns; ci++) {
    const count = unassignedByCol[ci]?.length || 0;
    if (count > maxUnassigned) maxUnassigned = count;
  }
  const hasUnassigned = maxUnassigned > 0;
  const unassignedLane = hasUnassigned ? {
    y: currentY,
    height: Math.max(maxUnassigned * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2, MIN_LANE_HEIGHT),
  } : null;

  if (unassignedLane) {
    currentY += unassignedLane.height;
  }

  const totalHeight = currentY;

  // 6. Place rib cells with absolute positions
  const cells = [];
  const cardOrder = product.releaseCardOrder || {};

  // Sort ribs within a lane column by releaseCardOrder position
  const sortByCardOrder = (ribs, releaseId) => {
    const order = cardOrder[releaseId];
    if (!order || order.length === 0) return ribs;
    const posMap = {};
    for (let i = 0; i < order.length; i++) posMap[order[i]] = i;
    return [...ribs].sort((a, b) => {
      const pa = posMap[a.id] ?? Infinity;
      const pb = posMap[b.id] ?? Infinity;
      return pa - pb;
    });
  };

  for (const lane of releaseLanes) {
    for (let ci = 0; ci < totalColumns; ci++) {
      const key = `${lane.releaseId}:${ci}`;
      const ribs = ribsByRelCol[key];
      if (!ribs) continue;
      const col = columns[ci];
      const sorted = sortByCardOrder(ribs, lane.releaseId);
      sorted.forEach((rib, i) => {
        cells.push({
          ...rib,
          x: col.x + CELL_PAD,
          y: lane.y + CELL_PAD + i * (CELL_HEIGHT + CELL_GAP),
          width: COL_WIDTH - CELL_PAD * 2,
          height: CELL_HEIGHT,
        });
      });
    }
  }

  // Unassigned cells
  if (unassignedLane) {
    for (let ci = 0; ci < totalColumns; ci++) {
      const ribs = unassignedByCol[ci];
      if (!ribs) continue;
      const col = columns[ci];
      const sorted = sortByCardOrder(ribs, 'unassigned');
      sorted.forEach((rib, i) => {
        cells.push({
          ...rib,
          x: col.x + CELL_PAD,
          y: unassignedLane.y + CELL_PAD + i * (CELL_HEIGHT + CELL_GAP),
          width: COL_WIDTH - CELL_PAD * 2,
          height: CELL_HEIGHT,
        });
      });
    }
  }

  return {
    columns,
    themeSpans,
    releaseLanes,
    cells,
    unassignedLane,
    totalWidth,
    totalHeight,
  };
}
