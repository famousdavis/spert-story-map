// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/** What an undo key asks for. */
export type UndoKeyAction = 'undo' | 'redo';

/** The parts of a keydown event the rule reads. A bare `Event` has none of them. */
export interface UndoKeyEvent {
  key?: unknown;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

/**
 * The one rule for the undo keys on the Map and Sizing tabs.
 *
 * The platform's modifier must be held: Cmd on a Mac, Ctrl elsewhere. The other modifier is
 * ignored. The key is then read without regard to case, because with Shift held a browser
 * reports "Z", not "z": z undoes and Shift+z redoes. y redoes unless the key is a capital "Y"
 * with Shift held (ruling R57): a lowercase "y" redoes with or without Shift, as it did before
 * this rule, and "Y" without Shift (Caps Lock) redoes. A key that is missing or not text is no
 * action, so a bare `keydown` cannot throw.
 *
 * `isMac` comes from the caller (`navigator.platform.toUpperCase().includes('MAC')`, where
 * "MacIntel" counts); this function reads nothing global.
 */
export function undoKeyAction(e: UndoKeyEvent, isMac: boolean): UndoKeyAction | null {
  const modifierHeld = isMac ? e.metaKey : e.ctrlKey;
  if (!modifierHeld) return null;
  if (typeof e.key !== 'string') return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y') return e.key === 'Y' && e.shiftKey ? null : 'redo';
  return null;
}
