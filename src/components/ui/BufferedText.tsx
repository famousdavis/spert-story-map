// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useBufferedField } from '../../hooks/useBufferedField';

/**
 * Commit-on-blur text input, buffered against external state syncs.
 *
 * Each field is its own component instance so `useBufferedField`'s local state
 * is keyed per element. Without that isolation, switching focus between rows
 * would leak draft text between sibling rows of the same kind. Callers hold the
 * per-row commit handlers; this just routes value/handlers into the element.
 *
 * Extracted from `SettingsView` in v0.52.15 so the `required` behaviour below
 * could be tested without mounting the whole page.
 */
interface BufferedTextProps {
  value: string;
  onCommit: (v: string) => void;
  id?: string;
  name?: string;
  className?: string;
  rows?: number;
  multiline?: boolean;
  /**
   * Refuse to commit a blank value: blur and Enter revert to what was there on
   * focus, exactly as Escape does.
   *
   * ⚠️ Set this on every field `validateProduct` requires to be non-empty —
   * today the product, release and sprint names (`validateProduct.ts` :265,
   * :277, :292). Without it the UI can write a value the importer rejects, so a
   * user can build a project that cannot be exported and read back. Theme,
   * backbone and rib names are deliberately NOT in that set: the validator
   * accepts an empty one, so nothing downstream breaks.
   *
   * This stops new blanks being written. It does NOT repair an existing one —
   * reverting restores the value held at focus, which may itself be blank. That
   * is deliberate: the field should not invent a name the user never typed.
   */
  required?: boolean;
}

export default function BufferedText({
  value, onCommit, id, name, className, rows, multiline, required,
}: BufferedTextProps) {
  const { localValue, setLocalValue, handleFocus, handleBlur, revertValue } =
    useBufferedField(value, onCommit);

  // `revertValue` suppresses the commit AND restores the focus snapshot;
  // `handleBlur` must still run, because it is what clears the hook's focused
  // flag — and that flag is what re-enables the external→local sync. Skipping
  // it would leave the field deaf to cloud echoes and undo until refocused.
  const onBlur = () => {
    if (required && !localValue.trim()) revertValue();
    handleBlur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      revertValue();
      (e.target as HTMLElement).blur();
    } else if (e.key === 'Enter' && !multiline) {
      (e.target as HTMLElement).blur();
    }
  };

  if (multiline) {
    return (
      <textarea
        id={id}
        name={name}
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        rows={rows}
        className={className}
      />
    );
  }
  return (
    <input
      id={id}
      name={name}
      type="text"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onFocus={handleFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={className}
    />
  );
}
