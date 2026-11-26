// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The app's own polite live region (v0.58.0): a message that must be heard after the page that sent it has gone.
// Load Sample adds a product and opens its Map, which unmounts the Products page and its own region; a region mounted
// already holding its text is not reliably spoken. `AppAnnouncer`, rendered once by `AppShell`, is in the page before
// and after the route change. One message at a time, kept until the next.
//
// A region speaks only when its text changes, so the same message twice would be silent. `announceApp` empties it
// first, then sets the message a tick later (the Products page's own region does the same, v0.55.0).

let message = '';
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: string) {
  message = next;
  listeners.forEach(l => l());
}

export function announceApp(text: string): void {
  if (timer !== null) clearTimeout(timer);
  set('');
  timer = setTimeout(() => {
    timer = null;
    set(text);
  }, 0);
}

export function subscribeAppAnnouncement(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getAppAnnouncement(): string {
  return message;
}

/** Tests: back to an empty region, with nothing pending. */
export function resetAppAnnouncer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  set('');
}
