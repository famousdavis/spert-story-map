// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useState } from 'react';
import { SIZE_COLORS } from '../ui/SizePicker';
import { useTooltip } from '../ui/Tooltip';
import useInlineEdit from './useInlineEdit';
import RibCardColorPicker from './RibCardColorPicker';
import {
  RIB_CARD_COLOR_BG,
  RIB_CARD_COLOR_SWATCH,
  isRibCardColorKey,
  type RibCardColorKey,
} from '../../lib/ribCardColors';
import type { Size, Category, ReleaseAllocation } from '../../types';

interface CellData {
  id: string;
  name: string;
  themeId: string;
  backboneId: string;
  releaseId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  size: Size;
  points: number;
  category: Category;
  isPartial: boolean;
  allocation: ReleaseAllocation;
  allocTotal: number;
  cardColor?: string;
}

interface RibCellProps {
  cell: CellData;
  onClick: (cell: CellData, e: React.MouseEvent) => void;
  onRename: (themeId: string, backboneId: string, ribId: string, name: string) => void;
  onDelete?: (themeId: string, backboneId: string, ribId: string) => void;
  onClone?: (themeId: string, backboneId: string, ribId: string) => void;
  onSetCardColor?: (themeId: string, backboneId: string, ribId: string, color: RibCardColorKey | undefined) => void;
  onDragStart?: (e: React.PointerEvent, cell: CellData) => void;
  isDragging: boolean;
  isSelected: boolean;
}

export default function RibCell({ cell, onClick, onRename, onDelete, onClone, onSetCardColor, onDragStart, isDragging, isSelected }: RibCellProps) {
  const sizeColor = cell.size ? (SIZE_COLORS[cell.size] || 'bg-gray-100 text-gray-800') : '';
  const allocWarning = cell.allocTotal > 0 && cell.allocTotal !== 100;
  const cardColorKey: RibCardColorKey | undefined = isRibCardColorKey(cell.cardColor) ? cell.cardColor : undefined;

  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(cell.name, (name) => onRename(cell.themeId, cell.backboneId, cell.id, name));

  const { triggerRef, onMouseEnter, onMouseLeave, tooltipEl } = useTooltip(cell.name);

  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);

  const handleGripPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDragStart) onDragStart(e, cell);
  };

  const handleSwatchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Dismiss any visible name-tooltip before opening the picker. The picker portal
    // overlays part of the card, so the cursor never physically leaves the card's
    // bounding box during picker interaction — mouseLeave never fires and the
    // tooltip would otherwise stay stuck on top of the picker / for the rest of the
    // session as the user moves between cards.
    onMouseLeave();
    setPickerAnchor({ x: e.clientX, y: e.clientY });
  };

  const baseBg = isDragging
    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 opacity-50 shadow-lg ring-2 ring-blue-300 dark:ring-blue-500/50'
    : isSelected
      ? cardColorKey
        ? `border-blue-400 ${RIB_CARD_COLOR_BG[cardColorKey]} ring-2 ring-blue-200 dark:ring-blue-500/50 dark:border-blue-500`
        : 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-500/50 dark:border-blue-500'
      : allocWarning
        ? 'border-amber-300 bg-amber-50 hover:border-amber-400 dark:border-amber-700 dark:bg-amber-900/20 dark:hover:border-amber-600'
        : cardColorKey
          ? `border-gray-200 ${RIB_CARD_COLOR_BG[cardColorKey]} hover:border-blue-400 dark:border-gray-700 dark:hover:border-blue-500`
          : 'border-gray-200 bg-white hover:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-500';

  return (
    <div
      ref={triggerRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`absolute rounded border text-left select-none transition-colors ${baseBg} group cursor-pointer px-2 py-1.5 overflow-hidden`}
      style={{
        left: cell.x,
        top: cell.y,
        width: cell.width,
        height: cell.height,
        zIndex: isDragging ? 50 : undefined,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!editing) onClick(cell, e);
      }}
      data-rib-id={cell.id}
      data-backbone-id={cell.backboneId}
      data-theme-id={cell.themeId}
      data-release-id={cell.releaseId || ''}
    >
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-1 h-full">
        {/* Left column: drag grip + color swatch */}
        <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
          <span
            className="text-sm leading-none text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing select-none"
            onPointerDown={handleGripPointerDown}
            title="Drag to move"
          >
            ⠿
          </span>
          {onSetCardColor && (
            <button
              type="button"
              className={`w-3 h-3 rounded-full border opacity-0 group-hover:opacity-100 transition-opacity ${
                cardColorKey
                  ? `${RIB_CARD_COLOR_SWATCH[cardColorKey]} border-gray-400 dark:border-gray-500`
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-500 hover:border-gray-500 dark:hover:border-gray-300'
              }`}
              onClick={handleSwatchClick}
              title="Card color"
              aria-label="Card color"
            />
          )}
        </div>

        {/* Middle column: name (top) + points/percentage (bottom) */}
        <div className="flex flex-col justify-between min-w-0 gap-0.5">
          <div className="flex items-start gap-1 min-w-0">
            {editing ? (
              <input
                ref={inputRef}
                name="ribName"
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                onClick={e => e.stopPropagation()}
                className="text-xs leading-tight flex-1 font-medium bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-600 rounded px-1 py-0 outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-500 text-gray-900 dark:text-gray-100 min-w-0"
              />
            ) : (
              <span
                className="text-xs text-gray-800 dark:text-gray-200 leading-tight line-clamp-2 flex-1 min-w-0 font-medium"
                onDoubleClick={startEditing}
              >
                {cell.name}
              </span>
            )}
            {cell.size && (
              <span className={`text-[10px] font-medium px-1 py-0.5 rounded flex-shrink-0 leading-none ${sizeColor}`}>
                {cell.size}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            {cell.points > 0 && <span className="text-gray-400 dark:text-gray-500">{cell.points}pts</span>}
            {cell.isPartial && <span className="text-blue-600 dark:text-blue-400 font-medium">{cell.allocation.percentage}%</span>}
            {allocWarning && <span className="text-amber-600 dark:text-amber-400 font-medium">{cell.allocTotal}%</span>}
          </div>
        </div>

        {/* Right column: clone + delete (top) + Core/Non-Core (bottom) */}
        <div className="flex flex-col justify-between items-end flex-shrink-0 gap-0.5">
          <div className="flex flex-col items-end gap-0.5 -mr-0.5">
            {onClone && (
              <button
                className="leading-none text-blue-300 hover:text-blue-600 dark:text-blue-400/50 dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onClone(cell.themeId, cell.backboneId, cell.id); }}
                title="Clone rib item"
                aria-label="Clone rib item"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            )}
            {onDelete && (
              <button
                className="text-[11px] leading-none text-red-300 hover:text-red-600 dark:text-red-400/50 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onDelete(cell.themeId, cell.backboneId, cell.id); }}
                title="Delete"
              >
                ×
              </button>
            )}
          </div>
          <span className={`text-[10px] leading-none ${cell.category === 'core' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
            {cell.category === 'core' ? 'Core' : 'Non-Core'}
          </span>
        </div>
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
