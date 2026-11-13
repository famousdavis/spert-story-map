// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * A double-click on a project tile opens the project once (v0.55.0).
 *
 * The tile opens on its first click, with no wait. The second click of a habitual double-click
 * would then land on the Structure page, where a click on a theme, backbone or rib name opens it
 * for editing with the text selected: someone renaming the project as they used to would type
 * over that name instead. So when the open is a mouse or touch click (`detail === 1`), the rest of
 * that gesture is swallowed: one listener per event type on `document`, in the CAPTURE phase.
 *
 * ⚠️ It must be a native capture listener on `document`. React 19 attaches its own listeners to
 * the root container (`#root`), so a document capture listener runs before any React handler,
 * capture or bubble, and `stopPropagation` there keeps the event from React altogether. A React
 * `onClickCapture` would run too late to stop a handler on the next page.
 *
 * It removes itself after the first `dblclick` or after `GESTURE_MS`, whichever comes first. A
 * keyboard activation (`detail === 0`) installs nothing.
 */

export const GESTURE_MS = 500;

const SWALLOWED = ['mousedown', 'click', 'dblclick'] as const;

let active: (() => void) | null = null;

/** Swallow the rest of the current mouse gesture: its `mousedown`, `click` and `dblclick`. */
export function swallowRestOfGesture(): void {
  resetGestureGuard();
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dblclick') stop();
  };
  const timer = setTimeout(() => stop(), GESTURE_MS);
  function stop() {
    clearTimeout(timer);
    for (const type of SWALLOWED) document.removeEventListener(type, swallow, true);
    if (active === stop) active = null;
  }
  for (const type of SWALLOWED) document.addEventListener(type, swallow, true);
  active = stop;
}

/**
 * Remove the guard now, if one is installed. For tests: the guard lives up to `GESTURE_MS` past
 * the click that installed it, so a test that opens a project must reset it in cleanup, or it
 * swallows the next test's first clicks.
 */
export function resetGestureGuard(): void {
  active?.();
}
