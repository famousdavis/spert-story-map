// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useId } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { formatDate } from '../../lib/formatDate';
import type { RibItem, Sprint } from '../../types';

interface CommentHistoryEntry {
  sprintId: string;
  releaseId: string;
  sprintName: string;
  comment: string;
  percentComplete: number | null;
  updatedAt?: string;
}

interface ProgressRib extends RibItem {
  _releaseId?: string;
}

interface CommentPanelProps {
  rib: ProgressRib;
  sprint: Sprint | undefined;
  selectedSprint: string;
  rowKey: string;
  savedComment: string;
  commentDrafts: Record<string, string>;
  setCommentDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  updateComment: (ribId: string, releaseId: string | undefined, comment: string) => void;
  getCommentHistory: (rib: ProgressRib, releaseId?: string) => CommentHistoryEntry[];
  editable: boolean;
}

/**
 * Expandable comment/notes panel for a progress table row.
 * Shows current sprint's comment input + history of past notes.
 */
export default function CommentPanel({
  rib, sprint, selectedSprint, rowKey,
  savedComment, commentDrafts, setCommentDrafts,
  updateComment, getCommentHistory, editable,
}: CommentPanelProps) {
  const draft = commentDrafts[rowKey] ?? savedComment;
  const history = getCommentHistory(rib, rib._releaseId);
  const pastHistory = history.filter(h => h.sprintId !== selectedSprint);
  const noteId = useId();

  const handleBlur = (): void => {
    const value = commentDrafts[rowKey];
    if (value !== undefined && value !== savedComment) {
      updateComment(rib.id, rib._releaseId, value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <div className="max-w-xl space-y-3">
      {/* Current sprint comment input */}
      {editable ? (
        <div>
          <label htmlFor={noteId} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            {sprint?.name || 'Sprint'} assessment note
          </label>
          <textarea
            id={noteId}
            name="sprintAssessmentNote"
            rows={2}
            value={draft}
            onChange={e => setCommentDrafts(prev => ({ ...prev, [rowKey]: e.target.value }))}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Why did we assess this progress level?"
            className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:border-blue-300 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-500 outline-none resize-y"
          />
        </div>
      ) : savedComment ? (
        <div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{sprint?.name || 'Sprint'} note:</span>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{savedComment}</p>
        </div>
      ) : null}

      {/* Comment history */}
      {pastHistory.length > 0 ? (
        <div className="space-y-2">
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">Prior notes</span>
          {pastHistory.map(entry => (
            <div key={`${entry.sprintId}-${entry.releaseId}`} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3">
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {entry.sprintName}
                {entry.updatedAt && <span> · {formatDate(entry.updatedAt)}</span>}
                {entry.percentComplete !== null && <span> · {entry.percentComplete}%</span>}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{entry.comment}</div>
            </div>
          ))}
        </div>
      ) : !editable && !savedComment ? (
        <p className="text-xs text-gray-300 dark:text-gray-600 italic">No assessment notes yet.</p>
      ) : null}
    </div>
  );
}
