// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The heading row (v0.55.0): "Products" and the toolbar, in SPERT Forecaster's look. The order is
// fixed across the SPERT® Suite: Export All · Import · Load Sample · New Product (primary, far
// right). Every button always renders; gates disable, never hide.

import type React from 'react';
import ToolbarIcon from './ToolbarIcon';
import { TOOLBAR_ICON_PATHS } from './toolbarIconPaths';
import { HEAD_ROW, HEADING } from './dashboard-styles';
import { TOOLBAR_BUTTON, TOOLBAR_ICON_PRIMARY, TOOLBAR_ICON_SECONDARY, TOOLBAR_PRIMARY, TOOLBAR_SECONDARY } from './button-styles';

const SECONDARY = `${TOOLBAR_BUTTON} ${TOOLBAR_SECONDARY}`;
const PRIMARY = `${TOOLBAR_BUTTON} ${TOOLBAR_PRIMARY}`;

interface ProjectsToolbarProps {
  hasProjects: boolean;
  importDisabled: boolean;
  newProjectRef: React.RefObject<HTMLButtonElement | null>;
  onExportAll: () => void;
  onImport: () => void;
  onLoadSample: () => void;
  onNewProject: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export default function ProjectsToolbar({
  hasProjects, importDisabled, newProjectRef, onExportAll, onImport, onLoadSample, onNewProject,
}: ProjectsToolbarProps) {
  return (
    <div className={`${HEAD_ROW} mb-4`}>
      <h2 className={HEADING}>Products</h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onExportAll} disabled={!hasProjects} aria-label="Export all products as JSON" className={SECONDARY}>
          <ToolbarIcon d={TOOLBAR_ICON_PATHS.export} className={TOOLBAR_ICON_SECONDARY} />
          Export All
        </button>
        <button type="button" onClick={onImport} disabled={importDisabled} aria-label="Import products from JSON" className={SECONDARY}>
          <ToolbarIcon d={TOOLBAR_ICON_PATHS.import} className={TOOLBAR_ICON_SECONDARY} />
          Import
        </button>
        <button type="button" onClick={onLoadSample} className={SECONDARY}>
          <ToolbarIcon d={TOOLBAR_ICON_PATHS.sample} className={TOOLBAR_ICON_SECONDARY} />
          Load Sample
        </button>
        <button type="button" ref={newProjectRef} onClick={onNewProject} className={PRIMARY}>
          <ToolbarIcon d={TOOLBAR_ICON_PATHS.plus} className={TOOLBAR_ICON_PRIMARY} />
          New Product
        </button>
      </div>
    </div>
  );
}
