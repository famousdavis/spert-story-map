// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// "Show archived (N)", the all-archived line and the notes above the grid (v0.56.0): SPERT
// Forecaster's `ArchiveControls.tsx` at 09c4cda, which are GanttApp's. Archive and Unarchive speak
// through ProductList's own live region, not one of their own (R-3).

import { useId } from 'react';
import { ALL_ARCHIVED, CHECK, CHECKBOX, NOTE } from './dashboard-styles';
import { allArchivedLine } from './archive-text';

/**
 * Directly under the heading row, above the import banner and every note, as Forecaster's
 * ProjectsTab places it: 12 px below the row (`-mt-1` against the row's `mb-4`) and 16 px above
 * what follows (GanttApp's `.pt-filter`). The caller renders it only while a listed product is
 * archived.
 */
export function ShowArchivedFilter({ count, checked, onChange }: {
  count: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="-mt-1 mb-4 leading-[normal]">
      <label className={CHECK} htmlFor={id}>
        <input
          type="checkbox"
          id={id}
          name="showArchived"
          className={CHECKBOX}
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        Show archived ({count})
      </label>
    </div>
  );
}

/** Every listed product archived and the box off: GanttApp's line, where the grid would be. */
export function AllArchivedLine({ count }: { count: number }) {
  return <p className={ALL_ARCHIVED}>{allArchivedLine(count)}</p>;
}

/** A one-line note above the grid: R88's, or the cap's. */
export function GridNote({ text }: { text: string }) {
  return <p className={NOTE}>{text}</p>;
}
