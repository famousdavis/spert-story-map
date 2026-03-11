// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from 'react';
import { FIRST_RUN_SEEN_KEY } from '../../lib/tosConstants';

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
          Statistical PERT® apps are free to use. No account is required.
          If you choose to enable optional Cloud Storage, you will be asked to
          review and agree to our Terms of Service and Privacy Policy.
        </p>
        <button
          onClick={dismiss}
          className="text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300 text-sm leading-none flex-shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
