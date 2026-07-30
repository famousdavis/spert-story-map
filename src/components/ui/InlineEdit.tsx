// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useRef, useEffect } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
  tag?: keyof React.JSX.IntrinsicElements;
  inputClassName?: string;
}

export default function InlineEdit({ value, onSave, className = '', placeholder = 'Click to edit', tag = 'span', inputClassName = '' }: InlineEditProps) {
  const Tag = tag;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft from external value only when NOT editing — otherwise an
  // onProductChange echo arriving mid-edit would overwrite the user's
  // in-progress text. setState-in-effect is intentional here: the effect
  // mirrors external state into local state on the (editing → !editing)
  // transition; without it, the field would keep showing a stale draft
  // after Escape or after a wholesale cloud-echo product replacement.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional external→local sync */
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) {
      onSave(draft.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit();
    } else if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        name="inlineEdit"
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={`border border-blue-400 dark:border-blue-500 rounded px-1.5 py-0.5 text-sm outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full ${inputClassName}`}
      />
    );
  }

  return (
    <Tag
      className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1 py-0.5 transition-colors ${!value ? 'text-gray-400 dark:text-gray-500 italic' : ''} ${className}`}
      onClick={() => setEditing(true)}
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') setEditing(true); }}
      role="button"
      aria-label={`Edit ${value || placeholder}`}
    >
      {value || placeholder}
    </Tag>
  );
}
