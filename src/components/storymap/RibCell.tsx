// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useState } from 'react';
import { SIZE_COLORS } from '../ui/SizePicker';
import { useTooltip } from '../ui/Tooltip';
import useInlineEdit from './useInlineEdit';
import RibCardColorPicker from './RibCardColorPicker';
import KebabMenu from '../ui/KebabMenu';
import {
  RIB_CARD_COLOR_BG,
  isRibCardColorKey,
  type RibCardColorKey,
} from '../../lib/ribCardColors';
import { isInteractiveChild } from '../../lib/domHelpers';
import { RIB_NAME_TOOLTIP_DELAY } from '../../lib/constants';
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

  const { triggerRef, onMouseEnter, onMouseLeave, tooltipEl } = useTooltip<HTMLDivElement>(cell.name, RIB_NAME_TOOLTIP_DELAY);

  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Suppress the hover tooltip while the kebab menu or color picker is open.
  const handleMouseEnter = () => { if (!menuOpen && !pickerAnchor) onMouseEnter(); };

  // When the kebab menu opens, also dismiss any active tooltip so it doesn't stick
  // through the menu flow.
  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (open) onMouseLeave();
  };

  const handleCardPointerDown = (e: React.PointerEvent) => {
    // Whole card is the drag surface (the grip is gone). Bail on interactive children
    // (the kebab trigger, its portal menu, and the inline-edit input) and while renaming inline.
    if (editing) return;
    if (isInteractiveChild(e.target as HTMLElement)) return;
    e.stopPropagation();
    e.preventDefault();
    if (onDragStart) onDragStart(e, cell);
  };

  // Anchor the color picker off the card's own bounding rect — same convention
  // SizingRibCell already uses — since a kebab menu item's onClick has no mouse
  // event to read click coordinates from (unlike the old swatch button).
  const handleColorMenuClick = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onMouseLeave();
    setPickerAnchor({ x: r.right - 156, y: r.bottom + 4 });
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

  // Covers both portals this card can open: the kebab's own dropdown, and the color
  // picker a kebab item spawns. Either one being open must keep the trigger visible,
  // because the pointer has to leave the card's hover box to reach either portal
  // (both render outside the card's DOM subtree via createPortal), which would
  // otherwise let group-hover revert the trigger to opacity-0 while its own popover
  // is still on screen.
  const kebabVisible = menuOpen || !!pickerAnchor;

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`absolute rounded border text-left select-none transition-colors ${baseBg} group cursor-grab active:cursor-grabbing px-2 py-1.5 overflow-hidden`}
      style={{
        left: cell.x,
        top: cell.y,
        width: cell.width,
        height: cell.height,
        zIndex: isDragging ? 50 : undefined,
      }}
      onPointerDown={handleCardPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        if (!editing && !isInteractiveChild(e.target as HTMLElement)) onClick(cell, e);
      }}
      data-rib-id={cell.id}
      data-backbone-id={cell.backboneId}
      data-theme-id={cell.themeId}
      data-release-id={cell.releaseId || ''}
    >
      <div className="flex flex-col justify-between gap-0.5 h-full">
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
            className="text-xs leading-tight font-medium bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-600 rounded px-1 py-0 outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-500 text-gray-900 dark:text-gray-100 w-full"
          />
        ) : (
          <span
            className="text-xs text-gray-800 dark:text-gray-200 leading-tight line-clamp-2 font-medium"
            onDoubleClick={startEditing}
          >
            {cell.name}
          </span>
        )}

        {/* Footer: size + points/percentage + Core/Non-Core + actions, all in one row.
            The name above now owns the full card width on both wrapped lines. Core/Non-Core
            is the one flexible/truncating item (flex-1 min-w-0 truncate); everything else is
            flex-shrink-0. See "Design decisions ratified in v2" for the worst-case width math
            and why the kebab itself stays safe under realistic data. */}
        <div className="flex items-center gap-1.5 text-[10px]">
          {cell.size && (
            <span className={`text-[10px] font-medium px-1 py-0.5 rounded flex-shrink-0 leading-none ${sizeColor}`}>
              {cell.size}
            </span>
          )}
          {cell.points > 0 && <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">{cell.points}pts</span>}
          {cell.isPartial && <span className="text-blue-600 dark:text-blue-400 font-medium flex-shrink-0">{cell.allocation.percentage}%</span>}
          {allocWarning && <span className="text-amber-600 dark:text-amber-400 font-medium flex-shrink-0">{cell.allocTotal}%</span>}
          <span className={`flex-1 min-w-0 truncate text-right leading-none ${cell.category === 'core' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
            {cell.category === 'core' ? 'Core' : 'Non-Core'}
          </span>
          {(onSetCardColor || onClone || onDelete) && (
            <div className={`flex-shrink-0 -mr-1 transition-opacity ${kebabVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
              <KebabMenu
                ariaLabel={`Actions for ${cell.name}`}
                onOpenChange={handleMenuOpenChange}
                items={[
                  ...(onSetCardColor ? [{ label: 'Color…', onClick: handleColorMenuClick }] : []),
                  ...(onClone ? [{ label: 'Clone rib item', onClick: () => onClone(cell.themeId, cell.backboneId, cell.id) }] : []),
                  ...(onDelete ? [{ label: 'Delete…', onClick: () => onDelete(cell.themeId, cell.backboneId, cell.id), danger: true }] : []),
                ]}
              />
            </div>
          )}
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
