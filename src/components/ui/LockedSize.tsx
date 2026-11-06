// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Size } from '../../types';

interface LockedSizeProps {
  size: Size;
  /** Why the size cannot change. Read it from `ribSizeLockNote` or `sizeLockNote`. */
  note: string;
  /** For a narrow column: a padlock stands in for the word. */
  compact?: boolean;
}

/** A size that cannot change, shown where a picker would otherwise be. */
export default function LockedSize({ size, note, compact = false }: LockedSizeProps) {
  return (
    <span
      title={note}
      className={`inline-flex items-center text-xs font-medium rounded border border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 ${
        compact ? 'gap-0.5 px-0.5 py-0.5' : 'px-2 py-1'
      }`}
    >
      {size || '—'}
      {compact ? (
        <>
          <svg aria-hidden="true" className="w-2.5 h-2.5 flex-shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="sr-only">locked</span>
        </>
      ) : (
        <span className="ml-1.5 text-[10px] opacity-70">locked</span>
      )}
    </span>
  );
}
