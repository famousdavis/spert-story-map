// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The quiet text links in the headers (v0.56.3): Help Center in both headers, and About on the
// Products page. ONE class string, so the two cannot drift apart.
//
// The greys reach 4.5:1 (WCAG AA) against every background these links sit on: white in light
// mode, the Products page's gray-950 and the project header's gray-900 in dark mode, at rest and
// on hover. About used `text-gray-400` / `dark:text-gray-500` before this, about 2.5:1 on white
// and 3.7:1 on gray-900. The next grey toward the background fails in each theme; the ratios
// measured in the running app are in the v0.56.3 pull request. The hover ends are the gear and
// theme toggle's.

export const HEADER_LINK_CLASS =
  'text-sm text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300 transition-colors';
