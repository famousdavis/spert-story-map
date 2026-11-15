// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// What the Products page shows under its notes (v0.56.0): "Loading products...", the welcome panel,
// or the notes above the grid and then the all-archived line or the grid. "Show archived (N)" sits
// higher, directly under the heading row (ProductList). Split out of ProductList so the page stays
// within the complexity bound (O28).

import type { ComponentProps } from 'react';
import ProjectGrid from './ProjectGrid';
import ProjectsEmptyState from './ProjectsEmptyState';
import { AllArchivedLine, GridNote } from './ArchiveControls';
import { SETTINGS_UNREAD_NOTICE, SETTINGS_UNREAD_REASON } from './archive-text';

type GridProps = ComponentProps<typeof ProjectGrid>;

interface ProductsBodyProps extends Omit<GridProps, 'dragDisabledReason'> {
  loading: boolean;
  /** R88: the first settings read failed. */
  settingsUnread: boolean;
  /** Listed products, archived ones included. */
  listedCount: number;
  archivedCount: number;
  /** The cap's line (R-1), or null. */
  notice: string | null;
  onCreateNew: ComponentProps<typeof ProjectsEmptyState>['onCreateNew'];
  onLoadSample: () => void;
}

export default function ProductsBody({
  loading, settingsUnread, listedCount, archivedCount, notice, onCreateNew, onLoadSample,
  ...grid
}: ProductsBodyProps) {
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
      {grid.projects.length === 0
        ? <AllArchivedLine count={archivedCount} />
        : <ProjectGrid {...grid} dragDisabledReason={settingsUnread ? SETTINGS_UNREAD_REASON : null} />}
    </>
  );
}
