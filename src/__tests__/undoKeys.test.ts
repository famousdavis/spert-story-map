// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// B14 R-1: the one rule for the undo keys, as a table written out row by row.
// Mac: Cmd is the modifier and Ctrl is ignored. Elsewhere: Ctrl is the modifier and Cmd is ignored.
// The key is read case-insensitively: z undoes, Shift+z redoes. y redoes unless it is a capital "Y"
// with Shift held (ruling R57): a lowercase "y" with Shift still redoes, as before this rule.
import { describe, expect, it } from 'vitest';
import { isMacPlatform, undoKeyAction } from '../lib/undoKeys';

const NO_KEY = undefined;

// [isMac, metaKey (Cmd), ctrlKey, key, shiftKey, expected]
const ROWS: [boolean, boolean, boolean, string | undefined, boolean, 'undo' | 'redo' | null][] = [
  // Not a Mac, Cmd alone: Cmd is not the modifier here.
  [false, true , false, 'z'   , false, null],
  [false, true , false, 'z'   , true , null],
  [false, true , false, 'Z'   , false, null],
  [false, true , false, 'Z'   , true , null],
  [false, true , false, 'y'   , false, null],
  [false, true , false, 'y'   , true , null],
  [false, true , false, 'Y'   , false, null],
  [false, true , false, 'Y'   , true , null],
  [false, true , false, 'x'   , false, null],
  [false, true , false, 'x'   , true , null],
  [false, true , false, NO_KEY, false, null],
  [false, true , false, NO_KEY, true , null],
  // Not a Mac, Ctrl alone.
  [false, false, true , 'z'   , false, 'undo'],
  [false, false, true , 'z'   , true , 'redo'],
  [false, false, true , 'Z'   , false, 'undo'],
  [false, false, true , 'Z'   , true , 'redo'],
  [false, false, true , 'y'   , false, 'redo'],
  [false, false, true , 'y'   , true , 'redo'],
  [false, false, true , 'Y'   , false, 'redo'],
  [false, false, true , 'Y'   , true , null],
  [false, false, true , 'x'   , false, null],
  [false, false, true , 'x'   , true , null],
  [false, false, true , NO_KEY, false, null],
  [false, false, true , NO_KEY, true , null],
  // Not a Mac, Cmd and Ctrl: Cmd is ignored.
  [false, true , true , 'z'   , false, 'undo'],
  [false, true , true , 'z'   , true , 'redo'],
  [false, true , true , 'Z'   , false, 'undo'],
  [false, true , true , 'Z'   , true , 'redo'],
  [false, true , true , 'y'   , false, 'redo'],
  [false, true , true , 'y'   , true , 'redo'],
  [false, true , true , 'Y'   , false, 'redo'],
  [false, true , true , 'Y'   , true , null],
  [false, true , true , 'x'   , false, null],
  [false, true , true , 'x'   , true , null],
  [false, true , true , NO_KEY, false, null],
  [false, true , true , NO_KEY, true , null],
  // Not a Mac, no modifier.
  [false, false, false, 'z'   , false, null],
  [false, false, false, 'z'   , true , null],
  [false, false, false, 'Z'   , false, null],
  [false, false, false, 'Z'   , true , null],
  [false, false, false, 'y'   , false, null],
  [false, false, false, 'y'   , true , null],
  [false, false, false, 'Y'   , false, null],
  [false, false, false, 'Y'   , true , null],
  [false, false, false, 'x'   , false, null],
  [false, false, false, 'x'   , true , null],
  [false, false, false, NO_KEY, false, null],
  [false, false, false, NO_KEY, true , null],
  // Mac, Cmd alone.
  [true , true , false, 'z'   , false, 'undo'],
  [true , true , false, 'z'   , true , 'redo'],
  [true , true , false, 'Z'   , false, 'undo'],
  [true , true , false, 'Z'   , true , 'redo'],
  [true , true , false, 'y'   , false, 'redo'],
  [true , true , false, 'y'   , true , 'redo'],
  [true , true , false, 'Y'   , false, 'redo'],
  [true , true , false, 'Y'   , true , null],
  [true , true , false, 'x'   , false, null],
  [true , true , false, 'x'   , true , null],
  [true , true , false, NO_KEY, false, null],
  [true , true , false, NO_KEY, true , null],
  // Mac, Ctrl alone: Ctrl is not the modifier on a Mac.
  [true , false, true , 'z'   , false, null],
  [true , false, true , 'z'   , true , null],
  [true , false, true , 'Z'   , false, null],
  [true , false, true , 'Z'   , true , null],
  [true , false, true , 'y'   , false, null],
  [true , false, true , 'y'   , true , null],
  [true , false, true , 'Y'   , false, null],
  [true , false, true , 'Y'   , true , null],
  [true , false, true , 'x'   , false, null],
  [true , false, true , 'x'   , true , null],
  [true , false, true , NO_KEY, false, null],
  [true , false, true , NO_KEY, true , null],
  // Mac, Cmd and Ctrl: Ctrl is ignored, as before.
  [true , true , true , 'z'   , false, 'undo'],
  [true , true , true , 'z'   , true , 'redo'],
  [true , true , true , 'Z'   , false, 'undo'],
  [true , true , true , 'Z'   , true , 'redo'],
  [true , true , true , 'y'   , false, 'redo'],
  [true , true , true , 'y'   , true , 'redo'],
  [true , true , true , 'Y'   , false, 'redo'],
  [true , true , true , 'Y'   , true , null],
  [true , true , true , 'x'   , false, null],
  [true , true , true , 'x'   , true , null],
  [true , true , true , NO_KEY, false, null],
  [true , true , true , NO_KEY, true , null],
  // Mac, no modifier.
  [true , false, false, 'z'   , false, null],
  [true , false, false, 'z'   , true , null],
  [true , false, false, 'Z'   , false, null],
  [true , false, false, 'Z'   , true , null],
  [true , false, false, 'y'   , false, null],
  [true , false, false, 'y'   , true , null],
  [true , false, false, 'Y'   , false, null],
  [true , false, false, 'Y'   , true , null],
  [true , false, false, 'x'   , false, null],
  [true , false, false, 'x'   , true , null],
  [true , false, false, NO_KEY, false, null],
  [true , false, false, NO_KEY, true , null],
];

describe('undoKeyAction', () => {
  it('has the whole table: 2 platforms x 4 modifier sets x 6 keys x Shift on and off', () => {
    expect(ROWS).toHaveLength(96);
  });

  it.each(ROWS)('isMac=%s Cmd=%s Ctrl=%s key=%s Shift=%s -> %s', (isMac, metaKey, ctrlKey, key, shiftKey, expected) => {
    expect(undoKeyAction({ key, metaKey, ctrlKey, shiftKey }, isMac)).toBe(expected);
  });

  it('reads a key that is not text as no key', () => {
    expect(undoKeyAction({ key: 90, ctrlKey: true }, false)).toBeNull();
    expect(undoKeyAction({ key: null, metaKey: true }, true)).toBeNull();
  });

  it('returns nothing for a bare keydown event, which has no key and no modifiers', () => {
    expect(undoKeyAction(new Event('keydown') as unknown as KeyboardEvent, false)).toBeNull();
    expect(undoKeyAction(new Event('keydown') as unknown as KeyboardEvent, true)).toBeNull();
  });
});

describe('isMacPlatform', () => {
  it.each([
    ['MacIntel', true],
    ['Win32', false],
    ['', false],
  ] as const)('navigator.platform %j -> %s', (platform, expected) => {
    expect(isMacPlatform(platform)).toBe(expected);
  });
});
