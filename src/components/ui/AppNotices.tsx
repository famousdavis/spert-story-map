// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import FirstRunBanner from './FirstRunBanner';
import LocalStorageCaution from './LocalStorageCaution';

/**
 * The two app-wide notices, in the order the SPERT® Suite shows them: the terms
 * notice, then the local-storage caution. Mounted once on every page, directly
 * below that page's header. `className` goes on each card's wrapper and sets its
 * spacing, width and side padding to match the page; a hidden notice renders
 * nothing, so it takes no space.
 */
export default function AppNotices({ className = '' }: { className?: string }) {
  return (
    <>
      <FirstRunBanner className={className} />
      <LocalStorageCaution className={className} />
    </>
  );
}
