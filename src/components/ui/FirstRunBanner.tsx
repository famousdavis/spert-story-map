// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from 'react';
import { FIRST_RUN_SEEN_KEY, TOS_URL, PRIVACY_POLICY_URL } from '../../lib/tosConstants';

export default function FirstRunBanner() {
  const [visible, setVisible] = useState(
    () => localStorage.getItem(FIRST_RUN_SEEN_KEY) !== 'true'
  );

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(FIRST_RUN_SEEN_KEY, 'true');
    setVisible(false);
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-700/50 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-start justify-between gap-3">
        <p className="text-xs text-blue-800 dark:text-blue-200">
          SPERT® Suite web apps are free. No account is required to use them.
          By accessing or using this app, you agree to our{' '}
          <a href={TOS_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600 dark:hover:text-blue-300">Terms of Service</a>
          {' '}and{' '}
          <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600 dark:hover:text-blue-300">Privacy Policy</a>.
          If you choose to enable optional Cloud Storage, you&#39;ll be asked to
          explicitly confirm your agreement.
        </p>
        <button
          onClick={dismiss}
          className="text-xs text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 rounded px-2.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors flex-shrink-0"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
