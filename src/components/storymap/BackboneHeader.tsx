// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React from 'react';
import { THEME_HEIGHT, BACKBONE_HEIGHT } from './useMapLayout';
import useInlineEdit from './useInlineEdit';
import { DEFAULT_THEME_COLOR } from '../../lib/themeColors';

/* eslint-disable @typescript-eslint/no-explicit-any -- layout/drag objects passed from parent have complex computed shapes */
interface BackboneHeaderProps {
  column: { backboneId: string; backboneName: string; themeId: string; x: number; width: number };
  colorClasses: { solid: string; light: string; dot: string; swatch: string } | undefined;
  onRename: (themeId: string, backboneId: string, name: string) => void;
  onDelete?: (themeId: string, backboneId: string) => void;
  isDropTarget: boolean;
  isDragging: boolean;
  onDragStart?: (e: React.PointerEvent, column: any) => void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function BackboneHeader({ column, colorClasses, onRename, onDelete, isDropTarget, isDragging, onDragStart }: BackboneHeaderProps) {
  const color = colorClasses?.light || DEFAULT_THEME_COLOR.light;
  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(column.backboneName, (name) => onRename(column.themeId, column.backboneId, name));

  const handleGripPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDragStart) onDragStart(e, column);
  };

  return (
    <div
      className={`group absolute ${color} rounded flex items-center gap-0.5 px-1 transition-shadow ${
        isDragging ? 'opacity-50 ring-2 ring-blue-400' : ''
      } ${isDropTarget ? 'ring-2 ring-blue-400 shadow-md' : ''}`}
      style={{
        left: column.x,
        top: THEME_HEIGHT,
        width: column.width,
        height: BACKBONE_HEIGHT - 4,
        zIndex: isDragging ? 50 : undefined,
      }}
      data-backbone-id={column.backboneId}
      data-theme-id={column.themeId}
    >
      {/* Drag grip */}
      <span
        className="text-sm leading-none opacity-40 hover:opacity-80 cursor-grab active:cursor-grabbing flex-shrink-0 px-0.5 select-none"
        onPointerDown={handleGripPointerDown}
        title="Drag to move between themes"
      >
        ⠿
      </span>
      {editing ? (
        <input
          ref={inputRef}
          name="backboneName"
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          className="bg-white/60 text-xs font-medium rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-300 w-full border-0"
        />
      ) : (
        <span
          className="text-xs font-medium line-clamp-2 min-w-0 flex-1 cursor-pointer hover:bg-white/30 rounded px-1 py-0.5 transition-colors"
          onDoubleClick={startEditing}
          title="Double-click to rename"
        >
          {column.backboneName}
        </span>
      )}
      {onDelete && (
        <button
          className="text-[10px] leading-none opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-900 text-red-700 flex-shrink-0 ml-auto transition-opacity"
          onClick={(e) => { e.stopPropagation(); onDelete(column.themeId, column.backboneId); }}
          title="Delete backbone"
        >
          ×
        </button>
      )}
    </div>
  );
}
