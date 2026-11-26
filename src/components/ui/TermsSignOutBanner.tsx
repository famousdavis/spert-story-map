// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useSyncExternalStore } from 'react';
import {
  clearTermsSignOutNotice,
  isTermsSignOutNoticeShown,
  subscribeTermsSignOutNotice,
} from '../../lib/termsSignOutNotice';

/**
 * v0.55.16: says why Story Map signed the person out for the Terms (R80's words), on every page.
 * Mounted once in the frame's notices slot (AppShell), beside AiTeardownBanner. Shown until Dismiss or the
 * next sign-in; a reload clears it (R81). Returns null otherwise. The frame's caution notice (FRAME26, v0.57.0), in
 * its notices slot; "Dismiss" is `.sf-notice-dismiss`.
 */
export default function TermsSignOutBanner() {
  const shown = useSyncExternalStore(subscribeTermsSignOutNotice, isTermsSignOutNoticeShown);
  if (!shown) return null;

  return (
    <div className="sf-notice sf-notice--caution" role="alert" aria-live="assertive">
      <p className="flex-1">
        You were signed out because the Terms of Service changed or could not be checked. Your
        products, export name and identifier in this browser were not deleted. If you used Cloud
        storage, choose it again in Settings after you sign in.
      </p>
      <button type="button" onClick={clearTermsSignOutNotice} className="sf-notice-dismiss">
        Dismiss
      </button>
    </div>
  );
}
