// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Link } from 'react-router-dom';
import type { ComponentProps } from 'react';
import ThemeToggle from '../ui/ThemeToggle';
import StorageStatusPill from '../ui/StorageStatusPill';

/** Story Map's tagline (v0.55.0's words), unchanged by the frame. */
export const APP_TAGLINE = 'Plan and track agile product releases';

type ThemeMode = ComponentProps<typeof ThemeToggle>['theme'];

interface AppHeaderProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  /** Opens the app's Settings dialog. The account chip calls it in every state. */
  onOpenSettings: () => void;
}

/**
 * The frame's brand row (FRAME26, contract §3, v0.57.0): a 56 px band on the page ground, in the shared 1600 px
 * column, on every screen. It never sticks; inside a product the navigation row below it does (X3).
 *
 * The brand is ONE LINK to the Products page: the favicon and the title. It has no `aria-label`: its accessible name
 * is its visible title, "SPERT® Story Map" (WCAG 2.5.3, label in name). Both favicons are decorative (`alt=""`); the
 * frame's stylesheet shows the light or the dark file by its class.
 *
 * The title is NOT a heading: the page's one `h1` is its heading row's, in `main` (contract §2).
 *
 * The title's colour (HDR26, v0.56.4; moved onto the frame at v0.57.0): Story Map's favicon indigo as a gradient on
 * each word, with the frame's `.sf-grad`. The ramps are `--app-grad-light` and `--app-grad-dark`, set once on `:root`
 * in `src/index.css`; the dark one was re-derived for the frame's `#101828` ground. The ® between the words is the
 * frame's muted `.sf-mark`. The fallbacks are the frame's: solid in its heading colour under `prefers-contrast: more`,
 * solid black in print. `src/__tests__/projectsHeaderTitleGradient.test.ts` holds all of it.
 *
 * ⚠️ The space before "Story Map" is a text node of the title, OUTSIDE the gradient spans: inside a span, jsdom's
 * accessible-name computation trims it.
 */
export default function AppHeader({ theme, onToggleTheme, onOpenSettings }: AppHeaderProps) {
  return (
    <header className="sf-bar">
      <div className="sf-col sf-bar-row">
        <Link to="/" onClick={() => window.scrollTo(0, 0)} className="sf-brand" data-sf="brand">
          <img src="/spert-favicon-storymap.png" alt="" className="sf-icon sf-icon--light ring-1 ring-white/20" data-sf="favicon" />
          <img src="/spert-favicon-storymap-dark.png" alt="" className="sf-icon sf-icon--dark ring-1 ring-white/20" data-sf="favicon" />
          <span className="sf-title" data-sf="title">
            <span className="sf-grad">SPERT</span><span className="sf-mark">®</span>{' '}<span className="sf-grad">Story Map</span>
          </span>
        </Link>
        <p className="sf-tagline" data-sf="tagline">{APP_TAGLINE}</p>
        <div className="sf-utils" data-sf="utils">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <StorageStatusPill onClick={onOpenSettings} />
        </div>
      </div>
    </header>
  );
}
