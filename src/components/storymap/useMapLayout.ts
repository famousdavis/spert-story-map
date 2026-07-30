// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo } from 'react';
import type { Product, RibItem, ReleaseAllocation } from '../../types';
import { getRibItemPoints, getAllocationTotal } from '../../lib/calculations';

// Layout constants (pixels in logical/unzoomed space)
const COL_WIDTH = 200;
const COL_GAP = 4;
const CELL_HEIGHT = 68;
const CELL_GAP = 6;
const CELL_PAD = 6;
const THEME_HEIGHT = 40;
const BACKBONE_HEIGHT = 44;
const LANE_LABEL_WIDTH = 160;
const RIGHT_LABEL_WIDTH = LANE_LABEL_WIDTH;
const MIN_LANE_HEIGHT = 72;
// Vertical space reserved at the bottom of a populated lane so the "+ Rib"
// hover button has a real cell to live in — even in the longest column, which
// would otherwise be sized exactly to its rib stack with no room below.
const ADD_BUTTON_RESERVED = 24;
// Height of a collapsed release lane — just enough for the mirrored label row.
const COLLAPSED_LANE_HEIGHT = 30;

export { COL_WIDTH, COL_GAP, CELL_HEIGHT, CELL_GAP, CELL_PAD, THEME_HEIGHT, BACKBONE_HEIGHT, LANE_LABEL_WIDTH, RIGHT_LABEL_WIDTH, MIN_LANE_HEIGHT, ADD_BUTTON_RESERVED, COLLAPSED_LANE_HEIGHT };

/** One column of the map — a single backbone item. */
export interface MapColumn {
  backboneId: string;
  backboneName: string;
  themeId: string;
  colIdx: number;
  x: number;
  width: number;
}

/** The theme header band spanning that theme's backbone columns. */
export interface MapThemeSpan {
  themeId: string;
  themeName: string;
  x: number;
  width: number;
  colStart: number;
  colCount: number;
  /** True for a theme with no backbones — a placeholder slot is reserved. */
  isEmpty?: boolean;
}

/** A release swim lane. */
export interface MapReleaseLane {
  releaseId: string;
  releaseName: string;
  y: number;
  height: number;
  collapsed: boolean;
  /** Ribs in this release across ALL columns — shown in the collapsed header. */
  cardCount: number;
}

/** The always-present lane below the releases. */
export interface MapUnassignedLane {
  y: number;
  height: number;
}

/** A rib plus the theme/backbone context and derived totals the map displays. */
export interface MapRibData extends RibItem {
  themeName: string;
  themeId: string;
  backboneName: string;
  backboneId: string;
  points: number;
  allocTotal: number;
}

/** A rib assigned to one lane. `releaseId` is null in the unassigned lane. */
export interface MapRibEntry extends MapRibData {
  releaseId: string | null;
  allocation: ReleaseAllocation | null;
  isPartial?: boolean;
}

/** A rib entry placed at an absolute position. */
export interface MapCell extends MapRibEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A hover "+ Rib" zone, one per column x lane. */
export interface MapGapButton {
  themeId: string;
  backboneId: string;
  releaseId: string | null;
  x: number;
  y: number;
  width: number;
}

/** Everything the map needs to render, in logical (unzoomed) pixel space. */
export interface MapLayout {
  columns: MapColumn[];
  themeSpans: MapThemeSpan[];
  releaseLanes: MapReleaseLane[];
  cells: MapCell[];
  unassignedLane: MapUnassignedLane | null;
  gapButtons: MapGapButton[];
  totalWidth: number;
  totalHeight: number;
}

export default function useMapLayout(product: Product, collapsedReleaseIds: string[] = []) {
  return useMemo(() => computeLayout(product, collapsedReleaseIds), [product, collapsedReleaseIds]);
}

export function computeLayout(product: Product, collapsedReleaseIds: string[] = []): MapLayout {
  const collapsedSet = new Set(collapsedReleaseIds);
  const themes = product.themes || [];
  const releases = [...(product.releases || [])].sort((a, b) => a.order - b.order);

  if (themes.length === 0) {
    return { columns: [], themeSpans: [], releaseLanes: [], cells: [], unassignedLane: null, gapButtons: [], totalWidth: 0, totalHeight: 0 };
  }

  // 1. Build columns — one per backbone, grouped by theme
  const columns: MapColumn[] = [];
  const themeSpans: MapThemeSpan[] = [];
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
    } else {
      // Empty theme — reserve a placeholder slot for visibility
      themeSpans.push({
        themeId: theme.id,
        themeName: theme.name,
        x: LANE_LABEL_WIDTH + startCol * (COL_WIDTH + COL_GAP),
        width: COL_WIDTH,
        colStart: startCol,
        colCount: 0,
        isEmpty: true,
      });
      colIdx++;
    }
  }

  const totalColumns = colIdx;
  const contentWidth = totalColumns * (COL_WIDTH + COL_GAP) - COL_GAP;
  const totalWidth = LANE_LABEL_WIDTH + contentWidth + RIGHT_LABEL_WIDTH;

  // 2. Build a lookup: backboneId -> column
  const colByBackbone: Record<string, MapColumn> = {};
  for (const col of columns) {
    colByBackbone[col.backboneId] = col;
  }

  // 3. Gather rib items with context
  const ribsByRelCol: Record<string, MapRibEntry[]> = {}; // key: `${releaseId}:${colIdx}`
  const unassignedByCol: Record<number, MapRibEntry[]> = {}; // key: colIdx

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
          const bucket = unassignedByCol[col.colIdx] ?? [];
          bucket.push({ ...ribData, releaseId: null, allocation: null });
          unassignedByCol[col.colIdx] = bucket;
        } else {
          for (const alloc of rib.releaseAllocations) {
            const key = `${alloc.releaseId}:${col.colIdx}`;
            const bucket = ribsByRelCol[key] ?? [];
            bucket.push({
              ...ribData,
              releaseId: alloc.releaseId,
              allocation: alloc,
              isPartial: alloc.percentage < 100,
            });
            ribsByRelCol[key] = bucket;
          }
        }
      }
    }
  }

  // 4. Compute release lane heights
  const bodyTop = THEME_HEIGHT + BACKBONE_HEIGHT;

  const releaseLanes: MapReleaseLane[] = [];
  let currentY = bodyTop;

  for (const release of releases) {
    let maxRibs = 0;
    let cardCount = 0; // total ribs in this release across all columns (shown in collapsed header)
    for (let ci = 0; ci < totalColumns; ci++) {
      const key = `${release.id}:${ci}`;
      const count = ribsByRelCol[key]?.length || 0;
      cardCount += count;
      if (count > maxRibs) maxRibs = count;
    }
    const collapsed = collapsedSet.has(release.id);
    const height = collapsed
      ? COLLAPSED_LANE_HEIGHT
      : Math.max(
          maxRibs > 0 ? maxRibs * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2 + ADD_BUTTON_RESERVED : 0,
          MIN_LANE_HEIGHT
        );
    releaseLanes.push({
      releaseId: release.id,
      releaseName: release.name,
      y: currentY,
      height,
      collapsed,
      cardCount,
    });
    currentY += height;
  }

  // 5. Unassigned lane (always present so + Release button is always visible)
  let maxUnassigned = 0;
  for (let ci = 0; ci < totalColumns; ci++) {
    const count = unassignedByCol[ci]?.length || 0;
    if (count > maxUnassigned) maxUnassigned = count;
  }
  const unassignedLane: MapUnassignedLane = {
    y: currentY,
    height: Math.max(
      maxUnassigned > 0 ? maxUnassigned * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2 + ADD_BUTTON_RESERVED : 0,
      MIN_LANE_HEIGHT
    ),
  };
  currentY += unassignedLane.height;

  const totalHeight = currentY;

  // 6. Place rib cells with absolute positions
  const cells: MapCell[] = [];
  const cardOrder = product.releaseCardOrder || {};

  // Sort ribs within a lane column by releaseCardOrder position
  const sortByCardOrder = (ribs: MapRibEntry[], releaseId: string) => {
    const order = cardOrder[releaseId];
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

  for (const lane of releaseLanes) {
    if (lane.collapsed) continue; // collapsed lanes render no cells
    for (const col of columns) {
      const key = `${lane.releaseId}:${col.colIdx}`;
      const ribs = ribsByRelCol[key];
      if (!ribs) continue;
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
    for (const col of columns) {
      const ribs = unassignedByCol[col.colIdx];
      if (!ribs) continue;
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

  // 7. Compute gap buttons (hover "+ Rib" zones in every column×lane cell).
  // Lane heights now reserve ADD_BUTTON_RESERVED below the longest column's rib
  // stack, so every cell — empty or not, longest column or not — has room for
  // an affordance. Empty cells get the button at the top (just below the
  // divider); populated cells get it below the last card.
  const gapButtons: MapGapButton[] = [];

  for (const lane of releaseLanes) {
    if (lane.collapsed) continue; // no "+ Rib" affordance in a collapsed lane
    for (const col of columns) {
      const key = `${lane.releaseId}:${col.colIdx}`;
      const ribCount = ribsByRelCol[key]?.length || 0;
      const buttonY = ribCount === 0
        ? lane.y + CELL_PAD
        : lane.y + CELL_PAD + (ribCount - 1) * (CELL_HEIGHT + CELL_GAP) + CELL_HEIGHT + 2;
      gapButtons.push({
        themeId: col.themeId, backboneId: col.backboneId, releaseId: lane.releaseId,
        x: col.x + CELL_PAD, y: buttonY, width: COL_WIDTH - CELL_PAD * 2,
      });
    }
  }

  if (unassignedLane) {
    for (const col of columns) {
      const ribCount = unassignedByCol[col.colIdx]?.length || 0;
      const buttonY = ribCount === 0
        ? unassignedLane.y + CELL_PAD
        : unassignedLane.y + CELL_PAD + (ribCount - 1) * (CELL_HEIGHT + CELL_GAP) + CELL_HEIGHT + 2;
      gapButtons.push({
        themeId: col.themeId, backboneId: col.backboneId, releaseId: null,
        x: col.x + CELL_PAD, y: buttonY, width: COL_WIDTH - CELL_PAD * 2,
      });
    }
  }

  return {
    columns,
    themeSpans,
    releaseLanes,
    cells,
    unassignedLane,
    gapButtons,
    totalWidth,
    totalHeight,
  };
}
