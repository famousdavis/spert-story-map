// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useStorage } from '../../lib/StorageProvider';
import {
  dismissLocalCaution,
  getLocalCaution,
  subscribeLocalCaution,
} from '../../lib/localCaution';

/**
 * The amber caution shown while projects are stored only in this browser.
 *
 * Shows on each page load in local mode unless Settings turns it off. "Got it"
 * hides it until the next page load (see `localCaution.ts`). Hidden until
 * preferences have loaded, so a user who turned it off never sees it flash.
 * Preferences are read in local mode only: in cloud mode it never shows.
 */
export default function LocalStorageCaution({ className = '' }: { className?: string }) {
  const { driver, mode } = useStorage();
  const { dismissed, suppressed } = useSyncExternalStore(subscribeLocalCaution, getLocalCaution);
  const [loaded, setLoaded] = useState<{ driver: unknown; suppressed: boolean } | null>(null);

  useEffect(() => {
    if (!driver || mode !== 'local') return;
    let cancelled = false;
    driver.loadPreferences().then(prefs => {
      if (!cancelled) setLoaded({ driver, suppressed: !!prefs?.suppressLocalStorageWarning });
    });
    return () => { cancelled = true; };
  }, [driver, mode]);

  const prefsReady = loaded !== null && loaded.driver === driver;
  // The switch's latest value wins while its driver is current: the saved
  // preferences may not have caught up with it yet.
  const off = suppressed && suppressed.driver === driver ? suppressed.value : loaded?.suppressed ?? true;
  if (mode !== 'local' || !prefsReady || off || dismissed) return null;

  return (
    <div className={className}>
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Your data exists only in this browser</strong> and can be lost
          without warning. Export at the end of every session to protect your work.
        </p>
        <button
          onClick={dismissLocalCaution}
          className="text-sm text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-600 rounded px-2.5 py-1 hover:bg-amber-100 dark:hover:bg-amber-800/40 transition-colors flex-shrink-0"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
