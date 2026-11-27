// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useSyncExternalStore } from 'react';
import { getAppAnnouncement, subscribeAppAnnouncement } from '../../lib/appAnnouncer';

/**
 * The app's polite live region (v0.58.0, `lib/appAnnouncer.ts`), rendered once by `AppShell` so it outlives a route
 * change: Load Sample's "Added … and opened it." is said on the Map the button opens.
 *
 * `aria-live="polite"` rather than `role="status"`: the same polite region, without adding a second always-present
 * `status` beside a page's own (the Products page's, Product Settings' Data section's).
 */
export default function AppAnnouncer() {
  const message = useSyncExternalStore(subscribeAppAnnouncement, getAppAnnouncement, getAppAnnouncement);
  return <div aria-live="polite" aria-atomic="true" className="sr-only" data-app-announcer="">{message}</div>;
}
