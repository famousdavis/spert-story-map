// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The Welcome panel, shown when there are no products (v0.55.0; on the frame's `.sf-empty` since v0.58.0, FRAME26's
// clean-up). Contract §3 and §7: in the tile grid's place, 16 px below the heading row, the full column wide, a dashed
// card on the page ground in both themes. The stylesheet (v3) draws the card and its parts: the title, the lines, the
// actions and the note. Its words are Story Map's own (v0.55.0, R22), unchanged.
//
// The title is "Welcome to " and the brand row's title exactly, its ® in the same `.sf-mark`. The two buttons are the
// toolbar's two looks and its handlers: Create New Product is New Product's, Load Sample Product is Load Sample's.
// `.sf-btn` makes them 36 px.

import type React from 'react';
import { PRODUCT_DEFINITION } from '../../lib/constants';
import { TOOLBAR_BUTTON, TOOLBAR_PRIMARY, TOOLBAR_SECONDARY } from './button-styles';

interface ProjectsEmptyStateProps {
  onCreateNew: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onLoadSample: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export default function ProjectsEmptyState({ onCreateNew, onLoadSample }: ProjectsEmptyStateProps) {
  return (
    <div className="sf-empty" data-sf="empty" role="region" aria-labelledby="empty-state-heading">
      <h2 id="empty-state-heading" className="sf-empty-title">
        Welcome to SPERT<span className="sf-mark">®</span> Story Map
      </h2>
      <p className="sf-empty-text">
        Plan releases on a story map: themes, backbones and rib items, sized in story points, allocated to
        releases and tracked sprint by sprint.
      </p>
      <p className="sf-empty-text">{PRODUCT_DEFINITION}</p>
      <div className="sf-empty-actions">
        <button type="button" onClick={onCreateNew} className={`sf-btn ${TOOLBAR_BUTTON} ${TOOLBAR_PRIMARY}`}>
          Create New Product
        </button>
        <button type="button" onClick={onLoadSample} className={`sf-btn ${TOOLBAR_BUTTON} ${TOOLBAR_SECONDARY}`}>
          Load Sample Product
        </button>
      </div>
      <p className="sf-empty-note">
        The sample product is a working example with four releases and four sprints of progress. You can explore
        it, edit it, or delete it at any time.
      </p>
    </div>
  );
}
