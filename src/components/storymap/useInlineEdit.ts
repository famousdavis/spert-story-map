// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useState, useRef, useEffect } from 'react';

/**
 * Shared inline-edit hook for map header/cell components.
 *
 * Returns state + handlers for a double-click-to-edit text field:
 *   editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown
 *
 * Automatically syncs `draft` when `value` changes externally (e.g. undo)
 * while not in edit mode.
 */
export default function useInlineEdit(value: string, onCommit: (trimmed: string) => void) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync draft when not editing (e.g. after undo)
  if (!editing && draft !== value) {
    setDraft(value);
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    } else {
      setDraft(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  const startEditing = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditing(true);
  };

  return { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown };
}
