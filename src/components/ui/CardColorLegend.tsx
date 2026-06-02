// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo, useId } from 'react';
import { forEachRib } from '../../lib/ribHelpers';
import { useSessionState } from '../../hooks/useSessionState';
import { useBufferedField } from '../../hooks/useBufferedField';
import { CARD_COLOR_LABEL_MAX } from '../../lib/constants';
import {
  RIB_CARD_COLOR_KEYS,
  RIB_CARD_COLOR_SWATCH,
  RIB_CARD_COLOR_LABEL,
  type RibCardColorKey,
} from '../../lib/ribCardColors';
import type { Product } from '../../types';

interface CardColorLegendProps {
  product: Product;
  /** Commit a label for a color key (empty string clears it). */
  onLabelChange: (colorKey: string, label: string) => void;
}

/**
 * Floating, collapsible legend for the per-card color flags. Shared by the Map
 * and Sizing tabs — both read labels from `product.cardColorLabels`, so editing
 * a label on one tab is reflected on the other.
 *
 * Only colors actually applied to at least one card are listed, so the legend
 * is invisible until the user starts color-coding and grows/shrinks with use.
 * Rendered as a sibling of the canvas (not a child), so it floats fixed in the
 * bottom-right corner instead of panning/zooming with the map.
 */
export default function CardColorLegend({ product, onLabelChange }: CardColorLegendProps) {
  // Open/collapsed state persists across in-app navigation, per product.
  const [open, setOpen] = useSessionState<boolean>(`legend-open:${product.id}`, true);

  // Colors in use, in palette order. Recomputed whenever the product changes.
  const usedColors = useMemo<RibCardColorKey[]>(() => {
    const inUse = new Set<string>();
    forEachRib(product, rib => {
      if (rib.cardColor) inUse.add(rib.cardColor);
    });
    return RIB_CARD_COLOR_KEYS.filter(k => inUse.has(k));
  }, [product]);

  // Nothing color-coded yet → render nothing at all.
  if (usedColors.length === 0) return null;

  const labels = product.cardColorLabels ?? {};

  return (
    <div className="absolute bottom-3 right-3 z-30 pointer-events-auto">
      {open ? (
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg shadow-md w-56">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide select-none">
              Legend
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-sm leading-none"
              title="Collapse legend"
              aria-label="Collapse legend"
            >
              &times;
            </button>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {usedColors.map(key => (
              <LegendRow
                key={key}
                colorKey={key}
                label={labels[key] ?? ''}
                onCommit={v => onLabelChange(key, v)}
              />
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg shadow-md px-2.5 py-1.5"
          title="Show color legend"
          aria-label="Show color legend"
        >
          <span className="flex items-center -space-x-1">
            {usedColors.slice(0, 4).map(key => (
              <span
                key={key}
                className={`w-3 h-3 rounded-full ring-1 ring-white dark:ring-gray-900 ${RIB_CARD_COLOR_SWATCH[key]}`}
              />
            ))}
          </span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 select-none">
            Legend
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * One color row: the swatch dot doubles as the field's label (via htmlFor), and
 * the input edits the meaning. Buffered so cloud-echo syncs don't scramble typing.
 */
function LegendRow({
  colorKey,
  label,
  onCommit,
}: {
  colorKey: RibCardColorKey;
  label: string;
  onCommit: (v: string) => void;
}) {
  const inputId = useId();
  const { localValue, setLocalValue, handleFocus, handleBlur, revertValue } =
    useBufferedField(label, onCommit);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={inputId} className="shrink-0 cursor-text" aria-hidden="true">
        <span className={`block w-3.5 h-3.5 rounded-full ${RIB_CARD_COLOR_SWATCH[colorKey]}`} />
      </label>
      <input
        id={inputId}
        name={`legend-label-${colorKey}`}
        type="text"
        autoComplete="off"
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            revertValue();
            e.currentTarget.blur();
          }
        }}
        maxLength={CARD_COLOR_LABEL_MAX}
        placeholder={RIB_CARD_COLOR_LABEL[colorKey]}
        aria-label={`Label for ${RIB_CARD_COLOR_LABEL[colorKey]} cards`}
        className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 dark:hover:border-gray-700 dark:focus:border-blue-500 text-xs text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none py-0.5"
      />
    </div>
  );
}
