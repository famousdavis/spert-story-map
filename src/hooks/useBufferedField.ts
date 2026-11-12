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
 *     A blur that commits wins: last writer wins.
 *   - revertValue suppresses the next blur commit (used by Escape).
 *   - A blur that commits nothing, and revertValue, show the LATEST external
 *     value, not the focus-time one. While focused the field ignores outside
 *     changes, so a value that arrived meanwhile (Connect AI, a collaborator,
 *     undo) would otherwise stay hidden behind the old text, and the next
 *     focus-and-blur would write that old text back over it.
 *
 * `externalValue` inside the handlers is the latest value: React attaches the
 * handlers of the latest render. It is read there, not from a ref written in
 * the sync effect below, which runs after the render and so can lag it.
 */
export function useBufferedField(externalValue: string, onCommit: (v: string) => void) {
  const [localValue, setLocalValue] = useState(externalValue);
  const focusedSnapshot = useRef(externalValue);
  const suppressNextBlur = useRef(false);
  const isFocused = useRef(false);

  // External → local sync, gated on focus state. setState-in-effect is the
  // whole point of this hook: a parent state change (cloud echo, undo/redo)
  // must propagate into the buffer when the user is not actively typing.
  useEffect(() => {
    if (!isFocused.current) setLocalValue(externalValue);
  }, [externalValue]);

  const handleFocus = useCallback(() => {
    isFocused.current = true;
    focusedSnapshot.current = externalValue;
    suppressNextBlur.current = false;
  }, [externalValue]);

  const handleBlur = useCallback(() => {
    isFocused.current = false;
    if (suppressNextBlur.current) {
      suppressNextBlur.current = false;
      setLocalValue(externalValue);
      return;
    }
    if (localValue !== focusedSnapshot.current) onCommit(localValue);
    else setLocalValue(externalValue);
  }, [localValue, onCommit, externalValue]);

  const revertValue = useCallback(() => {
    suppressNextBlur.current = true;
    setLocalValue(externalValue);
  }, [externalValue]);

  return { localValue, setLocalValue, handleFocus, handleBlur, revertValue };
}
