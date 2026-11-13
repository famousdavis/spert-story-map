// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The Projects dashboard's grid of tiles (v0.55.0): one column, two from 560 px of the grid's own
// width, three from 860. Reordering is by dragging a tile's grip onto another tile, and the
// dragged project takes that tile's place, in both directions: a box drawn round a whole tile
// promises "this project will go here" (SPERT Forecaster's
// `src/features/projects/components/ProjectList.tsx:118-148` at 38f1a63).
// The order arithmetic is the page's (`moveOnto`); this component reports which tile was dropped
// on which.

import { useId, useState } from 'react';
import type React from 'react';
import ProjectTile, { type TileProject } from './ProjectTile';
import { GRID, GRID_AREA } from './dashboard-styles';

export interface GridProject extends TileProject {
  isShared: boolean;
  canEdit: boolean;
  canDelete: boolean;
  showShare: boolean;
}

interface ProjectGridProps {
  projects: GridProject[];
  onOpen: (id: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  onShare: (id: string) => void;
  onExport: (id: string) => void;
  onEdit: (id: string) => void;
  onClone: (id: string) => void;
  onDelete: (id: string) => void;
  /** The project `draggedId` was dropped on the tile of `targetId` (never the same id). */
  onMove: (draggedId: string, targetId: string) => void;
}

export default function ProjectGrid({ projects, onOpen, onShare, onExport, onEdit, onClone, onDelete, onMove }: ProjectGridProps) {
  // Ids for each tile's descriptions, by tile index: a project id may hold a space, and
  // aria-describedby is a space-separated list.
  const idBase = useId();
  // By id, not by index: a refresh can arrive mid-drag (an invitation claimed in the cloud).
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const endDrag = () => {
    setDraggedId(null);
    setOverId(null);
  };

  const handleGripDragStart = (e: React.DragEvent, id: string, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    // Firefox starts no drag without data. The index, not the id: a drop on another page's text
    // field would otherwise type the project's id there.
    e.dataTransfer.setData('text/plain', String(index));
    // The whole tile as the drag image, found through `data-tile`, not just the small grip.
    let el: HTMLElement | null = e.currentTarget as HTMLElement;
    while (el && !el.dataset.tile) el = el.parentElement;
    if (el) e.dataTransfer.setDragImage(el, 12, el.getBoundingClientRect().height / 2);
    setDraggedId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const dragged = draggedId;
    endDrag();
    if (dragged !== null && dragged !== targetId) onMove(dragged, targetId);
  };

  return (
    <div className={GRID_AREA}>
      <ul className={GRID} aria-label="Projects">
        {projects.map((p, index) => (
          <ProjectTile
            key={p.id}
            project={p}
            idBase={`${idBase}-${index}`}
            isShared={p.isShared}
            canEdit={p.canEdit}
            canDelete={p.canDelete}
            showShare={p.showShare}
            isDragged={draggedId === p.id}
            isDropTarget={overId === p.id}
            onOpen={e => onOpen(p.id, e)}
            onShare={() => onShare(p.id)}
            onExport={() => onExport(p.id)}
            onEdit={() => onEdit(p.id)}
            onClone={() => onClone(p.id)}
            onDelete={() => onDelete(p.id)}
            onGripDragStart={e => handleGripDragStart(e, p.id, index)}
            onDragEnd={endDrag}
            onDragOver={e => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOverId(p.id);
            }}
            onDragLeave={() => setOverId(null)}
            onDrop={e => handleDrop(e, p.id)}
          />
        ))}
      </ul>
    </div>
  );
}
