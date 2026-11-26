// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HELP_CENTER_URL } from '../../lib/constants';
import { framePlace, PRODUCT_TABS } from '../../lib/framePlace';

/** Back to the top of the page on arrival, as the old "← Products" link did. */
const toTop = () => window.scrollTo(0, 0);

/** `:focus-visible`, where the browser can tell; true where it cannot (an engine without the selector). */
function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * A keyboard-focused item partly outside the work zone is scrolled fully into it (v0.58.0). At 853 px (X6) the zone
 * scrolls, and Chrome does not scroll a partly visible focused item into view: Insights took focus with 4.4 px of its
 * right side, and its inset focus ring, outside. Only the zone moves (never the window, which `scrollIntoView` may also
 * move), by the hidden amount rounded up to a whole pixel: Chrome keeps scroll offsets whole, so 4.4 moved 4 and left
 * 0.4 px outside. And only on `:focus-visible`, so a mouse press on a partly hidden tab never shifts it under the
 * pointer before the click lands.
 */
function revealFocused(e: React.FocusEvent<HTMLDivElement>) {
  const zone = e.currentTarget;
  const item = e.target;
  if (item === zone || !focusVisible(item)) return;
  const z = zone.getBoundingClientRect();
  const r = item.getBoundingClientRect();
  if (r.left < z.left) zone.scrollLeft -= Math.ceil(z.left - r.left);
  else if (r.right > z.right) zone.scrollLeft += Math.ceil(r.right - z.right);
}

interface AppNavProps {
  /** Opens the app's Settings dialog (D9): "Settings" is a button, never a page. */
  onOpenSettings: () => void;
}

/**
 * The frame's navigation row (FRAME26, contract §3, v0.57.0): a full-width 44 px band under the brand row. Two zones:
 * the work items on the left, and Settings · About · Help Center ↗ on the right.
 *
 * The work zone is "Products" on every screen, then, inside a product, its seven tabs (William, 2026-11-26): Structure
 * · Releases · Map · Sizing · Progress · Insights · Product Settings. The product tab is the current page there, and
 * "Products" is a plain link back. The tabs are text only: with v0.56.5's glyphs (◫ ▦ …) the zone hid 51 px at
 * 1024 px, where the contract allows nothing to hide. It may scroll sideways at 853 px (150 %), exception X6; every
 * item stays reachable by Tab, trackpad and Shift+wheel, and an item Tab reaches is scrolled fully into the zone.
 *
 * The current item carries `aria-current="page"`, which the frame's stylesheet draws as the underline; every other
 * item omits the attribute. A screen no item leads to (the changelog, the 404) marks none. Settings opens the app's
 * Settings dialog (Cloud Storage, Export Attribution, Notifications) and is never current.
 *
 * Inside a product the row sticks to the top of the window (`.sf-nav--sticky`, exception X3); the brand row and the
 * product's heading row scroll away.
 *
 * Help Center leaves the app: not a navigation item, never current, the row's last element, quiet 400-weight text
 * (`.sf-help`). ⚠️ The spaces are their own text nodes, outside the spans: with a space inside a span, the
 * accessible-name computation trims it and gives "Help Center(opens in a new tab)".
 */
export default function AppNav({ onOpenSettings }: AppNavProps) {
  const { pathname } = useLocation();
  const place = framePlace(pathname);
  const current = (key: string) => (place.active === key ? ('page' as const) : undefined);
  return (
    <nav className={place.sticky ? 'sf-nav sf-nav--sticky' : 'sf-nav'} data-sf="nav">
      <div className="sf-col sf-nav-row">
        <div className="sf-nav-work" data-sf="nav-work" onFocus={revealFocused}>
          <Link to="/" onClick={toTop} className="sf-tab" aria-current={current('products')}>Products</Link>
          {place.productId && PRODUCT_TABS.map(tab => (
            <Link
              key={tab.path}
              to={`/product/${place.productId}/${tab.path}`}
              className="sf-tab"
              aria-current={current(tab.path)}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div className="sf-nav-app" data-sf="nav-app">
          <button type="button" onClick={onOpenSettings} className="sf-tab">Settings</button>
          <Link to="/about" className="sf-tab" aria-current={current('about')}>About</Link>
          <a href={HELP_CENTER_URL} target="_blank" rel="noopener noreferrer" className="sf-help">
            Help Center{' '}<span aria-hidden="true">↗</span>{' '}<span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
