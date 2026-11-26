// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ReactNode } from 'react';

interface HeadingRowProps {
  /** The page's heading: its one `h1`. */
  children: ReactNode;
  /** The full text, shown on hover when a long heading is cut short with an ellipsis (contract §7, "Long names"). */
  title?: string;
  /**
   * Status text just left of the toolbar, OUTSIDE it: a product's "Saved …" line (D10). It is not a button, so it
   * keeps its own 12 px size; the toolbar's children are all held to the frame's 36 px button.
   */
  status?: ReactNode;
  /** The page's own buttons, flush right on the row: the Products page's four, a product's Connect AI. */
  toolbar?: ReactNode;
}

/**
 * The frame's heading row (FRAME26, contract §3, v0.57.0): the page's `h1`, 24 / 32 / 700 at the column's left edge,
 * with the toolbar flush right, 24 px under the frame. Every screen has exactly one, and it is the page's only `h1`:
 * the brand title is not a heading.
 *
 * ⚠️ Render it as a DIRECT child of `main` on a capped screen (`.sf-main--capped`, exception X4: About and the
 * changelog), never inside a wrapper: the cap applies to every child of `main` except this row, which stays full
 * width. On the Map and Sizing (X2) `main` runs full bleed, so the product's row sits in a `.sf-col` there.
 */
export default function HeadingRow({ children, title, status, toolbar }: HeadingRowProps) {
  return (
    <div className="sf-headrow" data-sf="headrow">
      <h1 className="sf-heading" data-sf="heading" title={title}>
        {children}
      </h1>
      {status}
      {toolbar && (
        <div className="sf-toolbar" data-sf="toolbar">
          {toolbar}
        </div>
      )}
    </div>
  );
}
