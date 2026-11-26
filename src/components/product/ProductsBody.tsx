// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// What the Products page shows under its notes (v0.56.0): "Loading products...", the welcome panel,
// or the all-archived line or the grid. "Show archived (N)" and the status lines (R88's, the cap's)
// sit higher, in the frame's filter row under the heading row (ProductList, v0.57.0). Split out of
// ProductList so the page stays within the complexity bound (O28).
//
// In the frame (FRAME26, v0.57.0), the welcome panel and the all-archived line stand in for the tile
// grid, so each carries `data-sf="empty"` (contract §7).

import type { ComponentProps } from 'react';
import ProjectGrid from './ProjectGrid';
import ProjectsEmptyState from './ProjectsEmptyState';
import { AllArchivedLine } from './ArchiveControls';
import { SETTINGS_UNREAD_REASON } from './archive-text';

type GridProps = ComponentProps<typeof ProjectGrid>;

interface ProductsBodyProps extends Omit<GridProps, 'dragDisabledReason'> {
  loading: boolean;
  /** R88: the first settings read failed. */
  settingsUnread: boolean;
  /** Listed products, archived ones included. */
  listedCount: number;
  archivedCount: number;
  onCreateNew: ComponentProps<typeof ProjectsEmptyState>['onCreateNew'];
  onLoadSample: () => void;
}

export default function ProductsBody({
  loading, settingsUnread, listedCount, archivedCount, onCreateNew, onLoadSample,
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
  return grid.projects.length === 0
    ? <div className="sf-below" data-sf="empty"><AllArchivedLine count={archivedCount} /></div>
    : <ProjectGrid {...grid} dragDisabledReason={settingsUnread ? SETTINGS_UNREAD_REASON : null} />;
}
