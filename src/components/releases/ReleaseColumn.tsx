// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React from 'react';
import { useState } from 'react';
import RibCard from './RibCard';
import ConfirmDialog from '../ui/ConfirmDialog';
import ProgressBar from '../ui/ProgressBar';
import { useTooltip } from '../ui/Tooltip';
import useInlineEdit from '../storymap/useInlineEdit';
import { formatDate } from '../../lib/formatDate';
import type { Release, RibItem, Product } from '../../types';

interface RibWithBackbone extends RibItem {
  backboneName: string;
}

interface ColumnStats {
  totalPts: number;
  core: number;
  nonCore: number;
  percentComplete?: number;
}

interface DropTargetState {
  col: string;
  beforeRibId?: string;
}

interface ReleaseColumnProps {
  colId: string;
  release: Release | null;
  ribs: RibWithBackbone[];
  stats: ColumnStats;
  product: Product;
  dragRibId: string | null;
  dropTarget: DropTargetState | null;
  isColDropTarget: boolean;
  isColDragging: boolean;
  /**
   * Omitted by ReleasePlanningView for release columns while a COLUMN drag is
   * in flight — onColDragOver takes over in that case. The two are
   * complementary, so a guard here is defensive rather than reachable.
   */
  onColumnDragOver?: (e: React.DragEvent, colId: string) => void;
  onColumnDrop: (colId: string) => void;
  onColDragStart: (e: React.DragEvent, releaseId: string) => void;
  onColDragEnd: () => void;
  onColDragOver: ((e: React.DragEvent, releaseId: string) => void) | null;
  onColDrop: ((e: React.DragEvent) => void) | null;
  onCardDragStart: (ribId: string, colId: string) => void;
  onCardDragEnd: () => void;
  onCardDragOver: (e: React.DragEvent, colId: string, ribId: string) => void;
  onCardDrop: (colId: string) => void;
  onCardClick: (rib: RibWithBackbone) => void;
  onDeleteRelease?: (releaseId: string) => void;
  onRenameRelease?: (releaseId: string, newName: string) => void;
}

/**
 * A single column in the release planning board.
 * Handles both "unassigned" and named-release columns.
 */
export default function ReleaseColumn({
  colId,
  release,
  ribs,
  stats,
  product,
  dragRibId,
  dropTarget,
  isColDropTarget,
  isColDragging,
  onColumnDragOver,
  onColumnDrop,
  onColDragStart,
  onColDragEnd,
  onColDragOver,
  onColDrop,
  onCardDragStart,
  onCardDragEnd,
  onCardDragOver,
  onCardDrop,
  onCardClick,
  onDeleteRelease,
  onRenameRelease,
}: ReleaseColumnProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    editing: nameEditing, draft: nameDraft, setDraft: setNameDraft,
    inputRef: nameInputRef, startEditing: startNameEdit,
    commit: commitNameEdit, handleKeyDown: nameKeyDown,
  } = useInlineEdit(
    release?.name || '',
    (newName) => onRenameRelease?.(release.id, newName),
  );
  const hasItems = ribs.length > 0;
  const {
    triggerRef: deleteTriggerRef,
    onMouseEnter: deleteMouseEnter,
    onMouseLeave: deleteMouseLeave,
    tooltipEl: deleteTooltipEl,
  } = useTooltip<HTMLButtonElement>(
    hasItems ? 'Move all items out first' : release ? `Delete ${release.name}` : null
  );
  const isOver = dropTarget?.col === colId && dragRibId;
  const isUnassigned = !release;

  const cardList = ribs.map(rib => (
    <RibCard
      key={rib.id}
      rib={rib}
      product={product}
      allocation={release ? rib.releaseAllocations.find(a => a.releaseId === release.id) : undefined}
      isDragging={dragRibId === rib.id}
      isDropBefore={dropTarget?.col === colId && dropTarget?.beforeRibId === rib.id}
      onDragStart={() => onCardDragStart(rib.id, colId)}
      onDragEnd={onCardDragEnd}
      onDragOver={e => onCardDragOver(e, colId, rib.id)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); onCardDrop(colId); }}
      onClick={() => onCardClick(rib)}
    />
  ));

  if (isUnassigned) {
    return (
      <div
        className="flex-shrink-0 w-72"
        onDragOver={e => onColumnDragOver?.(e, 'unassigned')}
        onDrop={e => { e.preventDefault(); onColumnDrop('unassigned'); }}
      >
        <div className={`bg-amber-50 dark:bg-amber-900/20 border rounded-xl overflow-hidden transition-colors ${
          isOver ? 'border-amber-400 ring-2 ring-amber-200 dark:border-amber-500 dark:ring-amber-700' : 'border-amber-200 dark:border-amber-700'
        }`}>
          <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-700">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Unassigned</h3>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{ribs.length} items</p>
          </div>
          <div className="p-2 min-h-[60px] max-h-[calc(100vh-250px)] overflow-y-auto">
            {cardList}
            {ribs.length === 0 && !isOver && (
              <p className="text-xs text-amber-400 dark:text-amber-500 text-center py-4 italic">All items assigned</p>
            )}
            {isOver && ribs.length === 0 && (
              <div className="h-10 border-2 border-dashed border-amber-300 dark:border-amber-600 rounded-lg mx-1" />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-shrink-0 flex"
      onDragOver={e => {
        if (onColDragOver) onColDragOver(e, release.id);
        else onColumnDragOver?.(e, release.id);
      }}
      onDrop={e => {
        e.preventDefault();
        e.stopPropagation();
        if (onColDrop) onColDrop(e);
        else onColumnDrop(release.id);
      }}
    >
      {isColDropTarget && (
        <div className="w-1 bg-blue-400 rounded-full flex-shrink-0 mx-1 self-stretch" />
      )}
      <div className={`w-72 transition-opacity ${isColDragging ? 'opacity-40' : ''}`}>
        <div className={`bg-white dark:bg-gray-900 border rounded-xl overflow-hidden h-full transition-colors ${
          isOver ? 'border-blue-400 ring-2 ring-blue-200 dark:border-blue-500 dark:ring-blue-700' : 'border-gray-200 dark:border-gray-700'
        }`}>
          <div
            draggable={!nameEditing}
            onDragStart={e => { if (nameEditing) { e.preventDefault(); return; } onColDragStart(e, release.id); }}
            onDragEnd={onColDragEnd}
            className={`px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 ${nameEditing ? '' : 'cursor-grab active:cursor-grabbing'}`}
          >
            <div className="flex items-center justify-between">
              {nameEditing ? (
                <input
                  ref={nameInputRef}
                  name="releaseName"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onBlur={commitNameEdit}
                  onKeyDown={nameKeyDown}
                  className="text-sm font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border border-blue-400 dark:border-blue-500 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 w-48"
                />
              ) : (
                <h3
                  onDoubleClick={startNameEdit}
                  className="text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-text"
                  title="Double-click to rename"
                >{release.name}</h3>
              )}
              {onDeleteRelease && (
                <>
                  <button
                    ref={deleteTriggerRef}
                    onMouseEnter={deleteMouseEnter}
                    onMouseLeave={deleteMouseLeave}
                    onClick={e => { e.stopPropagation(); if (!hasItems) setConfirmDelete(true); }}
                    className={`text-xs px-1 py-0.5 rounded transition-colors ${
                      hasItems
                        ? 'text-gray-300 dark:text-gray-600'
                        : 'text-red-400 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400'
                    }`}
                  >
                    Delete
                  </button>
                  {deleteTooltipEl}
                </>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{stats.totalPts} pts</span>
              <span className="text-blue-600 dark:text-blue-400">{Math.round(stats.core)} core</span>
              <span className="text-gray-400 dark:text-gray-500">{Math.round(stats.nonCore)} non-core</span>
              <span>{ribs.length} items</span>
            </div>
            {stats.percentComplete !== undefined && (
              <div className="mt-1.5">
                <ProgressBar percent={stats.percentComplete} height="h-1.5" showLabel />
              </div>
            )}
            {release.targetDate && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Target: {formatDate(release.targetDate)}</p>
            )}
          </div>
          <div className="p-2 min-h-[60px] max-h-[calc(100vh-280px)] overflow-y-auto">
            {cardList}
            {ribs.length === 0 && !isOver && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 italic">
                Drag items here or click to assign
              </p>
            )}
            {isOver && ribs.length === 0 && (
              <div className="h-10 border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-lg mx-1" />
            )}
          </div>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${release.name}"?`}
          message="This release will be permanently removed."
          confirmLabel="Delete"
          onConfirm={() => { setConfirmDelete(false); onDeleteRelease(release.id); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
