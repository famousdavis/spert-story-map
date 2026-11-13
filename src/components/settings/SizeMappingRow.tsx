// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useId, useRef, useState } from 'react';
import { useBufferedField } from '../../hooks/useBufferedField';
import { MAX_SIZE_LABEL } from '../../lib/settingsMutations';
import type { SizeMapping } from '../../types';
import { quoted } from './sizeMappingText';

export type SizeRowField = 'label' | 'points' | 'remove';

interface SizeMappingRowProps {
  row: SizeMapping;
  index: number;
  /** The row's refusal or reason line, and the control it is about. */
  reason: { text: string; field: SizeRowField } | null;
  /** Lines that report what a write did (a revival). */
  info: string[];
  /** The "at 0 points" line under a row added back during this visit. Describes the points field. */
  zero: string | null;
  /** R37's note, under the effective row a locked item uses. Shown while its points are being edited. */
  note: string | null;
  /** Each returns whether it wrote. When it did not, the field shows the stored value again. */
  onRename: (index: number, expectedLabel: string, text: string) => boolean;
  onPoints: (index: number, expectedLabel: string, text: string) => boolean;
  onRemove: (index: number, label: string) => void;
}

const INPUT = 'w-24 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1.5 text-sm text-center aria-[invalid=true]:border-red-500';

/**
 * One size row. Both fields are buffered (`useBufferedField`, unchanged): they save on blur
 * or Enter, Enter keeps focus, Escape reverts. The hook is used directly, not through
 * `BufferedText`, because a refused value must be replaced by the stored one
 * (`setLocalValue`) and Enter must not send focus to the page.
 *
 * `expected` is the label this row showed when the edit started. Every write passes it,
 * so a list changed underneath a focused field (another editor, in cloud storage) refuses the
 * write instead of landing on whatever row now sits at this index (rows are `key={i}`).
 */
export default function SizeMappingRow({ row, index, reason, info, zero, note, onRename, onPoints, onRemove }: SizeMappingRowProps) {
  const label = String(row.label ?? '');
  const points = String(row.points ?? '');
  const id = useId();
  const expected = useRef(label);
  const focused = useRef(false);
  // Escape blurs, and the blur must not save what was typed. Not `revertValue`: when
  // focus stays it suppresses the NEXT blur too, which drops the following edit.
  const escaping = useRef(false);
  const labelRef = useRef<HTMLInputElement | null>(null);
  const pointsRef = useRef<HTMLInputElement | null>(null);
  const [refocus, setRefocus] = useState<{ field: 'label' | 'points'; n: number } | null>(null);
  const [pointsFocused, setPointsFocused] = useState(false);

  // While no field has focus, the expected label follows the stored one (a field can
  // be blurred without having been focused, as `fireEvent` does).
  useEffect(() => { if (!focused.current) expected.current = label; }, [label]);
  // Enter blurred to save; focus comes back after the re-render, so the hook's focus
  // snapshot, and `expected`, are the label just saved.
  useEffect(() => {
    if (refocus) (refocus.field === 'label' ? labelRef : pointsRef).current?.focus();
  }, [refocus]);

  const labelField = useBufferedField(label, (text: string): void => {
    if (escaping.current) { escaping.current = false; labelField.setLocalValue(label); return; }
    if (!onRename(index, expected.current, text)) labelField.setLocalValue(label);
  });
  const pointsField = useBufferedField(points, (text: string): void => {
    if (escaping.current) { escaping.current = false; pointsField.setLocalValue(points); return; }
    if (!onPoints(index, expected.current, text)) pointsField.setLocalValue(points);
  });

  const onFocus = (field: ReturnType<typeof useBufferedField>) => {
    focused.current = true;
    expected.current = label;
    escaping.current = false;
    field.handleFocus();
  };
  const onBlur = (field: ReturnType<typeof useBufferedField>) => {
    focused.current = false;
    field.handleBlur();
  };
  const onKeyDown = (which: 'label' | 'points', stored: string, field: ReturnType<typeof useBufferedField>) =>
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        setRefocus(r => ({ field: which, n: (r?.n ?? 0) + 1 }));
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        escaping.current = true;
        field.setLocalValue(stored);
        e.currentTarget.blur();
      }
    };

  const reasonId = `${id}-reason`;
  const noteId = `${id}-note`;
  const zeroId = `${id}-zero`;
  const showNote = note !== null && (pointsFocused || pointsField.localValue !== points);
  const describe = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <div className="flex items-center gap-3">
        <input
          ref={labelRef}
          type="text"
          name="sizeLabel"
          autoComplete="off"
          maxLength={MAX_SIZE_LABEL}
          aria-label={`Label of size ${quoted(label)}`}
          aria-invalid={reason?.field === 'label' || undefined}
          aria-describedby={describe(reason?.field === 'label' && reasonId)}
          data-size-label={index}
          value={labelField.localValue}
          onChange={e => labelField.setLocalValue(e.target.value)}
          onFocus={() => onFocus(labelField)}
          onBlur={() => onBlur(labelField)}
          onKeyDown={onKeyDown('label', label, labelField)}
          className={INPUT}
          placeholder="Label"
        />
        <input
          ref={pointsRef}
          type="number"
          name="sizePoints"
          autoComplete="off"
          min={0}
          step="any"
          aria-label={`Points of size ${quoted(label)}`}
          aria-invalid={reason?.field === 'points' || undefined}
          aria-describedby={describe(note !== null && noteId, zero !== null && zeroId, reason?.field === 'points' && reasonId)}
          data-size-points={index}
          value={pointsField.localValue}
          onChange={e => pointsField.setLocalValue(e.target.value)}
          onFocus={() => { setPointsFocused(true); onFocus(pointsField); }}
          onBlur={() => { setPointsFocused(false); onBlur(pointsField); }}
          onKeyDown={onKeyDown('points', points, pointsField)}
          className={INPUT}
          placeholder="Points"
        />
        <span className="text-xs text-gray-400 dark:text-gray-500">pts</span>
        <button
          onClick={() => onRemove(index, label)}
          aria-label={`Remove ${quoted(label)}`}
          aria-describedby={describe(reason?.field === 'remove' && reasonId)}
          data-size-remove={index}
          className="text-red-400 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400 text-sm ml-auto"
        >
          Remove
        </button>
      </div>
      {reason && <p id={reasonId} className="mt-1 text-xs text-red-600 dark:text-red-400">{reason.text}</p>}
      {info.map(line => <p key={line} className="mt-1 text-xs text-gray-600 dark:text-gray-400">{line}</p>)}
      {zero !== null && <p id={zeroId} className="mt-1 text-xs text-gray-600 dark:text-gray-400">{zero}</p>}
      {note !== null && (
        <p id={noteId} hidden={!showNote} className="mt-1 text-xs text-amber-700 dark:text-amber-400">{note}</p>
      )}
    </div>
  );
}
