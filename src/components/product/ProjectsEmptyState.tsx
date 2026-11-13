// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The welcome panel shown when there are no projects (v0.55.0): SPERT Forecaster's
// `ProjectsEmptyState` at 38f1a63, with Story Map's words. Its card, border and text colours are
// Forecaster theme names Story Map does not define (as classes they produce no CSS: a transparent
// panel with a black dashed border), and its large radius is 10 px there, 8 px here. Each is
// written here as its value.

import type React from 'react';
import { TOOLBAR_BUTTON, TOOLBAR_PRIMARY, TOOLBAR_SECONDARY } from './button-styles';

interface ProjectsEmptyStateProps {
  onCreateNew: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onLoadSample: () => void;
}

export default function ProjectsEmptyState({ onCreateNew, onLoadSample }: ProjectsEmptyStateProps) {
  return (
    <div
      className="mt-6 rounded-[10px] border border-dashed border-[#e5e5e5] dark:border-gray-700 p-8 text-center bg-white dark:bg-[#171717]"
      role="region"
      aria-labelledby="empty-state-heading"
    >
      <h2 id="empty-state-heading" className="text-xl font-semibold text-[#333] dark:text-gray-100 mb-3">
        Welcome to SPERT® Story Map
      </h2>
      <p className="text-sm text-[#666] dark:text-gray-400 max-w-prose mx-auto">
        Plan releases on a story map: themes, backbones and rib items, sized in story points, allocated to
        releases and tracked sprint by sprint.
      </p>
      {/* The secondary button is transparent in dark mode: it sits on this panel, not on the page. */}
      <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
        <button type="button" onClick={onCreateNew} className={`${TOOLBAR_BUTTON} ${TOOLBAR_PRIMARY}`}>
          Create New Project
        </button>
        <button type="button" onClick={onLoadSample} className={`${TOOLBAR_BUTTON} ${TOOLBAR_SECONDARY} dark:bg-transparent`}>
          Load Sample Project
        </button>
      </div>
      <p className="mt-4 text-xs italic text-[#666] dark:text-gray-500 max-w-prose mx-auto">
        The sample project is a working example with four releases and four sprints of progress. You can explore
        it, edit it, or delete it at any time.
      </p>
    </div>
  );
}
