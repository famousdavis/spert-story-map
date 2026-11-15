// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The fold's lock when the browser has no Web Locks (v0.56.1, R71 R-3): the same timestamp lock as
// `migrateLegacyKeys`. Split from localStoreFold.ts for length; behaviour unchanged.

const FALLBACK_LOCK_KEY = '_rp:local-fold-in-progress';
const LOCK_TIMEOUT_MS = 30_000;

function readFallbackLock(): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(FALLBACK_LOCK_KEY) ?? 'null') as { ts?: unknown } | null;
    return typeof v?.ts === 'number' ? v.ts : null;
  } catch {
    return null;
  }
}

/** Without navigator.locks: wait while another tab's lock is fresh (as `migrateLegacyKeys` does). */
export async function withFallbackLock<T>(run: () => T): Promise<T> {
  while (true) {
    const ts = readFallbackLock();
    if (ts === null || Date.now() - ts >= LOCK_TIMEOUT_MS) break;
    await new Promise(r => setTimeout(r, 200));
  }
  try { localStorage.setItem(FALLBACK_LOCK_KEY, JSON.stringify({ ts: Date.now() })); } catch { /* full: fold anyway */ }
  try {
    return run();
  } finally {
    try { localStorage.removeItem(FALLBACK_LOCK_KEY); } catch { /* nothing to do */ }
  }
}
