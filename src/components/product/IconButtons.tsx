// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// A project tile's icon buttons and its drag grip (v0.55.0): SPERT Forecaster's shared
// components at 38f1a63 (`TrashIconButton`, `PencilIconButton`, `ExportIconButton`,
// `CloneIconButton`, `ShareIconButton`, `DragHandle`), which are GanttApp's. 28 px, an 18 px
// glyph at stroke 2.25, grey at rest and one hue each on hover and focus.

import type { ReactNode } from 'react';
import {
  ICON_BUTTON_BASE,
  ICON_GLYPH_SIZE,
  ICON_HUE_BLUE,
  ICON_HUE_CYAN,
  ICON_HUE_GREEN,
  ICON_HUE_RED,
  ICON_HUE_VIOLET,
  ICON_REST,
} from './button-styles';

interface IconButtonProps {
  onClick: () => void;
  ariaLabel: string;
  title: string;
  disabled?: boolean;
  /** The id of an element that says why the button is disabled (aria-describedby). */
  describedBy?: string;
}

function IconButton({ onClick, ariaLabel, title, disabled = false, describedBy, hue, children }: IconButtonProps & { hue: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      aria-describedby={describedBy}
      className={`${ICON_BUTTON_BASE} ${ICON_REST} ${hue}`}
    >
      <svg
        width={ICON_GLYPH_SIZE}
        height={ICON_GLYPH_SIZE}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

export function TrashIconButton(props: IconButtonProps) {
  return (
    <IconButton {...props} hue={ICON_HUE_RED}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
    </IconButton>
  );
}

export function PencilIconButton(props: IconButtonProps) {
  return (
    <IconButton {...props} hue={ICON_HUE_BLUE}>
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </IconButton>
  );
}

export function ExportIconButton(props: IconButtonProps) {
  return (
    <IconButton {...props} hue={ICON_HUE_GREEN}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </IconButton>
  );
}

export function CloneIconButton(props: IconButtonProps) {
  return (
    <IconButton {...props} hue={ICON_HUE_VIOLET}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </IconButton>
  );
}

export function ShareIconButton(props: IconButtonProps) {
  return (
    <IconButton {...props} hue={ICON_HUE_CYAN}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </IconButton>
  );
}

/** The six-dot grip. */
export function DragHandle() {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-[2px] cursor-grab active:cursor-grabbing">
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
      <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
    </div>
  );
}
