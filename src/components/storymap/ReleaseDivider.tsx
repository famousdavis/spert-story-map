// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useRef } from 'react';
import { LANE_LABEL_WIDTH, RIGHT_LABEL_WIDTH } from './useMapLayout';
import useInlineEdit from './useInlineEdit';
import { useTooltip } from '../ui/Tooltip';

interface ReleaseLane {
  releaseId: string;
  releaseName: string;
  y: number;
  height: number;
  collapsed?: boolean;
  cardCount?: number;
}

interface ReleaseDividerProps {
  lane: ReleaseLane;
  totalWidth: number;
  isFirst: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  collapsed: boolean;
  onToggleCollapse: (releaseId: string) => void;
  onRename: (releaseId: string, name: string) => void;
  onAddReleaseAfter?: (releaseId: string) => void;
  onDeleteRelease?: (releaseId: string) => void;
  hasAllocations: boolean;
  onClick?: (releaseId: string) => void;
  onReleaseDragStart?: (e: React.PointerEvent, lane: ReleaseLane) => void;
}

export default function ReleaseDivider({
  lane, totalWidth, isFirst, isDropTarget, isDragging,
  collapsed, onToggleCollapse,
  onRename, onAddReleaseAfter, onDeleteRelease, hasAllocations,
  onClick, onReleaseDragStart,
}: ReleaseDividerProps) {
  // Left label inline edit
  const {
    editing: leftEditing,
    draft: leftDraft,
    setDraft: setLeftDraft,
    inputRef: leftInputRef,
    startEditing: startLeftEditing,
    commit: commitLeftEdit,
    handleKeyDown: handleLeftKeyDown,
  } = useInlineEdit(lane.releaseName, (name) => onRename(lane.releaseId, name));
  // Right label inline edit (shares the same rename callback)
  const {
    editing: rightEditing,
    draft: rightDraft,
    setDraft: setRightDraft,
    inputRef: rightInputRef,
    startEditing: startRightEditing,
    commit: commitRightEdit,
    handleKeyDown: handleRightKeyDown,
  } = useInlineEdit(lane.releaseName, (name) => onRename(lane.releaseId, name));

  // Delete tooltip
  const deleteTooltipText = hasAllocations ? 'Remove all items first' : `Delete ${lane.releaseName}`;
  const {
    triggerRef: leftDeleteTriggerRef,
    onMouseEnter: leftDeleteOnMouseEnter,
    onMouseLeave: leftDeleteOnMouseLeave,
    tooltipEl: leftDeleteTooltipEl,
  } = useTooltip(deleteTooltipText);
  const {
    triggerRef: rightDeleteTriggerRef,
    onMouseEnter: rightDeleteOnMouseEnter,
    onMouseLeave: rightDeleteOnMouseLeave,
    tooltipEl: rightDeleteTooltipEl,
  } = useTooltip(deleteTooltipText);

  // Click/double-click disambiguation for left label
  const leftClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLeftClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (leftClickTimer.current) return;
    leftClickTimer.current = setTimeout(() => {
      leftClickTimer.current = null;
      if (onClick) onClick(lane.releaseId);
    }, 200);
  };
  const handleLeftDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (leftClickTimer.current) { clearTimeout(leftClickTimer.current); leftClickTimer.current = null; }
    startLeftEditing();
  };

  // Click/double-click disambiguation for right label
  const rightClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRightClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (rightClickTimer.current) return;
    rightClickTimer.current = setTimeout(() => {
      rightClickTimer.current = null;
      if (onClick) onClick(lane.releaseId);
    }, 200);
  };
  const handleRightDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (rightClickTimer.current) { clearTimeout(rightClickTimer.current); rightClickTimer.current = null; }
    startRightEditing();
  };

  // Drag grip handler
  const handleGripPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onReleaseDragStart) onReleaseDragStart(e, lane);
  };

  const rightLabelX = totalWidth - RIGHT_LABEL_WIDTH;
  const bottomBtnY = lane.y + lane.height - 24;

  const labelClasses = isDropTarget
    ? 'text-blue-700 bg-blue-200 dark:text-blue-200 dark:bg-blue-800'
    : 'text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/40 dark:hover:bg-blue-900/60';

  // Collapse/expand toggle — rendered in both mirrored label areas. Must be pointer-events-auto
  // (the label container is pointer-events-none); stopPropagation keeps the click off the canvas.
  const chevron = (
    <button
      type="button"
      className="pointer-events-auto flex-shrink-0 text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300 text-xs leading-none mt-1 mr-0.5 select-none"
      aria-expanded={!collapsed}
      aria-label={collapsed ? `Expand ${lane.releaseName}` : `Collapse ${lane.releaseName}`}
      onClick={(e) => { e.stopPropagation(); onToggleCollapse(lane.releaseId); }}
      title={collapsed ? 'Expand release' : 'Collapse release'}
    >
      {collapsed ? '▸' : '▾'}
    </button>
  );

  return (
    <>
      {/* Lane background — highlight when drop target, dim when dragging */}
      <div
        className={`absolute left-0 transition-colors ${
          isDragging ? 'opacity-50 bg-blue-50/40 dark:bg-blue-900/20' :
          isDropTarget ? 'bg-blue-100/60' : ''
        }`}
        style={{ top: lane.y, width: totalWidth, height: lane.height }}
      />

      {/* Horizontal divider line at top of lane */}
      <div
        className={`absolute left-0 ${
          isDropTarget ? 'h-0.5 bg-blue-400' :
          isFirst ? 'h-px bg-blue-300' : 'h-px bg-blue-200'
        }`}
        style={{ top: lane.y, width: totalWidth }}
      />

      {/* ===== LEFT SIDE ===== */}

      {/* Left label area */}
      <div
        className="absolute flex items-start pt-2 px-2 pointer-events-none"
        style={{ top: lane.y, left: 0, width: LANE_LABEL_WIDTH, height: lane.height }}
      >
        {chevron}
        {leftEditing ? (
          <input
            ref={leftInputRef}
            name="releaseName"
            type="text"
            value={leftDraft}
            onChange={e => setLeftDraft(e.target.value)}
            onBlur={commitLeftEdit}
            onKeyDown={handleLeftKeyDown}
            onClick={e => e.stopPropagation()}
            className="pointer-events-auto text-xs font-semibold text-blue-700 dark:text-blue-300 bg-white/80 dark:bg-gray-800/80 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 w-full border-0"
          />
        ) : collapsed ? (
          <span
            className={`pointer-events-auto text-xs font-semibold px-1.5 py-0.5 rounded cursor-pointer flex items-baseline min-w-0 flex-1 ${labelClasses}`}
            data-release-id={lane.releaseId}
            onClick={handleLeftClick}
            onDoubleClick={handleLeftDoubleClick}
            title="Click for details · Double-click to rename"
          >
            <span className="truncate">{lane.releaseName}</span>
            <span className="flex-shrink-0 ml-1 font-normal opacity-70">({lane.cardCount ?? 0})</span>
          </span>
        ) : (
          <span
            className={`pointer-events-auto text-xs font-semibold px-2 py-1 rounded break-words max-w-full cursor-pointer ${labelClasses}`}
            data-release-id={lane.releaseId}
            onClick={handleLeftClick}
            onDoubleClick={handleLeftDoubleClick}
            title="Click for details · Double-click to rename"
          >
            {lane.releaseName}
          </span>
        )}
        {/* Drag grip */}
        {onReleaseDragStart && !leftEditing && !collapsed && (
          <span
            className="pointer-events-auto text-sm leading-none text-blue-300 hover:text-blue-500 dark:text-blue-600 dark:hover:text-blue-400 cursor-grab active:cursor-grabbing flex-shrink-0 mt-0.5 ml-1 select-none"
            onPointerDown={handleGripPointerDown}
            title="Drag to reorder"
          >
            ⠿
          </span>
        )}
      </div>

      {/* Left bottom buttons: + Release and × (hidden on collapsed lanes — no room) */}
      {!collapsed && onAddReleaseAfter && (
        <button
          className="absolute bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300 text-[10px] font-medium rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
          style={{ left: 8, top: bottomBtnY }}
          onClick={() => onAddReleaseAfter(lane.releaseId)}
          title="Add release after this one"
        >
          + Release
        </button>
      )}
      {!collapsed && onDeleteRelease && (
        <button
          ref={leftDeleteTriggerRef as React.Ref<HTMLButtonElement>}
          onMouseEnter={leftDeleteOnMouseEnter}
          onMouseLeave={leftDeleteOnMouseLeave}
          className={`absolute text-[10px] font-medium rounded px-1 py-0.5 transition-colors ${
            hasAllocations
              ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 cursor-pointer'
          }`}
          style={{ left: 72, top: bottomBtnY }}
          onClick={(e) => { e.stopPropagation(); if (!hasAllocations) onDeleteRelease(lane.releaseId); }}
        >
          ×
          {leftDeleteTooltipEl}
        </button>
      )}

      {/* ===== RIGHT SIDE ===== */}

      {/* Right label area */}
      <div
        className="absolute flex items-start pt-2 px-2 pointer-events-none"
        style={{ top: lane.y, left: rightLabelX, width: RIGHT_LABEL_WIDTH, height: lane.height }}
      >
        {chevron}
        {rightEditing ? (
          <input
            ref={rightInputRef}
            name="releaseName"
            type="text"
            value={rightDraft}
            onChange={e => setRightDraft(e.target.value)}
            onBlur={commitRightEdit}
            onKeyDown={handleRightKeyDown}
            onClick={e => e.stopPropagation()}
            className="pointer-events-auto text-xs font-semibold text-blue-700 dark:text-blue-300 bg-white/80 dark:bg-gray-800/80 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 w-full border-0"
          />
        ) : collapsed ? (
          <span
            className={`pointer-events-auto text-xs font-semibold px-1.5 py-0.5 rounded cursor-pointer flex items-baseline min-w-0 flex-1 ${labelClasses}`}
            data-release-id={lane.releaseId}
            onClick={handleRightClick}
            onDoubleClick={handleRightDoubleClick}
            title="Click for details · Double-click to rename"
          >
            <span className="truncate">{lane.releaseName}</span>
            <span className="flex-shrink-0 ml-1 font-normal opacity-70">({lane.cardCount ?? 0})</span>
          </span>
        ) : (
          <span
            className={`pointer-events-auto text-xs font-semibold px-2 py-1 rounded break-words max-w-full cursor-pointer ${labelClasses}`}
            data-release-id={lane.releaseId}
            onClick={handleRightClick}
            onDoubleClick={handleRightDoubleClick}
            title="Click for details · Double-click to rename"
          >
            {lane.releaseName}
          </span>
        )}
        {/* Drag grip */}
        {onReleaseDragStart && !rightEditing && !collapsed && (
          <span
            className="pointer-events-auto text-sm leading-none text-blue-300 hover:text-blue-500 dark:text-blue-600 dark:hover:text-blue-400 cursor-grab active:cursor-grabbing flex-shrink-0 mt-0.5 ml-1 select-none"
            onPointerDown={handleGripPointerDown}
            title="Drag to reorder"
          >
            ⠿
          </span>
        )}
      </div>

      {/* Right bottom buttons: + Release and × (hidden on collapsed lanes — no room) */}
      {!collapsed && onAddReleaseAfter && (
        <button
          className="absolute bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300 text-[10px] font-medium rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
          style={{ left: rightLabelX + 8, top: bottomBtnY }}
          onClick={() => onAddReleaseAfter(lane.releaseId)}
          title="Add release after this one"
        >
          + Release
        </button>
      )}
      {!collapsed && onDeleteRelease && (
        <button
          ref={rightDeleteTriggerRef as React.Ref<HTMLButtonElement>}
          onMouseEnter={rightDeleteOnMouseEnter}
          onMouseLeave={rightDeleteOnMouseLeave}
          className={`absolute text-[10px] font-medium rounded px-1 py-0.5 transition-colors ${
            hasAllocations
              ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 cursor-pointer'
          }`}
          style={{ left: rightLabelX + 72, top: bottomBtnY }}
          onClick={(e) => { e.stopPropagation(); if (!hasAllocations) onDeleteRelease(lane.releaseId); }}
        >
          ×
          {rightDeleteTooltipEl}
        </button>
      )}
    </>
  );
}
