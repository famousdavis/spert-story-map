// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useSyncExternalStore } from 'react';
import { dismissFoldNotice, getFoldNotice, subscribeFoldNotice } from '../../lib/localFoldNotice';

/**
 * v0.56.1 (R71 R-3): what the fold did with the products a signed-in person kept in this browser.
 * Mounted once in the frame's notices slot (AppShell), beside TermsSignOutBanner: its info notice. Shown until Dismiss
 * or a reload.
 */
export default function LocalFoldBanner() {
  const lines = useSyncExternalStore(subscribeFoldNotice, getFoldNotice);
  if (!lines) return null;

  return (
    <div className="sf-notice sf-notice--info" role="status" aria-live="polite">
      <div className="flex-1">
        {lines.map(line => <p key={line}>{line}</p>)}
      </div>
      <button type="button" onClick={dismissFoldNotice} className="sf-notice-dismiss">
        Dismiss
      </button>
    </div>
  );
}
