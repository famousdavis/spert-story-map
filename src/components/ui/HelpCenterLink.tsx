// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { HELP_CENTER_URL } from '../../lib/constants';
import { HEADER_LINK_CLASS } from './header-link-styles';

/**
 * The SPERT® Suite Help Center, in a new tab (v0.56.3). In the Products page header just left of
 * About, and in a product's header just right of the theme toggle.
 *
 * A plain `<a>`, not a router `Link`: it leaves the app. The arrow is hidden from screen readers
 * and the new tab is said in words instead, so the accessible name is
 * "Help Center (opens in a new tab)". The spaces are text between the spans, not inside them:
 * the name computation trims a span's own text, so a space inside the span is lost (measured with
 * testing-library: "Help Center(opens in a new tab)"); repeated spaces collapse to one.
 */
export default function HelpCenterLink() {
  return (
    <a href={HELP_CENTER_URL} target="_blank" rel="noopener noreferrer" className={HEADER_LINK_CLASS}>
      Help Center{' '}
      <span aria-hidden="true">↗</span>{' '}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
