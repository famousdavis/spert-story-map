// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Buffered text input that decouples local typing from external state syncs.
 *
 * Pre-buffered behaviour: every keystroke fired `updateProduct`, which
 * triggered onProductChange echoes in cloud mode that wholesale-replaced the
 * product object mid-type, scrambling the input's cursor or wiping pending
 * characters. The buffered pattern commits on blur — so typing is local,
 * external state updates (echoes, undo/redo) only sync when the field is
 * unfocused, and Escape can revert without firing a save.
 *
 * Commit semantics:
 *   - onCommit fires only when the buffered value differs from the snapshot
 *     captured at focus. No-op blurs (focus→blur with no typing) do nothing.
 *   - revertValue suppresses the next blur commit (used by Escape).
 */
export function useBufferedField(externalValue: string, onCommit: (v: string) => void) {
  const [localValue, setLocalValue] = useState(externalValue);
  const focusedSnapshot = useRef(externalValue);
  const suppressNextBlur = useRef(false);
  const isFocused = useRef(false);

  // External → local sync, gated on focus state. setState-in-effect is the
  // whole point of this hook: a parent state change (cloud echo, undo/redo)
  // must propagate into the buffer when the user is not actively typing.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional buffered external→local sync */
  useEffect(() => {
    if (!isFocused.current) setLocalValue(externalValue);
  }, [externalValue]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleFocus = useCallback(() => {
    isFocused.current = true;
    focusedSnapshot.current = externalValue;
    suppressNextBlur.current = false;
  }, [externalValue]);

  const handleBlur = useCallback(() => {
    isFocused.current = false;
    if (suppressNextBlur.current) {
      suppressNextBlur.current = false;
      return;
    }
    if (localValue !== focusedSnapshot.current) onCommit(localValue);
  }, [localValue, onCommit]);

  const revertValue = useCallback(() => {
    suppressNextBlur.current = true;
    setLocalValue(focusedSnapshot.current);
  }, []);

  return { localValue, setLocalValue, handleFocus, handleBlur, revertValue };
}
