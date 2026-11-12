// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useRef } from 'react';
import { DRAG_THRESHOLD } from './useMapDrag';
import { entityKey, nameTitle } from './mapEntity';
import type { MapEntityTarget } from './mapEntity';

/** What a header needs from the map to open its panel. */
export interface HeaderNameHandlers {
  /** A single click on the name: arms the 200 ms pending open. */
  onNameClick?: (target: MapEntityTarget, anchor: HTMLElement) => void;
  /** A double click on the name: cancels the pending open before the rename starts. */
  onNameDoubleClick?: () => void;
}

interface Props extends HeaderNameHandlers {
  target: MapEntityTarget;
  description: string;
  editing: boolean;
  startEditing: (e?: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * The name area of a theme or backbone header: the name (or its rename input) and the
 * description glyph, in one `min-w-0 flex-1` wrapper that owns the click and the double
 * click. A click whose pointer travelled more than `DRAG_THRESHOLD` since its press arms
 * nothing. Its `title` carries the start of the description.
 */
export default function HeaderName({ target, description, editing, startEditing, onNameClick, onNameDoubleClick, className = '', children }: Props) {
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    pressedAt.current = { x: e.clientX, y: e.clientY };
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const from = pressedAt.current;
    pressedAt.current = null;
    if (editing || !onNameClick) return;
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > DRAG_THRESHOLD) return;
    onNameClick(target, e.currentTarget);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    onNameDoubleClick?.();
    startEditing(e);
  };

  return (
    <div
      className={`min-w-0 flex-1 flex items-center gap-1 cursor-pointer ${className}`}
      data-map-name={entityKey(target)}
      title={editing ? undefined : nameTitle(description)}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {children}
      {!editing && description.trim() !== '' && <DescriptionGlyph />}
    </div>
  );
}

/** Marks a name that has a description. */
function DescriptionGlyph() {
  return (
    <svg
      className="w-3 h-3 flex-shrink-0 opacity-70"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      role="img"
      aria-label="Has a description"
    >
      <path d="M2 3h8M2 6h8M2 9h5" />
    </svg>
  );
}
