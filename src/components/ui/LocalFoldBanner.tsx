// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useSyncExternalStore } from 'react';
import { dismissFoldNotice, getFoldNotice, subscribeFoldNotice } from '../../lib/localFoldNotice';

/**
 * v0.56.1 (R71 R-3): what the fold did with the products a signed-in person kept in this browser.
 * Mounted once in App.tsx beside TermsSignOutBanner. Shown until Dismiss or a reload.
 */
export default function LocalFoldBanner() {
  const lines = useSyncExternalStore(subscribeFoldNotice, getFoldNotice);
  if (!lines) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-700/50 px-4 py-3" role="status" aria-live="polite">
      <div className="max-w-2xl mx-auto flex items-start justify-between gap-3">
        <div className="flex-1 text-sm text-blue-900 dark:text-blue-100 space-y-1">
          {lines.map(line => <p key={line}>{line}</p>)}
        </div>
        <button onClick={dismissFoldNotice} className="flex-shrink-0 text-xs text-blue-700 dark:text-blue-300">
          Dismiss
        </button>
      </div>
    </div>
  );
}
