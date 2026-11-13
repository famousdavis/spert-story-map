// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type React from 'react';
import { DragHandle, PencilIconButton, TrashIconButton, ExportIconButton, CloneIconButton, ShareIconButton } from './IconButtons';
import {
  ABOVE_OPEN, ACTIONS, BADGE, GRIP, META, META_WARN, NAME, NAME_COLOR, NAME_ROW, OPEN, REVEAL,
  TILE, TILE_BG, TILE_BORDER, TILE_DROP, TILE_HOVER,
} from './dashboard-styles';
import { itemsLine, plansLine, warningLine, type TileFigures } from './tile-meta';

/** Why Delete is disabled for anyone but the owner (SPERT Forecaster's `OWNER_ONLY_DELETE_REASON`). */
export const OWNER_ONLY_DELETE_REASON =
  "Only the project's owner can delete it. To remove it from your list, ask the owner to stop sharing it with you.";
/** Why Edit is disabled for a viewer, or an access this page cannot name (Forecaster's `VIEW_ONLY_REASON`). */
export const VIEW_ONLY_REASON = 'View only — this project is shared with you as a viewer.';

export interface TileProject extends TileFigures {
  id: string;
  name: string;
}

interface ProjectTileProps {
  project: TileProject;
  /** `useId()` plus the tile's index: a project id may hold a space, and describedby is a space-separated list. */
  idBase: string;
  isShared: boolean;
  canEdit: boolean;
  canDelete: boolean;
  showShare: boolean;
  isDragged: boolean;
  isDropTarget: boolean;
  onOpen: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onShare: () => void;
  onExport: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  onGripDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

/**
 * One project's tile (v0.55.0, GanttApp's and Forecaster's anatomy): the grip, the name, the
 * "Shared" badge and Delete in the first row; Story Map's figures on two or three lines; then the
 * revealed row, Share (cloud owner) · Export · Edit · Clone.
 *
 * ⚠️ The whole tile opens the project through the open button's `::after`, which covers the tile.
 * There is deliberately NO click handler on the tile root: every icon's click would bubble into it
 * and open the project, Delete's included, and no jsdom test could see it.
 */
export default function ProjectTile({
  project: p, idBase, isShared, canEdit, canDelete, showShare, isDragged, isDropTarget,
  onOpen, onShare, onExport, onEdit, onClone, onDelete,
  onGripDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}: ProjectTileProps) {
  const warning = warningLine(p);
  const lines = [itemsLine(p), plansLine(p)];
  const lineIds = [...lines, warning].filter(l => l !== null).map((_, n) => `${idBase}-meta-${n}`);
  const deleteReasonId = `${idBase}-delete`;
  const editReasonId = `${idBase}-edit`;
  // The drop box REPLACES the border colour and its hover: a `dark:border-*` left beside it would win.
  const border = isDropTarget ? TILE_DROP : `${TILE_BORDER} ${TILE_HOVER}`;
  return (
    <li
      data-tile="true"
      data-project-id={p.id}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`${TILE} ${TILE_BG} ${border}${isDragged ? ' opacity-50' : ''}`}
    >
      <div className={NAME_ROW}>
        {/* The only draggable element: reordering is by dragging the grip. */}
        <span
          draggable
          title="Drag to reorder"
          aria-hidden="true"
          className={GRIP}
          onDragStart={onGripDragStart}
          onDragEnd={onDragEnd}
        >
          <DragHandle />
        </span>
        <h3 className={`${NAME} ${NAME_COLOR}`}>
          <button
            type="button"
            className={OPEN}
            onClick={onOpen}
            title="Open Structure"
            aria-label={`Open Structure for ${p.name}${isShared ? ' (Shared)' : ''}`}
            aria-describedby={lineIds.join(' ')}
          >
            {p.name}
          </button>
        </h3>
        {isShared && <span className={BADGE}>Shared</span>}
        <span className={`${ABOVE_OPEN} inline-flex flex-none`}>
          {!canDelete && <span id={deleteReasonId} className="sr-only">{OWNER_ONLY_DELETE_REASON}</span>}
          <TrashIconButton
            onClick={onDelete}
            ariaLabel={`Delete ${p.name}`}
            title={canDelete ? 'Delete project' : OWNER_ONLY_DELETE_REASON}
            disabled={!canDelete}
            describedBy={canDelete ? undefined : deleteReasonId}
          />
        </span>
      </div>
      {lines.map((line, n) => (
        <p key={n} id={lineIds[n]} className={META}>{line}</p>
      ))}
      {warning !== null && (
        <p id={lineIds[2]} className={META_WARN}>
          <span aria-hidden="true">⚠ </span>{warning}
        </p>
      )}
      <div className={ACTIONS}>
        <div className={`${REVEAL} ${ABOVE_OPEN}`}>
          {showShare && <ShareIconButton onClick={onShare} ariaLabel="Share project" title="Share project" />}
          <ExportIconButton onClick={onExport} ariaLabel={`Export ${p.name}`} title="Export project" />
          {!canEdit && <span id={editReasonId} className="sr-only">{VIEW_ONLY_REASON}</span>}
          <PencilIconButton
            onClick={onEdit}
            ariaLabel={`Edit ${p.name}`}
            title={canEdit ? 'Edit project' : VIEW_ONLY_REASON}
            disabled={!canEdit}
            describedBy={canEdit ? undefined : editReasonId}
          />
          <CloneIconButton onClick={onClone} ariaLabel={`Clone ${p.name}`} title="Clone project" />
        </div>
      </div>
    </li>
  );
}
