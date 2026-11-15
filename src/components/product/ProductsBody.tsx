// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// What the Products page shows under its toolbar (v0.56.0): the notes, "Show archived (N)", then
// "Loading products...", the welcome panel, the all-archived line or the grid. Split out of
// ProductList so the page stays within the complexity bound (O28).

import { useId, type ComponentProps } from 'react';
import ProjectGrid from './ProjectGrid';
import ProjectsEmptyState from './ProjectsEmptyState';
import { AllArchivedLine, GridNote, ShowArchivedFilter } from './ArchiveControls';
import { SETTINGS_UNREAD_NOTICE, SETTINGS_UNREAD_REASON } from './archive-text';

type GridProps = ComponentProps<typeof ProjectGrid>;

interface ProductsBodyProps extends Omit<GridProps, 'dragDisabledReason'> {
  loading: boolean;
  /** R88: the first settings read failed. */
  settingsUnread: boolean;
  /** Listed products, archived ones included. */
  listedCount: number;
  archivedCount: number;
  showArchived: boolean;
  onShowArchived: (checked: boolean) => void;
  /** The cap's line (R-1), or null. */
  notice: string | null;
  onCreateNew: ComponentProps<typeof ProjectsEmptyState>['onCreateNew'];
  onLoadSample: () => void;
}

export default function ProductsBody({
  loading, settingsUnread, listedCount, archivedCount, showArchived, onShowArchived, notice, onCreateNew, onLoadSample,
  ...grid
}: ProductsBodyProps) {
  const filterId = useId();
  if (loading) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
        <p className="text-sm">Loading products...</p>
      </div>
    );
  }
  if (listedCount === 0) return <ProjectsEmptyState onCreateNew={onCreateNew} onLoadSample={onLoadSample} />;
  return (
    <>
      {settingsUnread && <GridNote text={SETTINGS_UNREAD_NOTICE} />}
      {notice && <GridNote text={notice} />}
      {archivedCount > 0 && (
        <ShowArchivedFilter id={filterId} count={archivedCount} checked={showArchived} onChange={onShowArchived} />
      )}
      {grid.projects.length === 0
        ? <AllArchivedLine count={archivedCount} />
        : <ProjectGrid {...grid} dragDisabledReason={settingsUnread ? SETTINGS_UNREAD_REASON : null} />}
    </>
  );
}
