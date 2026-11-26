// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from 'react';
import { FIRST_RUN_SEEN_KEY, TOS_URL, PRIVACY_POLICY_URL } from '../../lib/tosConstants';

/** The terms notice (FRAME26, v0.57.0): the frame's info notice in its notices slot; "Got it" is `.sf-notice-dismiss`. */
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
    <div className="sf-notice sf-notice--info">
      <p>
        SPERT® Suite web apps are free to use. No account is required to use them.
        By accessing or using this app, you agree to our{' '}
        <a href={TOS_URL} target="_blank" rel="noopener noreferrer">Terms of Service</a>
        {' '}and{' '}
        <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        If you choose to enable optional Cloud Storage, you&#39;ll be asked to
        explicitly confirm your agreement.
      </p>
      <button type="button" onClick={dismiss} className="sf-notice-dismiss">
        Got it
      </button>
    </div>
  );
}
