// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import {
  RIB_CARD_COLOR_KEYS,
  RIB_CARD_COLOR_SWATCH,
  RIB_CARD_COLOR_LABEL,
  type RibCardColorKey,
} from '../../lib/ribCardColors';

interface CardColorSwatchRowProps {
  /** Currently-selected color, or undefined for none. */
  current: RibCardColorKey | undefined;
  /** Apply a color (or undefined to clear). */
  onSelect: (color: RibCardColorKey | undefined) => void;
  /** Extra classes for the row container. */
  className?: string;
}

/**
 * A horizontal row of card-color swatches: a "clear" (no color) button followed
 * by one button per palette color, with the active choice ringed in blue.
 *
 * Purely presentational — the caller owns what happens on select (e.g. the
 * floating picker closes its popover, the modal stages form state). Shared by
 * RibCardColorPicker (Map/Sizing card popover) and the Card Color field in
 * SizingRibModal so the swatch styling lives in exactly one place.
 */
export default function CardColorSwatchRow({ current, onSelect, className = '' }: CardColorSwatchRowProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        className={`w-4 h-4 rounded-full border ${
          current === undefined
            ? 'border-blue-500 ring-2 ring-blue-300 dark:ring-blue-500/50'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-500 dark:hover:border-gray-400'
        } bg-white dark:bg-gray-900 relative flex items-center justify-center`}
        onClick={() => onSelect(undefined)}
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
          onClick={() => onSelect(key)}
          title={RIB_CARD_COLOR_LABEL[key]}
          aria-label={`Set color to ${RIB_CARD_COLOR_LABEL[key]}`}
        />
      ))}
    </div>
  );
}
