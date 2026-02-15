import { useEffect } from 'react';
import { SIZE_COLORS } from '../ui/SizePicker';
import { useTooltip } from '../ui/Tooltip';
import { COL_WIDTH, COL_GAP, CELL_HEIGHT, CELL_GAP, CELL_PAD, HEADER_HEIGHT, ZONE_GAP } from './useSizingLayout';

// Header background colors keyed by size label (lighter fill for column headers)
const HEADER_BG = {
  'XS': 'bg-emerald-50 border-emerald-200 text-emerald-800',
  'S': 'bg-teal-50 border-teal-200 text-teal-800',
  'M': 'bg-blue-50 border-blue-200 text-blue-800',
  'L': 'bg-amber-50 border-amber-200 text-amber-800',
  'XL': 'bg-orange-50 border-orange-200 text-orange-800',
  'XXL': 'bg-red-50 border-red-200 text-red-800',
  'XXXL': 'bg-rose-50 border-rose-200 text-rose-800',
};
const DEFAULT_HEADER_BG = 'bg-gray-50 border-gray-200 text-gray-800';

export default function SizingContent({ layout, mapSizeRef, dragState, onDragStart }) {
  const { sizeColumns, unsizedZone, unsizedCount, sizeColumnsY, cells, totalWidth, totalHeight } = layout;

  // Report map dimensions for auto-fit
  useEffect(() => {
    if (mapSizeRef) {
      mapSizeRef.current = { width: totalWidth + 24, height: totalHeight + 24 };
    }
  }, [totalWidth, totalHeight, mapSizeRef]);

  const isDragging = dragState?.isDragging;
  const dragRibId = dragState?.ribId;
  const targetSize = dragState?.targetSize;

  return (
    <div className="relative" style={{ width: totalWidth, height: totalHeight }} data-map-bg="">
      {/* Unsized zone background */}
      <div
        className={`absolute rounded-lg border border-dashed transition-colors ${
          isDragging && targetSize === null
            ? 'bg-blue-50/50 border-blue-300'
            : 'bg-gray-50 border-gray-300'
        }`}
        style={{
          left: 0,
          top: unsizedZone.y,
          width: unsizedZone.width,
          height: unsizedZone.height,
        }}
      />
      {/* Unsized zone label */}
      <div
        className="absolute text-xs font-medium text-gray-400 pointer-events-none"
        style={{ left: CELL_PAD, top: unsizedZone.y - 18 }}
      >
        Unsized ({unsizedCount})
      </div>

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
                ? 'bg-blue-50/40 border-blue-200'
                : i % 2 === 0
                  ? 'bg-white border-gray-100'
                  : 'bg-gray-50/50 border-gray-100'
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
        />
      ))}

      {/* Empty state */}
      {cells.length === 0 && sizeColumns.length > 0 && (
        <div
          className="absolute text-sm text-gray-400 pointer-events-none"
          style={{ left: totalWidth / 2 - 80, top: unsizedZone.height / 2 - 10 }}
        >
          No rib items to size
        </div>
      )}

      {/* No size mapping configured */}
      {sizeColumns.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <p className="text-sm font-medium">No size mapping configured</p>
            <p className="text-xs mt-1">Go to Settings to configure t-shirt sizes</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SizingRibCell({ cell, onDragStart, isDragging }) {
  const sizeColor = cell.size ? (SIZE_COLORS[cell.size] || 'bg-gray-100 text-gray-800') : '';
  const locked = cell.locked;
  const { tooltipProps, tooltipEl } = useTooltip(cell.name);

  return (
    <div
      ref={tooltipProps.ref}
      onMouseEnter={tooltipProps.onMouseEnter}
      onMouseLeave={tooltipProps.onMouseLeave}
      className={`absolute rounded border text-left select-none transition-colors ${
        isDragging
          ? 'border-blue-400 bg-blue-50 opacity-50 shadow-lg ring-2 ring-blue-300'
          : locked
            ? 'border-gray-100 bg-gray-50/80'
            : 'border-gray-200 bg-white hover:border-blue-400'
      } px-2 py-1.5 overflow-hidden`}
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
        {locked ? (
          <span className="text-[10px] leading-none text-gray-300 flex-shrink-0 mt-0.5 select-none" title={`${cell.percentComplete}% complete`}>
            {cell.percentComplete >= 100 ? '✓' : `${cell.percentComplete}%`}
          </span>
        ) : (
          <span
            className="text-[10px] leading-none text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0 mt-0.5 select-none"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDragStart(e, cell);
            }}
            title="Drag to size"
          >
            ⠿
          </span>
        )}
        <span className={`text-xs leading-tight truncate flex-1 font-medium ${locked ? 'text-gray-400' : 'text-gray-800'}`}>
          {cell.name}
        </span>
        {cell.size && (
          <span className={`text-[10px] font-medium px-1 py-0.5 rounded flex-shrink-0 leading-none ${locked ? 'opacity-50' : ''} ${sizeColor}`}>
            {cell.size}
          </span>
        )}
      </div>
      <div className={`flex items-center gap-1.5 mt-0.5 text-[10px] ${locked ? 'opacity-50' : ''}`}>
        <span className="text-gray-400 truncate">{cell.backboneName}</span>
        <span className={`ml-auto flex-shrink-0 ${cell.category === 'core' ? 'text-blue-500' : 'text-gray-400'}`}>
          {cell.category === 'core' ? 'Core' : 'Non-Core'}
        </span>
      </div>
      {tooltipEl}
    </div>
  );
}

function SizingInsertionIndicator({ dragState, layout }) {
  const { targetSize, insertIndex, ribId } = dragState;
  const { cells, sizeColumns, unsizedZone, unsizedGridCols, sizeColumnsY } = layout;

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

  // Sized column: vertical insertion line
  const col = sizeColumns.find(c => c.label === targetSize);
  if (!col) return null;

  const colCells = cells
    .filter(c => c.sizeLabel === targetSize && c.id !== ribId)
    .sort((a, b) => a.y - b.y);

  let lineY;
  if (colCells.length === 0 || insertIndex === 0) {
    lineY = sizeColumnsY + CELL_PAD;
  } else if (insertIndex >= colCells.length) {
    const lastCell = colCells[colCells.length - 1];
    lineY = lastCell.y + CELL_HEIGHT + CELL_GAP / 2;
  } else {
    lineY = colCells[insertIndex].y - CELL_GAP / 2;
  }

  return (
    <div
      className="absolute bg-blue-500 rounded-full pointer-events-none"
      style={{
        left: col.x + 4,
        top: lineY,
        width: col.width - 8,
        height: 2,
        zIndex: 40,
      }}
    >
      <div className="absolute -left-1 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
      <div className="absolute -right-1 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
    </div>
  );
}
