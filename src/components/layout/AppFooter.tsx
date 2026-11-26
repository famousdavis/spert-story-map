// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Link } from 'react-router-dom';
import { APP_VERSION } from '../../lib/version';
import { TOS_URL, PRIVACY_POLICY_URL, LICENSE_URL } from '../../lib/tosConstants';
import { AI_PRIVACY_URL } from '../../lib/aiConstants';

/**
 * The frame's footer (FRAME26, contract §3, v0.57.0): a full-width 69 px band with a 1 px top rule and two centred
 * lines, flowing after `main`. On every screen but the Map and Sizing (exception X5). Wording and destinations are
 * unchanged from v0.56.5 (it was `ChangelogView`'s `Footer`). The links take the frame's `--sf-link` (`#155dfc` /
 * `#51a2ff`: 5.25 and 6.73 : 1 on the page ground) and underline on hover and, under `prefers-contrast: more`, at
 * rest: never a utility colour here, because the frame's unlayered rules would beat it anyway.
 */
export default function AppFooter() {
  return (
    <footer className="sf-footer" data-sf="footer">
      <div className="sf-col">
        <div>
          &copy; {new Date().getFullYear()} William W. Davis, MSPM, PMP |{' '}
          <Link to="/changelog">Version {APP_VERSION}</Link>{' '}
          | Licensed under GNU GPL v3
        </div>
        <div>
          <a href="https://spertsuite.com" target="_blank" rel="noopener noreferrer">SPERT® Suite</a>
          {' | '}
          <a href={TOS_URL} target="_blank" rel="noopener noreferrer">Terms of Service</a>
          {' | '}
          <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          {' | '}
          <a href={AI_PRIVACY_URL} target="_blank" rel="noopener noreferrer">AI Privacy Notice</a>
          {' | '}
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">License</a>
        </div>
      </div>
    </footer>
  );
}
