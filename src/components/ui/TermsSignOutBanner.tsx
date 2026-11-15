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
 * Mounted once in App.tsx, outside <Routes>, beside AiTeardownBanner. Shown until Dismiss or the
 * next sign-in; a reload clears it (R81). Returns null otherwise.
 */
export default function TermsSignOutBanner() {
  const shown = useSyncExternalStore(subscribeTermsSignOutNotice, isTermsSignOutNoticeShown);
  if (!shown) return null;

  return (
    <div
      className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700/50 px-4 py-3"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-2xl mx-auto flex items-start justify-between gap-3">
        <p className="flex-1 text-sm text-amber-900 dark:text-amber-100">
          You were signed out because the Terms of Service changed or could not be checked. Your
          products, export name and identifier in this browser were not deleted. If you used Cloud
          storage, choose it again in Settings after you sign in.
        </p>
        <button
          onClick={clearTermsSignOutNotice}
          className="flex-shrink-0 text-xs text-amber-600 dark:text-amber-400"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
