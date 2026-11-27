// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useDarkMode } from '../../hooks/useDarkMode';
import { framePlace, mainClass } from '../../lib/framePlace';
import AppHeader from './AppHeader';
import AppNav from './AppNav';
import AppFooter from './AppFooter';
import AppSettingsModal from '../settings/AppSettingsModal';
import AppAnnouncer from './AppAnnouncer';
import InvitationBanner from '../ui/InvitationBanner';
import AiTeardownBanner from '../ui/AiTeardownBanner';
import TermsSignOutBanner from '../ui/TermsSignOutBanner';
import LocalFoldBanner from '../ui/LocalFoldBanner';
import FirstRunBanner from '../ui/FirstRunBanner';
import LocalStorageCaution from '../ui/LocalStorageCaution';

/**
 * The SPERT® Suite app frame (FRAME26, contract `spert-suite-docs/suite/frame/FRAME-CONTRACT.md`, v0.57.0), one
 * layout route around every page: the skip link, the 56 px brand row, the 44 px navigation row, the app-wide notices,
 * `main` in the shared 1600 px column, the 69 px footer, and the app's Settings dialog. The geometry and colours are
 * the vendored `src/styles/spert-frame.css`'s; the elements carry its `data-sf` hooks, which the suite's live check,
 * frame-check, reads. Mounted once, so the notices below are too (as they were in `App.tsx` before).
 *
 * Each page renders its own heading row and body into `main`. A product's page keeps everything product-scoped
 * (`ProductLayout`): its name, Saved, Connect AI and its own notices.
 *
 * The notices slot holds the app-wide notices in the suite's order (contract §6): the invitation, then the other
 * app-wide banners (a failed Connect AI teardown, a Terms sign-out, the Local store's fold), then the terms, then the
 * caution. Each hides itself, and the slot takes no space when it holds no element (the stylesheet's
 * `:not(:has(> *))`). A notice that belongs to one page (Products' or a product's) sits below that page's heading row.
 *
 * The Map and Sizing run full bleed (X2) and have no footer (X5); inside a product the navigation row sticks (X3).
 *
 * `AppAnnouncer` is the app's own polite live region (v0.58.0): mounted once here, so a message sent just before a
 * route change (Load Sample's, which opens the Map) is still heard after it.
 */
export default function AppShell() {
  const { pathname } = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const { theme, toggleTheme } = useDarkMode();
  const openSettings = () => setShowSettings(true);
  return (
    <div className="sf-app" data-sf="app">
      <a href="#main" className="sf-skip" data-sf="skip">Skip to main content</a>
      <AppHeader theme={theme} onToggleTheme={toggleTheme} onOpenSettings={openSettings} />
      <AppNav onOpenSettings={openSettings} />
      <div className="sf-col sf-notices" data-sf="notices">
        <InvitationBanner />
        <AiTeardownBanner />
        <TermsSignOutBanner />
        <LocalFoldBanner />
        <FirstRunBanner />
        <LocalStorageCaution />
      </div>
      <main id="main" className={mainClass(pathname)} data-sf="main">
        <Outlet />
      </main>
      {!framePlace(pathname).canvas && <AppFooter />}
      <AppSettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      <AppAnnouncer />
    </div>
  );
}
