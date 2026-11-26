// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useSyncExternalStore } from 'react';

/**
 * Whether the page is drawn dark: the `dark` class on `<html>`, which every `dark:` class and the frame's dark tokens
 * already follow (v0.58.0). The one theme source for colours that cannot be classes (Recharts takes hex values).
 *
 * Before, each chart called `useDarkMode()`, a hook with its own state read once from localStorage. The theme button
 * (AppShell's own `useDarkMode`) changed the class, and the charts kept their colours until their view remounted.
 * Reading the class means a chart follows the theme button at once, and "System" when the OS changes too.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const isDarkNow = () => document.documentElement.classList.contains('dark');

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, isDarkNow, () => false);
}
