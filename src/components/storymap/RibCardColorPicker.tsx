// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  RIB_CARD_COLOR_KEYS,
  RIB_CARD_COLOR_SWATCH,
  RIB_CARD_COLOR_LABEL,
  type RibCardColorKey,
} from '../../lib/ribCardColors';

interface RibCardColorPickerProps {
  /** Pointer-coords of the swatch button (used to anchor the popover). */
  anchor: { x: number; y: number };
  /** Currently-selected color, or undefined for none. */
  current: RibCardColorKey | undefined;
  /** Apply a color (or undefined to clear). */
  onSelect: (color: RibCardColorKey | undefined) => void;
  /** Close without applying. */
  onClose: () => void;
}

/**
 * Floating popover for choosing a rib card's color flag.
 *
 * Rendered via createPortal at document.body so the popover isn't clipped
 * by the parent card's `overflow-hidden`. Positioned via `position: fixed`
 * anchored at the click coordinates. Closes on outside-click and on Escape.
 */
export default function RibCardColorPicker({ anchor, current, onSelect, onClose }: RibCardColorPickerProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    // Defer attaching so the click that opened the popover doesn't immediately close it.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp position so the popover stays inside the viewport.
  const POPOVER_WIDTH = 156;
  const POPOVER_HEIGHT = 60;
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - POPOVER_WIDTH - 8));
  const top = Math.max(8, Math.min(anchor.y, window.innerHeight - POPOVER_HEIGHT - 8));

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-1.5 flex items-center gap-1"
      style={{ left, top, width: POPOVER_WIDTH }}
      role="dialog"
      aria-label="Choose card color"
      // Stop clicks (incl. on the popover's padding/dead-space) from bubbling through the
      // React tree to the host card — which would otherwise open the Map detail panel or
      // the Sizing edit modal behind the picker. Outside-close uses mousedown, so this
      // click guard doesn't interfere with dismissal.
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`w-4 h-4 rounded-full border ${
          current === undefined
            ? 'border-blue-500 ring-2 ring-blue-300 dark:ring-blue-500/50'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-500 dark:hover:border-gray-400'
        } bg-white dark:bg-gray-900 relative flex items-center justify-center`}
        onClick={() => { onSelect(undefined); onClose(); }}
        title="Clear color"
        aria-label="Clear color"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 dark:text-gray-500" aria-hidden="true">
          <line x1="5" y1="5" x2="19" y2="19"></line>
        </svg>
      </button>
      {RIB_CARD_COLOR_KEYS.map(key => (
        <button
          key={key}
          type="button"
          className={`w-4 h-4 rounded-full border ${
            current === key
              ? 'border-blue-500 ring-2 ring-blue-300 dark:ring-blue-500/50'
              : 'border-gray-300 dark:border-gray-600 hover:scale-110'
          } ${RIB_CARD_COLOR_SWATCH[key]} transition-transform`}
          onClick={() => { onSelect(key); onClose(); }}
          title={RIB_CARD_COLOR_LABEL[key]}
          aria-label={`Set color to ${RIB_CARD_COLOR_LABEL[key]}`}
        />
      ))}
    </div>,
    document.body,
  );
}
