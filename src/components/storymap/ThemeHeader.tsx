// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React from 'react';
import useInlineEdit from './useInlineEdit';
import { THEME_COLOR_OPTIONS } from '../../lib/themeColors';

/* eslint-disable @typescript-eslint/no-explicit-any -- layout/drag objects passed from parent have complex computed shapes */
interface ThemeHeaderProps {
  themeSpan: { themeId: string; themeName: string; x: number; width: number };
  colorClasses: { solid: string; light: string; dot: string; swatch: string } | undefined;
  onRename: (themeId: string, name: string) => void;
  onDelete?: (themeId: string) => void;
  onAddBackbone?: (themeId: string) => void;
  isDropTarget: boolean;
  isDragging: boolean;
  onDragStart?: (e: React.PointerEvent, themeSpan: any) => void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function ThemeHeader({ themeSpan, colorClasses, onRename, onDelete, onAddBackbone, isDropTarget, isDragging, onDragStart }: ThemeHeaderProps) {
  const color = colorClasses?.solid || THEME_COLOR_OPTIONS[0].solid;
  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(themeSpan.themeName, (name) => onRename(themeSpan.themeId, name));

  const handleGripPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDragStart) onDragStart(e, themeSpan);
  };

  return (
    <div
      className={`absolute ${color} rounded-md flex items-center gap-0.5 px-1 transition-shadow ${
        isDragging ? 'opacity-50 ring-2 ring-white/60' : ''
      } ${isDropTarget ? 'ring-2 ring-white/60 shadow-lg' : ''}`}
      style={{
        left: themeSpan.x,
        top: 0,
        width: themeSpan.width,
        height: 36,
        zIndex: isDragging ? 50 : undefined,
      }}
      data-theme-id={themeSpan.themeId}
    >
      {/* Drag grip */}
      <span
        className="text-sm leading-none text-white/40 hover:text-white/80 cursor-grab active:cursor-grabbing flex-shrink-0 px-0.5 select-none"
        onPointerDown={handleGripPointerDown}
        title="Drag to reorder"
      >
        ⠿
      </span>
      {editing ? (
        <input
          ref={inputRef}
          name="themeName"
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          className="bg-white/20 text-white placeholder-white/60 text-sm font-semibold rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-white/40 w-full border-0"
        />
      ) : (
        <span
          className="text-sm font-semibold text-white truncate cursor-pointer hover:bg-white/10 rounded px-1 py-0.5 transition-colors"
          onDoubleClick={startEditing}
          title="Double-click to rename"
        >
          {themeSpan.themeName}
        </span>
      )}
      {onAddBackbone && (
        <button
          className="text-[10px] leading-none text-white/40 hover:text-white/90 flex-shrink-0 ml-auto whitespace-nowrap transition-opacity"
          onClick={(e) => { e.stopPropagation(); onAddBackbone(themeSpan.themeId); }}
          title="Add backbone"
        >
          + Backbone
        </button>
      )}
      {onDelete && (
        <button
          className={`text-xs leading-none text-white/30 hover:text-white/90 flex-shrink-0 ${onAddBackbone ? '' : 'ml-auto'} transition-opacity`}
          onClick={(e) => { e.stopPropagation(); onDelete(themeSpan.themeId); }}
          title="Delete theme"
        >
          ×
        </button>
      )}
    </div>
  );
}
