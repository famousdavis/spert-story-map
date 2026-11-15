// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.56.1 (R71 R-4, R91 D2): choosing Cloud with Local products lists every product in this browser,
// archived ones too, none ticked. Only the ticked ones are uploaded; with none ticked the switch
// happens without an upload. Each row shows when the product was last edited, so two copies of one
// template can be told apart.

import { useId, useState } from 'react';
import Modal from '../ui/Modal';
import { lastEditedText, UPLOAD_CHOICE_INTRO } from './uploadChoiceText';

export interface UploadRow { id: string; name: string; updatedAt?: string }

interface Props {
  open: boolean;
  rows: UploadRow[];
  onCancel: () => void;
  /** The ticked ids, possibly none. */
  onConfirm: (ids: string[]) => void;
}

export default function UploadChoiceDialog({ open, rows, onCancel, onConfirm }: Props) {
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const baseId = useId();
  const all = rows.length > 0 && ticked.size === rows.length;
  const toggle = (id: string) => setTicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const n = ticked.size;
  const confirmLabel = n === 0 ? 'Use Cloud without uploading' : `Upload ${n} product${n === 1 ? '' : 's'}`;

  return (
    <Modal open={open} onClose={onCancel} title="Upload Local Products" wide>
      <form
        aria-label="Upload Local Products"
        onSubmit={e => { e.preventDefault(); onConfirm(rows.filter(r => ticked.has(r.id)).map(r => r.id)); }}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{UPLOAD_CHOICE_INTRO}</p>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
          <input
            type="checkbox"
            name="uploadSelectAll"
            checked={all}
            onChange={() => setTicked(all ? new Set() : new Set(rows.map(r => r.id)))}
          />
          Select all
        </label>
        <ul className="max-h-72 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 mb-4">
          {rows.map((row, i) => (
            <li key={row.id} className="px-3 py-2">
              <label htmlFor={`${baseId}-${i}`} className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
                <input
                  id={`${baseId}-${i}`}
                  type="checkbox"
                  name="uploadProduct"
                  value={row.id}
                  aria-label={row.name}
                  checked={ticked.has(row.id)}
                  onChange={() => toggle(row.id)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block break-words">{row.name}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{lastEditedText(row.updatedAt)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
