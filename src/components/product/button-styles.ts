// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The Projects page's labelled buttons and its tiles' icon buttons (v0.55.0): SPERT Forecaster's
// strings at 38f1a63 (`src/shared/components/toolbar-button-styles.ts` and
// `icon-button-styles.ts`), which are GanttApp's `.pt-btn` and icon buttons written as Tailwind.
//
// ⚠️ Copied through the brief's token map. Forecaster's `spert-blue` is a theme colour Story Map
// does not define: written as is, `bg-spert-blue` produces NO CSS and New Project's label is white
// on white. Here it is the literal `[#0070f3]`. Forecaster's dark page is gray-900 and Story
// Map's is gray-950, so the secondary button's dark background, which is meant to be the page
// colour, is gray-950 here.
//
// Hover is `hover:` only: Tailwind 4 wraps it in `@media (hover: hover)`, so a touch screen never
// keeps a hover look. Every hover and focus look is `enabled:`-gated, so a disabled button shows
// none.

/** Box, type, corners, disabled state and the keyboard focus outline. */
export const TOOLBAR_BUTTON =
  'inline-flex items-center gap-[0.4rem] px-[0.8rem] py-[0.45rem] border rounded-[6px] text-[0.9rem] leading-[1.3] whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070f3] dark:focus-visible:outline-[#60a5fa]';

/** Grey outline, dark text, the page's own background. */
export const TOOLBAR_SECONDARY =
  'font-medium bg-white text-[#333] border-[#8a8a8a] enabled:hover:bg-[#f5f5f5] dark:bg-gray-950 dark:text-[#e2e8f0] dark:border-[#8b9bb4] dark:enabled:hover:bg-[#2d3748]';

/** The one filled button of a group. Hover #005bc4, as Forecaster's. */
export const TOOLBAR_PRIMARY =
  'font-semibold bg-[#0070f3] text-white border-[#0070f3] enabled:hover:bg-[#005bc4] enabled:hover:border-[#005bc4]';

/** A secondary button's 18 px icon in GanttApp's meta grey; the primary's keeps the text colour. */
export const TOOLBAR_ICON_SECONDARY = 'flex-none text-[#666] dark:text-[#a0aec0]';
export const TOOLBAR_ICON_PRIMARY = 'flex-none';

/** A tile's icon button: 28 px box, 6 px corners, the keyboard focus outline. */
export const ICON_BUTTON_BASE =
  'inline-flex size-7 flex-none items-center justify-center p-0 border-0 rounded-[6px] leading-[0] cursor-pointer transition-[background-color,box-shadow] duration-[120ms] ease-[ease] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070f3] dark:focus-visible:outline-[#60a5fa]';

/** The glyph's width and height, in px. */
export const ICON_GLYPH_SIZE = 18;

/** At rest: grey, no background. */
export const ICON_REST = 'bg-transparent text-[#808080] dark:text-[#9ca3af]';

/** Delete. */
export const ICON_HUE_RED =
  'enabled:hover:text-[#ef4444] enabled:hover:bg-[#fef2f2] enabled:hover:shadow-[0_0_0_1.5px_rgba(239,68,68,0.5)] enabled:focus:text-[#ef4444] enabled:focus:bg-[#fef2f2] enabled:focus:shadow-[0_0_0_1.5px_rgba(239,68,68,0.5)] dark:enabled:hover:text-[#f87171] dark:enabled:hover:bg-[rgba(239,68,68,0.15)] dark:enabled:focus:text-[#f87171] dark:enabled:focus:bg-[rgba(239,68,68,0.15)]';

/** Export. */
export const ICON_HUE_GREEN =
  'enabled:hover:text-[#047857] enabled:hover:bg-[#ecfdf5] enabled:hover:shadow-[0_0_0_1.5px_rgba(16,185,129,0.5)] enabled:focus:text-[#047857] enabled:focus:bg-[#ecfdf5] enabled:focus:shadow-[0_0_0_1.5px_rgba(16,185,129,0.5)] dark:enabled:hover:text-[#34d399] dark:enabled:hover:bg-[rgba(16,185,129,0.15)] dark:enabled:focus:text-[#34d399] dark:enabled:focus:bg-[rgba(16,185,129,0.15)]';

/** Edit. */
export const ICON_HUE_BLUE =
  'enabled:hover:text-[#0070f3] enabled:hover:bg-[#eff6ff] enabled:hover:shadow-[0_0_0_1.5px_rgba(0,112,243,0.5)] enabled:focus:text-[#0070f3] enabled:focus:bg-[#eff6ff] enabled:focus:shadow-[0_0_0_1.5px_rgba(0,112,243,0.5)] dark:enabled:hover:text-[#60a5fa] dark:enabled:hover:bg-[rgba(0,112,243,0.15)] dark:enabled:focus:text-[#60a5fa] dark:enabled:focus:bg-[rgba(0,112,243,0.15)]';

/** Clone. */
export const ICON_HUE_VIOLET =
  'enabled:hover:text-[#7c3aed] enabled:hover:bg-[#f5f3ff] enabled:hover:shadow-[0_0_0_1.5px_rgba(139,92,246,0.5)] enabled:focus:text-[#7c3aed] enabled:focus:bg-[#f5f3ff] enabled:focus:shadow-[0_0_0_1.5px_rgba(139,92,246,0.5)] dark:enabled:hover:text-[#a78bfa] dark:enabled:hover:bg-[rgba(139,92,246,0.15)] dark:enabled:focus:text-[#a78bfa] dark:enabled:focus:bg-[rgba(139,92,246,0.15)]';

/** Share. */
export const ICON_HUE_CYAN =
  'enabled:hover:text-[#0e7490] enabled:hover:bg-[#ecfeff] enabled:hover:shadow-[0_0_0_1.5px_rgba(6,182,212,0.5)] enabled:focus:text-[#0e7490] enabled:focus:bg-[#ecfeff] enabled:focus:shadow-[0_0_0_1.5px_rgba(6,182,212,0.5)] dark:enabled:hover:text-[#22d3ee] dark:enabled:hover:bg-[rgba(6,182,212,0.15)] dark:enabled:focus:text-[#22d3ee] dark:enabled:focus:bg-[rgba(6,182,212,0.15)]';
