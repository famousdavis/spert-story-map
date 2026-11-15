// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Whether to tell the person they were signed out for the Terms (v0.55.16, R80, R81).
 *
 * AuthProvider sets it in both Terms branches, before the sign-out cleanup runs, so it is set
 * even when the cleanup throws. It is cleared when the next sign-in starts and by the banner's
 * Dismiss. It lives in memory only, so a reload clears it. The page has already rendered when the
 * sign-out happens, so readers subscribe (TermsSignOutBanner uses useSyncExternalStore).
 */

let shown = false;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

export function setTermsSignOutNotice(): void {
  if (shown) return;
  shown = true;
  changed();
}

export function clearTermsSignOutNotice(): void {
  if (!shown) return;
  shown = false;
  changed();
}

export function isTermsSignOutNoticeShown(): boolean {
  return shown;
}

export function subscribeTermsSignOutNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
