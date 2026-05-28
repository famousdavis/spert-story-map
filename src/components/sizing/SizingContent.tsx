// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useEffect, useState } from 'react';
import { SIZE_COLORS } from '../ui/SizePicker';
import { useTooltip } from '../ui/Tooltip';
import KebabMenu from '../ui/KebabMenu';
import RibCardColorPicker from '../storymap/RibCardColorPicker';
import {
  RIB_CARD_COLOR_BG,
  isRibCardColorKey,
  type RibCardColorKey,
} from '../../lib/ribCardColors';
import { COL_WIDTH, COL_GAP, CELL_HEIGHT, CELL_GAP, CELL_PAD, CELL_WIDTH, HEADER_HEIGHT, ZONE_GAP, LETTER_STRIP_HEIGHT, NUMBER_GUTTER_WIDTH } from './useSizingLayout';
import type { Size, Category } from '../../types';

export interface SizingCell {
  id: string;
  name: string;
  size: Size;
  sizeLabel: string | null;
  category: Category;
  themeId: string;
  backboneId: string;
  backboneName: string;
  locked: boolean;
  percentComplete: number;
  cardColor?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SizeColumn {
  label: string;
  points: number;
  count: number;
  x: number;
  width: number;
}

interface UnsizedZone {
  y: number;
  width: number;
  height: number;
}

interface SizingLayout {
  sizeColumns: SizeColumn[];
  unsizedZone: UnsizedZone;
  unsizedCount: number;
  unsizedGridCols: number;
  sizeColumnsY: number;
  cells: SizingCell[];
  totalWidth: number;
  totalHeight: number;
}

interface SizingDragState {
  isDragging: boolean;
  ribId: string | null;
  targetSize: string | null;
  insertIndex: number | null;
}

interface SizingContentProps {
  layout: SizingLayout;
  mapSizeRef: React.MutableRefObject<{ width: number; height: number }>;
  dragState: SizingDragState | null;
  onDragStart: (e: React.PointerEvent, cell: SizingCell) => void;
  onRibEdit: (cell: SizingCell) => void;
  onRibSplit: (cell: SizingCell) => void;
  onRibDelete: (cell: SizingCell) => void;
  onSetCardColor?: (themeId: string, backboneId: string, ribId: string, color: RibCardColorKey | undefined) => void;
}

// Header background colors keyed by size label (lighter fill for column headers)
const HEADER_BG: Record<string, string> = {
  'XS': 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300',
  'S': 'bg-teal-50 border-teal-200 text-teal-800 dark:bg-teal-900/30 dark:border-teal-700 dark:text-teal-300',
  'M': 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300',
  'L': 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300',
  'XL': 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-300',
  'XXL': 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300',
  'XXXL': 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-300',
};
const DEFAULT_HEADER_BG = 'bg-gray-50 border-gray-200 text-gray-800 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300';

// Excel-style column label: 0 → A, 25 → Z, 26 → AA, 27 → AB, …
function colLetter(idx: number): string {
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export default function SizingContent({ layout, mapSizeRef, dragState, onDragStart, onRibEdit, onRibSplit, onRibDelete, onSetCardColor }: SizingContentProps) {
  const { sizeColumns, unsizedZone, unsizedCount, unsizedRows, unsizedGridCols, sizeColumnsY, cells, totalWidth, totalHeight } = layout;

  // Report map dimensions for auto-fit
  useEffect(() => {
    if (mapSizeRef) {
      mapSizeRef.current = { width: totalWidth + 24, height: totalHeight + 24 };
    }
  }, [totalWidth, totalHeight, mapSizeRef]);

  const isDragging = dragState?.isDragging;
  const dragRibId = dragState?.ribId;
  const targetSize = dragState?.targetSize;

  // Effective grid dimensions for header rendering — show at least 1 row of numbers
  // even when the unsized zone is empty so the grid structure is visible.
  const visibleRows = Math.max(1, unsizedRows);

  return (
    <div className="relative" style={{ width: totalWidth, height: totalHeight }} data-map-bg="">
      {/* Excel-style column letters (A, B, C…) above each unsized grid column */}
      {Array.from({ length: unsizedGridCols }).map((_, i) => (
        <div
          key={`col-letter-${i}`}
          className="absolute flex items-center justify-center text-[10px] font-mono font-medium text-gray-400 dark:text-gray-500 pointer-events-none select-none"
          style={{
            left: NUMBER_GUTTER_WIDTH + CELL_PAD + i * (CELL_WIDTH + CELL_GAP),
            top: 0,
            width: CELL_WIDTH,
            height: LETTER_STRIP_HEIGHT,
          }}
        >
          {colLetter(i)}
        </div>
      ))}
      {/* "Unsized (n)" label — right-aligned on the column-letter row */}
      <div
        className="absolute text-xs font-medium text-gray-400 dark:text-gray-500 pointer-events-none select-none flex items-center justify-end pr-1"
        style={{
          right: 0,
          top: 0,
          height: LETTER_STRIP_HEIGHT,
          maxWidth: NUMBER_GUTTER_WIDTH + 120,
        }}
      >
        Unsized ({unsizedCount})
      </div>
      {/* Unsized zone background */}
      <div
        className={`absolute rounded-lg border border-dashed transition-colors ${
          isDragging && targetSize === null
            ? 'bg-blue-50/50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-600'
            : 'bg-gray-50 border-gray-300 dark:bg-gray-800 dark:border-gray-600'
        }`}
        style={{
          left: unsizedZone.x,
          top: unsizedZone.y,
          width: unsizedZone.width,
          height: unsizedZone.height,
        }}
      />
      {/* Excel-style row numbers (1, 2, 3…) in the left gutter */}
      {Array.from({ length: visibleRows }).map((_, i) => (
        <div
          key={`row-num-${i}`}
          className="absolute flex items-center justify-center text-[10px] font-mono font-medium text-gray-400 dark:text-gray-500 pointer-events-none select-none"
          style={{
            left: 0,
            top: LETTER_STRIP_HEIGHT + CELL_PAD + i * (CELL_HEIGHT + CELL_GAP),
            width: NUMBER_GUTTER_WIDTH,
            height: CELL_HEIGHT,
          }}
        >
          {i + 1}
        </div>
      ))}

      {/* Size column headers */}
      {sizeColumns.map(col => {
        const headerY = sizeColumnsY - HEADER_HEIGHT;
        const bgClass = HEADER_BG[col.label] || DEFAULT_HEADER_BG;
        return (
          <div
            key={col.label}
            className={`absolute flex items-center justify-center rounded-t-lg border font-medium text-sm ${bgClass}`}
            style={{ left: col.x, top: headerY, width: col.width, height: HEADER_HEIGHT }}
          >
            <span>{col.label}</span>
            <span className="ml-1 text-[10px] opacity-50">{col.points}pts</span>
            <span className="ml-1.5 text-xs opacity-60">({col.count})</span>
          </div>
        );
      })}

      {/* Size column backgrounds */}
      {sizeColumns.map((col, i) => {
        const colHeight = totalHeight - sizeColumnsY;
        const isTarget = isDragging && targetSize === col.label;
        return (
          <div
            key={`bg-${col.label}`}
            className={`absolute rounded-b-lg border-x border-b transition-colors ${
              isTarget
                ? 'bg-blue-50/40 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700'
                : i % 2 === 0
                  ? 'bg-white border-gray-100 dark:bg-gray-900 dark:border-gray-800'
                  : 'bg-gray-50/50 border-gray-100 dark:bg-gray-800/50 dark:border-gray-800'
            }`}
            style={{ left: col.x, top: sizeColumnsY, width: col.width, height: colHeight }}
          />
        );
      })}

      {/* Insertion indicator */}
      {isDragging && dragState.insertIndex != null && (
        <SizingInsertionIndicator
          dragState={dragState}
          layout={layout}
        />
      )}

      {/* Rib cells */}
      {cells.map(cell => (
        <SizingRibCell
          key={cell.id}
          cell={cell}
          onDragStart={onDragStart}
          isDragging={isDragging && dragRibId === cell.id}
          onEdit={onRibEdit}
          onSplit={onRibSplit}
          onDelete={onRibDelete}
          onSetCardColor={onSetCardColor}
        />
      ))}

      {/* Empty state */}
      {cells.length === 0 && sizeColumns.length > 0 && (
        <div
          className="absolute text-sm text-gray-400 dark:text-gray-500 pointer-events-none"
          style={{ left: totalWidth / 2 - 80, top: unsizedZone.y + unsizedZone.height / 2 - 10 }}
        >
          No rib items to size
        </div>
      )}

      {/* No size mapping configured */}
      {sizeColumns.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-400 dark:text-gray-500">
            <p className="text-sm font-medium">No size mapping configured</p>
            <p className="text-xs mt-1">Go to Settings to configure t-shirt sizes</p>
          </div>
        </div>
      )}
    </div>
  );
}

interface SizingRibCellProps {
  cell: SizingCell;
  onDragStart: (e: React.PointerEvent, cell: SizingCell) => void;
  isDragging: boolean;
  onEdit: (cell: SizingCell) => void;
  onSplit: (cell: SizingCell) => void;
  onDelete: (cell: SizingCell) => void;
  onSetCardColor?: (themeId: string, backboneId: string, ribId: string, color: RibCardColorKey | undefined) => void;
}

function SizingRibCell({ cell, onDragStart, isDragging, onEdit, onSplit, onDelete, onSetCardColor }: SizingRibCellProps) {
  const sizeColor = cell.size ? (SIZE_COLORS[cell.size] || 'bg-gray-100 text-gray-800') : '';
  const locked = cell.locked;
  const cardColorKey: RibCardColorKey | undefined = isRibCardColorKey(cell.cardColor) ? cell.cardColor : undefined;
  const { triggerRef, onMouseEnter, onMouseLeave, tooltipEl } = useTooltip(cell.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);

  // Suppress hover tooltip while the kebab menu or color picker is open.
  const handleMouseEnter = () => { if (!menuOpen && !pickerAnchor) onMouseEnter(); };

  // When the kebab menu opens, also dismiss any active tooltip so it doesn't stick
  // through the menu / modal flow.
  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (open) onMouseLeave();
  };

  // Anchor the color picker below the card's right edge. RibCardColorPicker clamps
  // to viewport so edge cards still render fully on-screen.
  const handleColorMenuClick = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onMouseLeave();
    setPickerAnchor({ x: r.right - 156, y: r.bottom + 4 });
  };

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`absolute rounded border text-left select-none transition-colors ${
        isDragging
          ? 'border-blue-400 bg-blue-50 opacity-50 shadow-lg ring-2 ring-blue-300 dark:bg-blue-900/30 dark:ring-blue-500/50'
          : cardColorKey
            ? `border-gray-200 ${RIB_CARD_COLOR_BG[cardColorKey]} hover:border-blue-400 dark:border-gray-700 dark:hover:border-blue-500`
            : locked
              ? 'border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-800/50'
              : 'border-gray-200 bg-white hover:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-500'
      } ${locked ? '' : 'cursor-grab active:cursor-grabbing'} px-2 py-1.5 overflow-hidden`}
      onPointerDown={locked ? undefined : (e) => {
        e.stopPropagation();
        e.preventDefault();
        onDragStart(e, cell);
      }}
      style={{
        left: cell.x,
        top: cell.y,
        width: cell.width,
        height: cell.height,
        zIndex: isDragging ? 50 : undefined,
      }}
      data-rib-id={cell.id}
    >
      <div className="flex items-start justify-between gap-1">
        {locked && (
          <span className="text-sm leading-none text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5 px-0.5 select-none" title={`${cell.percentComplete}% complete`}>
            {cell.percentComplete >= 100 ? '✓' : `${cell.percentComplete}%`}
          </span>
        )}
        <span className={`text-xs leading-tight line-clamp-2 flex-1 font-medium ${locked ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
          {cell.name}
        </span>
        {cell.size && (
          <span className={`text-[10px] font-medium px-1 py-0.5 rounded flex-shrink-0 leading-none ${locked ? 'opacity-50' : ''} ${sizeColor}`}>
            {cell.size}
          </span>
        )}
        <KebabMenu
          ariaLabel={`Actions for ${cell.name}`}
          onOpenChange={handleMenuOpenChange}
          items={[
            { label: 'Edit…', onClick: () => onEdit(cell) },
            ...(onSetCardColor ? [{ label: 'Color…', onClick: handleColorMenuClick }] : []),
            { label: 'Split', onClick: () => onSplit(cell) },
            { label: 'Delete…', onClick: () => onDelete(cell), danger: true },
          ]}
        />
      </div>
      <div className={`flex items-center gap-1.5 mt-0.5 text-[10px] ${locked ? 'opacity-50' : ''}`}>
        <span className="text-gray-400 dark:text-gray-500 truncate">{cell.backboneName}</span>
        <span className={`ml-auto flex-shrink-0 ${cell.category === 'core' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
          {cell.category === 'core' ? 'Core' : 'Non-Core'}
        </span>
      </div>
      {!pickerAnchor && tooltipEl}
      {pickerAnchor && onSetCardColor && (
        <RibCardColorPicker
          anchor={pickerAnchor}
          current={cardColorKey}
          onSelect={(color) => onSetCardColor(cell.themeId, cell.backboneId, cell.id, color)}
          onClose={() => setPickerAnchor(null)}
        />
      )}
    </div>
  );
}

interface SizingInsertionIndicatorProps {
  dragState: SizingDragState;
  layout: SizingLayout;
}

function SizingInsertionIndicator({ dragState, layout }: SizingInsertionIndicatorProps) {
  const { targetSize, insertIndex, ribId } = dragState;
  const { cells, sizeColumns, unsizedGridCols, sizeColumnsY } = layout;

  if (targetSize === null) {
    // Unsized zone: horizontal line at grid position
    const unsizedCells = cells
      .filter(c => c.sizeLabel === null && c.id !== ribId)
      .sort((a, b) => a.y - b.y || a.x - b.x);

    const cellWidth = COL_WIDTH - CELL_PAD * 2;
    const idx = Math.min(insertIndex, unsizedCells.length);

    // Compute grid row/col of insertion point
    const gridRow = Math.floor(idx / unsizedGridCols);
    const gridCol = idx % unsizedGridCols;

    // If inserting at end of a full row, show at start of next row
    const lineX = gridCol * (cellWidth + CELL_GAP) + CELL_PAD;
    let lineY;
    if (unsizedCells.length === 0 || idx === 0) {
      lineY = CELL_PAD;
    } else if (gridCol === 0 && idx > 0) {
      // Start of a new row — line goes above this row
      lineY = CELL_PAD + gridRow * (CELL_HEIGHT + CELL_GAP) - CELL_GAP / 2;
    } else {
      // Within a row — vertical line between cells (show as horizontal line above the insertion cell)
      lineY = CELL_PAD + gridRow * (CELL_HEIGHT + CELL_GAP) - CELL_GAP / 2;
    }

    // For the unsized grid, show a horizontal line spanning one cell width
    return (
      <div
        className="absolute bg-blue-500 rounded-full pointer-events-none"
        style={{
          left: lineX,
          top: lineY,
          width: cellWidth,
          height: 2,
          zIndex: 40,
        }}
      >
        <div className="absolute -left-1 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
        <div className="absolute -right-1 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
      </div>
    );
  }

  // Sized column: grid-aware horizontal line at the insertion (row, subCol).
  // Mirrors the unsized zone math so behavior is consistent across zones.
  const col = sizeColumns.find(c => c.label === targetSize);
  if (!col) return null;

  const subCols = (layout.sizedSubColsByLabel && layout.sizedSubColsByLabel[targetSize]) || 1;
  const colCellsCount = cells.filter(c => c.sizeLabel === targetSize && c.id !== ribId).length;
  const idx = Math.min(insertIndex, colCellsCount);
  const gridRow = Math.floor(idx / subCols);
  const gridCol = idx % subCols;

  const lineX = col.x + CELL_PAD + gridCol * (CELL_WIDTH + CELL_GAP);
  const lineY = colCellsCount === 0 || idx === 0
    ? sizeColumnsY + CELL_PAD
    : sizeColumnsY + CELL_PAD + gridRow * (CELL_HEIGHT + CELL_GAP) - CELL_GAP / 2;

  return (
    <div
      className="absolute bg-blue-500 rounded-full pointer-events-none"
      style={{
        left: lineX,
        top: lineY,
        width: CELL_WIDTH,
        height: 2,
        zIndex: 40,
      }}
    >
      <div className="absolute -left-1 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
      <div className="absolute -right-1 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
    </div>
  );
}
