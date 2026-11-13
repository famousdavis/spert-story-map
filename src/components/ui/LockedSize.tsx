// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Size, SizeMapping } from '../../types';
import { lockedMissingNote, missingSizeLabel } from '../../lib/missingSize';

interface LockedSizeProps {
  size: Size;
  /** Why the size cannot change. Read it from `ribSizeLockNote` or `sizeLockNote`. */
  note: string;
  /**
   * The project's size list. Required, never defaulted: a size it does not hold shows as no
   * size and is named, so a caller passing no list would misname every size.
   */
  sizeMapping: SizeMapping[];
  /** For a narrow column: a padlock stands in for the word. */
  compact?: boolean;
}

/**
 * A size that cannot change, shown where a picker would otherwise be. A label the size list
 * no longer holds shows as no size, with a sentence naming it: visible under the chip in the
 * full form, and in the tooltip and the screen-reader text in the compact one.
 */
export default function LockedSize({ size, note, sizeMapping, compact = false }: LockedSizeProps) {
  const missing = missingSizeLabel(size, sizeMapping);
  const missingNote = missing ? lockedMissingNote(missing, sizeMapping) : null;
  const chip = (
    <span
      // The lock note has no full stop of its own, so ". " joins it to the sentence.
      title={compact && missingNote ? `${note}. ${missingNote}` : note}
      className={`inline-flex items-center text-xs font-medium rounded border border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 ${
        compact ? 'gap-0.5 px-0.5 py-0.5' : 'px-2 py-1'
      }`}
    >
      {missing ? '—' : (size || '—')}
      {compact ? (
        <>
          <svg aria-hidden="true" className="w-2.5 h-2.5 flex-shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="sr-only">{missingNote ? `locked. ${missingNote}` : 'locked'}</span>
        </>
      ) : (
        <span className="ml-1.5 text-[10px] opacity-70">locked</span>
      )}
    </span>
  );
  if (compact || !missingNote) return chip;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {chip}
      <span className="text-xs text-amber-700 dark:text-amber-400">{missingNote}</span>
    </span>
  );
}
