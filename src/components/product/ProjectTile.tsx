// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useRef } from 'react';
import type React from 'react';
import { DragHandle, PencilIconButton, TrashIconButton, ExportIconButton, CloneIconButton, ShareIconButton, ArchiveIconButton } from './IconButtons';
import {
  ABOVE_OPEN, ACTIONS, BADGE, GRIP, META, META_WARN, NAME, NAME_ARCHIVED, NAME_COLOR, NAME_ROW, OPEN, REVEAL, STAY,
  TILE, TILE_ARCHIVED_BORDER, TILE_BORDER, TILE_DROP, TILE_HOVER,
} from './dashboard-styles';
import { TILE_TINT, TILE_TINT_ARCHIVED } from './tile-color-styles';
import { TileColorButton, TileColorPopover } from './ProjectColorControl';
import { itemsLine, plansLine, warningLine, type TileFigures } from './tile-meta';
import type { TileColor } from '../../lib/projectPrefs';

/** Why Delete is disabled for anyone but the owner (SPERT Forecaster's `OWNER_ONLY_DELETE_REASON`). */
export const OWNER_ONLY_DELETE_REASON =
  "Only the owner can delete it. To remove it from your list, ask the owner to stop sharing it with you.";
/** Why Edit is disabled for a viewer, or an access this page cannot name (Forecaster's `VIEW_ONLY_REASON`). */
export const VIEW_ONLY_REASON = 'View only — this product is shared with you as a viewer.';

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
  /** This person's tile colour (v0.56.0); undefined for none. */
  color: TileColor | undefined;
  /** Archived by this person (v0.56.0): Forecaster's archived look, Unarchive always shown. */
  archived: boolean;
  colorOpen: boolean;
  onColorOpenChange: (open: boolean) => void;
  /** Applies a colour; false when refused, and the popover puts its radio back. */
  onPickColor: (color: TileColor | null) => boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  /** Why Tile color and Archive are off (R88, a refused id), or null. */
  prefsDisabledReason: string | null;
  /** Why the grip cannot reorder (R88), or null. */
  dragDisabledReason: string | null;
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
 * "Shared" and "Archived" badges and Delete in the first row; Story Map's figures on two or three
 * lines; then the revealed row, Share (cloud owner) · Export · Edit · Clone · Archive · Tile color
 * (v0.56.0, every role: they change only this person's settings). An archived tile has half the
 * tint, a dashed border, a grey name, and Unarchive in a group that is always shown.
 *
 * ⚠️ The whole tile opens the project through the open button's `::after`, which covers the tile.
 * There is deliberately NO click handler on the tile root: every icon's click would bubble into it
 * and open the project, Delete's included, and no jsdom test could see it.
 */
export default function ProjectTile({
  project: p, idBase, isShared, canEdit, canDelete, showShare, isDragged, isDropTarget,
  color, archived, colorOpen, onColorOpenChange, onPickColor, onArchive, onUnarchive, prefsDisabledReason, dragDisabledReason,
  onOpen, onShare, onExport, onEdit, onClone, onDelete,
  onGripDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}: ProjectTileProps) {
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const warning = warningLine(p);
  const lines = [itemsLine(p), plansLine(p)];
  const lineIds = [...lines, warning].filter(l => l !== null).map((_, n) => `${idBase}-meta-${n}`);
  const deleteReasonId = `${idBase}-delete`;
  const editReasonId = `${idBase}-edit`;
  const prefsReasonId = `${idBase}-prefs`;
  // The drop box REPLACES the border colour and its hover, and the archived dashes: a
  // `dark:border-*` or `border-dashed` left beside it would win.
  const border = isDropTarget ? TILE_DROP : `${archived ? TILE_ARCHIVED_BORDER : TILE_BORDER} ${TILE_HOVER}`;
  const tint = (archived ? TILE_TINT_ARCHIVED : TILE_TINT)[color ?? 'none'];
  return (
    <li
      data-tile="true"
      data-project-id={p.id}
      data-color={color ?? 'none'}
      data-archived={archived ? 'true' : undefined}
      // Keeps the revealed row shown while the popover is open, whatever has focus or the pointer.
      data-popopen={colorOpen ? 'true' : undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`${TILE} ${tint} ${border}${isDragged ? ' opacity-50' : ''}`}
    >
      <div className={NAME_ROW}>
        {/* The only draggable element: reordering is by dragging the grip. */}
        <span
          draggable={dragDisabledReason === null}
          title={dragDisabledReason ?? 'Drag to reorder'}
          aria-hidden="true"
          className={GRIP}
          onDragStart={onGripDragStart}
          onDragEnd={onDragEnd}
        >
          <DragHandle />
        </span>
        <h3 className={`${NAME} ${archived ? NAME_ARCHIVED : NAME_COLOR}`}>
          <button
            type="button"
            className={OPEN}
            onClick={onOpen}
            title={archived ? 'Unarchive and open Structure' : 'Open Structure'}
            aria-label={`${archived ? 'Unarchive and open' : 'Open'} Structure for ${p.name}${isShared ? ' (Shared)' : ''}`}
            aria-describedby={lineIds.join(' ')}
          >
            {p.name}
          </button>
        </h3>
        {isShared && <span className={BADGE}>Shared</span>}
        {archived && <span className={BADGE}>Archived</span>}
        <span className={`${ABOVE_OPEN} inline-flex flex-none`}>
          {!canDelete && <span id={deleteReasonId} className="sr-only">{OWNER_ONLY_DELETE_REASON}</span>}
          <TrashIconButton
            onClick={onDelete}
            ariaLabel={`Delete ${p.name}`}
            title={canDelete ? 'Delete product' : OWNER_ONLY_DELETE_REASON}
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
          {showShare && <ShareIconButton onClick={onShare} ariaLabel={`Share ${p.name}`} title="Share product" />}
          <ExportIconButton onClick={onExport} ariaLabel={`Export ${p.name}`} title="Export product" />
          {!canEdit && <span id={editReasonId} className="sr-only">{VIEW_ONLY_REASON}</span>}
          <PencilIconButton
            onClick={onEdit}
            ariaLabel={`Edit ${p.name}`}
            title={canEdit ? 'Edit product' : VIEW_ONLY_REASON}
            disabled={!canEdit}
            describedBy={canEdit ? undefined : editReasonId}
          />
          <CloneIconButton onClick={onClone} ariaLabel={`Clone ${p.name}`} title="Clone product" />
          <ArchiveButton name={p.name} archived={archived} onArchive={onArchive} reason={prefsDisabledReason} reasonId={prefsReasonId} />
          <TileColorButton
            projectName={p.name}
            color={color}
            open={colorOpen}
            buttonRef={colorButtonRef}
            onOpenChange={onColorOpenChange}
            disabledReason={prefsDisabledReason}
            reasonId={prefsReasonId}
          />
        </div>
        {/* Beside the row, not inside it: the tile is the popover's containing block (Forecaster's). */}
        {colorOpen && (
          <TileColorPopover color={color} buttonRef={colorButtonRef} onPick={onPickColor} onOpenChange={onColorOpenChange} />
        )}
        {archived && (
          // ABOVE_OPEN: without it a click on Unarchive lands on the open button's ::after.
          <div className={`${STAY} ${ABOVE_OPEN}`}>
            <ArchiveIconButton variant="unarchive" onClick={onUnarchive} ariaLabel={`Unarchive ${p.name}`} title="Unarchive product" />
          </div>
        )}
      </div>
    </li>
  );
}

/** Archive, in the revealed row, on a tile that is not archived; off with its reason (R88, a refused id). */
function ArchiveButton({ name, archived, onArchive, reason, reasonId }: {
  name: string; archived: boolean; onArchive: () => void; reason: string | null; reasonId: string;
}) {
  return (
    <>
      {reason !== null && <span id={reasonId} className="sr-only">{reason}</span>}
      {!archived && (
        <ArchiveIconButton
          variant="archive"
          onClick={onArchive}
          ariaLabel={`Archive ${name}`}
          title={reason ?? 'Archive product'}
          disabled={reason !== null}
          describedBy={reason !== null ? reasonId : undefined}
        />
      )}
    </>
  );
}
