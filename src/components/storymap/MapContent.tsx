// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useEffect, useMemo } from 'react';
import { COL_WIDTH, COL_GAP, THEME_HEIGHT, BACKBONE_HEIGHT, LANE_LABEL_WIDTH } from './useMapLayout';
import ThemeHeader from './ThemeHeader';
import BackboneHeader from './BackboneHeader';
import ReleaseDivider from './ReleaseDivider';
import RibCell from './RibCell';
import UnassignedLane from './UnassignedLane';
import DropHighlight from './DropHighlight';
import InsertionIndicator from './InsertionIndicator';
import { getThemeColorClasses } from '../../lib/themeColors';
import { releaseHasAllocations } from '../../lib/settingsMutations';
import type { Theme, Product } from '../../types';
import type { RibCardColorKey } from '../../lib/ribCardColors';

/* eslint-disable @typescript-eslint/no-explicit-any -- layout/drag objects passed from parent have complex computed shapes */
interface MapContentProps {
  layout: any;
  themes: Theme[];
  product: Product;
  onRibClick: (cell: any, e: React.MouseEvent) => void;
  onReleaseClick: (releaseId: string) => void;
  mapSizeRef: React.MutableRefObject<{ width: number; height: number }> | null;
  onRenameTheme: (themeId: string, name: string) => void;
  onRenameBackbone: (themeId: string, backboneId: string, name: string) => void;
  onRenameRib: (themeId: string, backboneId: string, ribId: string, name: string) => void;
  onRenameRelease: (releaseId: string, name: string) => void;
  onDeleteTheme?: (themeId: string) => void;
  onDeleteBackbone?: (themeId: string, backboneId: string) => void;
  onDeleteRib?: (themeId: string, backboneId: string, ribId: string) => void;
  onCloneRib?: (themeId: string, backboneId: string, ribId: string) => void;
  onSetCardColor?: (themeId: string, backboneId: string, ribId: string, color: RibCardColorKey | undefined) => void;
  onDeleteRelease?: (releaseId: string) => void;
  onAddTheme?: () => void;
  onAddBackbone?: (themeId: string) => void;
  onAddRib?: (themeId: string, backboneId: string) => void;
  onAddRibToRelease?: (themeId: string, backboneId: string, releaseId: string) => void;
  onAddReleaseAfter?: (releaseId: string) => void;
  dragState: any;
  onDragStart: (e: React.PointerEvent, cell: any) => void;
  onBackboneDragStart: (e: React.PointerEvent, column: any) => void;
  onThemeDragStart: (e: React.PointerEvent, themeSpan: any) => void;
  onReleaseDragStart?: (e: React.PointerEvent, lane: any) => void;
  onToggleCollapse: (releaseId: string) => void;
  selectedIds?: Set<string>;
  /** ID of the rib whose detail panel is open — visually anchored as "selected" so the
   * user can see which card the edit panel is attached to. */
  editingRibId?: string | null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function MapContent({
  layout, themes, product, onRibClick, onReleaseClick, mapSizeRef,
  onRenameTheme, onRenameBackbone, onRenameRib, onRenameRelease,
  onDeleteTheme, onDeleteBackbone, onDeleteRib, onCloneRib, onSetCardColor, onDeleteRelease,
  onAddTheme, onAddBackbone, onAddRib, onAddRibToRelease, onAddReleaseAfter,
  dragState, onDragStart, onBackboneDragStart, onThemeDragStart, onReleaseDragStart,
  onToggleCollapse, selectedIds, editingRibId,
}: MapContentProps) {
  const { columns, themeSpans, releaseLanes, cells, unassignedLane, gapButtons, totalWidth, totalHeight } = layout;

  // Extra width for the "+ Theme" / "+ Backbone" buttons beyond the right label column
  const addBtnWidth = 100;
  const mapWidth = themeSpans.length > 0 ? totalWidth + COL_GAP + addBtnWidth : addBtnWidth + LANE_LABEL_WIDTH;
  const mapHeight = Math.max(totalHeight, THEME_HEIGHT + BACKBONE_HEIGHT + 72);

  // Expose map size to parent for fit-to-screen
  useEffect(() => {
    if (mapSizeRef) {
      mapSizeRef.current = { width: mapWidth, height: mapHeight };
    }
  }, [mapWidth, mapHeight, mapSizeRef]);

  // Build theme color lookup
  const themeColorMap = {};
  (themes || []).forEach((t, i) => { themeColorMap[t.id] = getThemeColorClasses(t, i); });

  // Precompute which releases have allocations (for delete button state)
  const allocMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const r of product.releases || []) {
      map[r.id] = releaseHasAllocations(product, r.id);
    }
    return map;
  }, [product]);

  // Determine highlighted drop zones from drag state
  const isRibDrag = dragState?.isDragging && dragState.dragType === 'rib';
  const isBackboneDrag = dragState?.isDragging && dragState.dragType === 'backbone';
  const isThemeDrag = dragState?.isDragging && dragState.dragType === 'theme';
  const isReleaseDrag = dragState?.isDragging && dragState.dragType === 'release';
  const highlightReleaseId = isRibDrag ? dragState.targetReleaseId : undefined;
  const highlightBackboneId = isRibDrag ? dragState.targetBackboneId : undefined;
  const highlightThemeId = isBackboneDrag ? dragState.targetThemeId : undefined;

  if (!themes?.length) {
    return (
      <div className="relative" style={{ width: mapWidth, height: mapHeight }} data-map-bg="">
        <p className="absolute left-32 top-16 text-gray-400 text-sm">No themes yet — add one to get started.</p>
        {onAddTheme && (
          <button
            className="absolute bg-blue-50 hover:bg-blue-100 text-blue-400 hover:text-blue-600 text-xs font-medium rounded px-2 py-1 transition-colors"
            style={{ left: LANE_LABEL_WIDTH, top: 4, height: 32 }}
            onClick={onAddTheme}
          >
            + Theme
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative"
      style={{ width: mapWidth, height: mapHeight, minWidth: mapWidth, minHeight: mapHeight }}
      data-map-bg=""
    >
      {/* Theme headers */}
      {themeSpans.map((ts) => (
        <ThemeHeader
          key={ts.themeId}
          themeSpan={ts}
          colorClasses={themeColorMap[ts.themeId]}
          onRename={onRenameTheme}
          onDelete={onDeleteTheme}
          onAddBackbone={onAddBackbone}
          isDropTarget={highlightThemeId === ts.themeId && ts.themeId !== dragState?.themeId}
          isDragging={isThemeDrag && dragState.themeId === ts.themeId}
          onDragStart={onThemeDragStart}
        />
      ))}

      {/* Backbone headers */}
      {columns.map(col => (
        <BackboneHeader
          key={col.backboneId}
          column={col}
          colorClasses={themeColorMap[col.themeId]}
          onRename={onRenameBackbone}
          onDelete={onDeleteBackbone}
          isDropTarget={highlightBackboneId === col.backboneId}
          isDragging={isBackboneDrag && dragState.backboneId === col.backboneId}
          onDragStart={onBackboneDragStart}
        />
      ))}

      {/* + Backbone buttons for empty themes (no backbones yet) */}
      {onAddBackbone && themeSpans.filter(ts => ts.isEmpty).map(ts => (
        <button
          key={`add-bb-${ts.themeId}`}
          className="absolute bg-blue-50 hover:bg-blue-100 text-blue-400 hover:text-blue-600 text-xs font-medium rounded px-2 py-1 whitespace-nowrap transition-colors dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 dark:hover:text-blue-300"
          style={{ left: ts.x, top: THEME_HEIGHT + 2, height: 28, width: ts.width }}
          onClick={() => onAddBackbone(ts.themeId)}
        >
          + Backbone
        </button>
      ))}

      {/* Release divider lines and labels */}
      {releaseLanes.map((lane, i) => (
        <ReleaseDivider
          key={lane.releaseId}
          lane={lane}
          totalWidth={totalWidth}
          isFirst={i === 0}
          isDropTarget={highlightReleaseId === lane.releaseId}
          isDragging={isReleaseDrag && dragState.releaseId === lane.releaseId}
          collapsed={lane.collapsed || false}
          onToggleCollapse={onToggleCollapse}
          onRename={onRenameRelease}
          onAddReleaseAfter={onAddReleaseAfter}
          onDeleteRelease={onDeleteRelease}
          hasAllocations={allocMap[lane.releaseId] || false}
          onClick={onReleaseClick}
          onReleaseDragStart={onReleaseDragStart}
        />
      ))}

      {/* Unassigned lane */}
      {unassignedLane && (
        <UnassignedLane
          lane={unassignedLane}
          totalWidth={totalWidth}
          isDropTarget={highlightReleaseId === null && isRibDrag}
        />
      )}

      {/* Column divider lines (subtle vertical guides) */}
      {columns.map(col => (
        <div
          key={`vline-${col.backboneId}`}
          className="absolute bg-gray-100"
          style={{
            left: col.x + col.width + 2,
            top: THEME_HEIGHT,
            width: 1,
            height: totalHeight - THEME_HEIGHT,
          }}
        />
      ))}

      {/* Drop target highlights */}
      <DropHighlight
        columns={columns}
        themeSpans={themeSpans}
        releaseLanes={releaseLanes}
        unassignedLane={unassignedLane}
        totalHeight={totalHeight}
        highlightBackboneId={highlightBackboneId}
        highlightReleaseId={highlightReleaseId}
        highlightThemeId={highlightThemeId}
        dragSourceThemeId={dragState?.themeId}
      />

      {/* Insertion indicator (blue line showing drop position) */}
      {dragState && <InsertionIndicator dragState={dragState} layout={layout} />}

      {/* Rib cells */}
      {cells.map(cell => {
        const draggedIds = isRibDrag ? (dragState.selectedIds || new Set([dragState.ribId])) : null;
        return (
          <RibCell
            key={`${cell.id}-${cell.releaseId || 'unassigned'}`}
            cell={cell}
            onClick={onRibClick}
            onRename={onRenameRib}
            onDelete={onDeleteRib}
            onClone={onCloneRib}
            onSetCardColor={onSetCardColor}
            onDragStart={onDragStart}
            isDragging={draggedIds?.has(cell.id)}
            isSelected={selectedIds?.has(cell.id) || cell.id === editingRibId}
          />
        );
      })}

      {/* Hover + Rib buttons in gap zones below last card in each column×lane */}
      {!dragState?.isDragging && gapButtons?.map(gb => (
        <div
          key={`gap-${gb.backboneId}-${gb.releaseId || 'unassigned'}`}
          className="absolute opacity-0 hover:opacity-100 transition-opacity duration-150"
          style={{ left: gb.x, top: gb.y, width: gb.width, height: 22 }}
        >
          <button
            className="w-full h-full bg-blue-50 hover:bg-blue-100 text-blue-400 hover:text-blue-600 text-[10px] rounded px-1 transition-colors dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 dark:hover:text-blue-300"
            onClick={() => gb.releaseId ? onAddRibToRelease?.(gb.themeId, gb.backboneId, gb.releaseId) : onAddRib?.(gb.themeId, gb.backboneId)}
          >
            + Rib
          </button>
        </div>
      ))}

      {/* + Theme button (after last theme) */}
      {onAddTheme && (
        <button
          className="absolute bg-blue-50 hover:bg-blue-100 text-blue-400 hover:text-blue-600 text-xs font-medium rounded px-2 py-1 transition-colors"
          style={{ left: totalWidth + COL_GAP, top: 4, height: 32 }}
          onClick={onAddTheme}
        >
          + Theme
        </button>
      )}

      {/* + Backbone button (below + Theme, adds to last theme) */}
      {onAddBackbone && (
        <button
          className="absolute bg-blue-50 hover:bg-blue-100 text-blue-400 hover:text-blue-600 text-xs font-medium rounded px-2 py-1 whitespace-nowrap transition-colors"
          style={{ left: totalWidth + COL_GAP, top: THEME_HEIGHT + 2, height: 28 }}
          onClick={() => onAddBackbone(themeSpans[themeSpans.length - 1].themeId)}
        >
          + Backbone
        </button>
      )}

    </div>
  );
}
