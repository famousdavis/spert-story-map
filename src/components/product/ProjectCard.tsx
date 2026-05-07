// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React from 'react';
import { parseDate } from '../../lib/formatDate';

interface ProjectSummary {
  name: string;
  totalItems: number;
  totalPoints: number;
  unsized: number;
  pctComplete: number;
  updatedAt: string;
}

interface ProjectCardProps {
  product: ProjectSummary;
  isShared: boolean;
  isOwner: boolean;
  isCloudMode: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onNavigate: () => void;
  onShare: () => void;
  onExport: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
}

export default function ProjectCard({
  product: p,
  isShared,
  isOwner,
  isCloudMode,
  isDragging,
  isDropTarget,
  onNavigate,
  onShare,
  onExport,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ProjectCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`bg-white dark:bg-gray-900 border rounded-xl p-5 transition-colors group ${
        isDragging
          ? 'opacity-40 border-gray-300 dark:border-gray-600'
          : isDropTarget
            ? 'border-blue-400 dark:border-blue-500 border-t-2'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between">
        <span
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-500 mr-3 mt-0.5 select-none"
          title="Drag to reorder"
        >⠿</span>
        <button
          onClick={onNavigate}
          className="text-left flex-1"
        >
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {p.name}
            {isShared && (
              <span className="ml-2 inline-block text-[10px] font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded-full align-middle">
                Shared
              </span>
            )}
          </h3>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span>{p.totalItems} {p.totalItems === 1 ? 'item' : 'items'}</span>
            <span>{p.totalPoints} pts</span>
            {p.unsized > 0 && (
              <span className="text-amber-600 dark:text-amber-400">{p.unsized} unsized</span>
            )}
            <span>{Math.round(p.pctComplete)}% complete</span>
            <span>Updated {(parseDate(p.updatedAt) || new Date()).toLocaleDateString()}</span>
          </div>
        </button>
        <div className="flex items-center gap-1">
          {isCloudMode && isOwner && (
            <button
              onClick={onShare}
              className="p-1.5 rounded text-gray-400 transition-colors hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/20"
              title="Share"
              aria-label="Share project"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
              </svg>
            </button>
          )}
          <button
            onClick={onExport}
            className="p-1.5 rounded text-gray-400 transition-colors hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-900/20"
            title="Export as JSON"
            aria-label="Export as JSON"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 rounded text-gray-400 transition-colors hover:text-violet-600 hover:bg-violet-50 dark:hover:text-violet-400 dark:hover:bg-violet-900/20"
            title="Duplicate"
            aria-label="Duplicate project"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-gray-400 transition-colors hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20"
            title="Delete"
            aria-label="Delete project"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
