import { useState, useRef, useEffect } from 'react';

export default function InlineEdit({ value, onSave, className = '', placeholder = 'Click to edit', tag: Tag = 'span', inputClassName = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

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

  const handleKeyDown = (e) => {
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
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={`border border-blue-400 rounded px-1.5 py-0.5 text-sm outline-none focus:ring-2 focus:ring-blue-300 bg-white ${inputClassName}`}
      />
    );
  }

  return (
    <Tag
      className={`cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 transition-colors ${!value ? 'text-gray-400 italic' : ''} ${className}`}
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
