import { useEffect, Fragment } from 'react';
import { getRibItemPoints } from '../../lib/calculations';
import ProgressBar from '../ui/ProgressBar';
import CommentPanel from './CommentPanel';

export default function ProgressRow({
  rib, idx, sprint, prevSprint, selectedSprint,
  showTargetCol, totalCols, expandedRows, toggleRow,
  commentDrafts, setCommentDrafts, progressDrafts, setProgressDrafts,
  getSprintPct, getCurrentPct, getDelta, getCommentCount, getCommentHistory,
  updateProgress, removeProgress, updateComment, formatDate, sizeMapping,
}) {
  const rowKey = `${rib.id}-${rib._releaseId || idx}`;
  const isExpanded = expandedRows.has(rowKey);
  const pts = getRibItemPoints(rib, sizeMapping);
  const currentPct = getCurrentPct(rib, rib._releaseId);
  const sprintPct = getSprintPct(rib, rib._releaseId);
  const delta = getDelta(rib, rib._releaseId);
  const maxPct = rib._allocPct || 100;
  const progressBarPct = rib._allocPct
    ? (rib._allocPct > 0 ? (currentPct / rib._allocPct) * 100 : 0)
    : currentPct;
  const commentCount = getCommentCount(rib, rib._releaseId);

  // Get current sprint's comment
  const currentEntry = rib.progressHistory?.find(
    p => p.sprintId === selectedSprint && (rib._releaseId ? p.releaseId === rib._releaseId : true)
  );
  const savedComment = currentEntry?.comment || '';

  // Initialize comment draft when expanding
  useEffect(() => {
    if (isExpanded && commentDrafts[rowKey] === undefined && savedComment) {
      setCommentDrafts(prev => prev[rowKey] === undefined ? { ...prev, [rowKey]: savedComment } : prev);
    }
  }, [isExpanded, rowKey, savedComment, commentDrafts, setCommentDrafts]);

  return (
    <Fragment>
      <tr className={`hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-blue-50/30' : ''}`}>
        <td className="px-3 py-2 cursor-pointer select-none" onClick={() => toggleRow(rowKey)}>
          <div className="flex items-center gap-1.5">
            <span className={`text-gray-400 text-[10px] transition-transform duration-150 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-800 truncate">{rib.name}</span>
                {commentCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 flex-shrink-0" title={`${commentCount} note${commentCount > 1 ? 's' : ''}`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    {commentCount}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 truncate">{rib.backboneName}</div>
            </div>
          </div>
        </td>
        <td className="text-center px-2 py-2">
          <span className="text-xs text-gray-500">{rib.size || '—'}</span>
        </td>
        <td className="text-center px-2 py-2">
          <span className="text-xs text-gray-500 tabular-nums">
            {pts ? (rib._allocPct ? Math.round(pts * rib._allocPct / 100) : pts) : '—'}
          </span>
        </td>
        {showTargetCol && (
          <td className="text-center px-2 py-2">
            <span className="text-xs text-gray-500 tabular-nums">{rib._allocPct}%</span>
          </td>
        )}
        <td className="text-center px-2 py-2">
          <span className="text-sm font-medium text-gray-700 tabular-nums">{currentPct}%</span>
        </td>
        <td className="text-center px-2 py-2">
          {rib._editable ? (
            <input
              type="number"
              min={0}
              max={maxPct}
              value={progressDrafts[rowKey] ?? sprintPct ?? ''}
              placeholder="—"
              onClick={e => e.stopPropagation()}
              onFocus={() => {
                if (progressDrafts[rowKey] === undefined) {
                  setProgressDrafts(prev => ({ ...prev, [rowKey]: sprintPct ?? '' }));
                }
              }}
              onChange={e => {
                setProgressDrafts(prev => ({ ...prev, [rowKey]: e.target.value }));
              }}
              onBlur={() => {
                const raw = progressDrafts[rowKey];
                if (raw === undefined) return;
                if (raw === '' || raw === null) {
                  removeProgress(rib.id, rib._releaseId);
                } else {
                  const val = parseInt(raw, 10);
                  if (!isNaN(val) && val >= 0 && val <= maxPct) {
                    updateProgress(rib.id, rib._releaseId, val);
                  }
                }
                setProgressDrafts(prev => { const next = { ...prev }; delete next[rowKey]; return next; });
              }}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
              className="w-14 border border-gray-200 rounded px-1 py-1 text-sm text-center focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
            />
          ) : (
            <span className="text-sm text-gray-500 tabular-nums">{sprintPct ?? '—'}%</span>
          )}
        </td>
        {prevSprint && (
          <td className="text-center px-2 py-2">
            {delta !== null ? (
              <span className={`text-xs font-medium tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {delta > 0 ? '+' : ''}{delta}%
              </span>
            ) : (
              <span className="text-xs text-gray-300">—</span>
            )}
          </td>
        )}
        <td className="px-2 py-2">
          <ProgressBar percent={progressBarPct} height="h-1.5" />
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={totalCols} className="px-4 py-3 bg-gray-50/60 border-t border-gray-100">
            <CommentPanel
              rib={rib}
              sprint={sprint}
              selectedSprint={selectedSprint}
              rowKey={rowKey}
              savedComment={savedComment}
              commentDrafts={commentDrafts}
              setCommentDrafts={setCommentDrafts}
              updateComment={updateComment}
              getCommentHistory={getCommentHistory}
              formatDate={formatDate}
              editable={rib._editable}
            />
          </td>
        </tr>
      )}
    </Fragment>
  );
}
