/**
 * Expandable comment/notes panel for a progress table row.
 * Shows current sprint's comment input + history of past notes.
 */
export default function CommentPanel({
  rib, sprint, selectedSprint, rowKey,
  savedComment, commentDrafts, setCommentDrafts,
  updateComment, getCommentHistory, formatDate, editable,
}) {
  const draft = commentDrafts[rowKey] ?? savedComment;
  const history = getCommentHistory(rib, rib._releaseId);
  const pastHistory = history.filter(h => h.sprintId !== selectedSprint);

  const handleBlur = () => {
    const value = commentDrafts[rowKey];
    if (value !== undefined && value !== savedComment) {
      updateComment(rib.id, rib._releaseId, value);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <div className="max-w-xl space-y-3">
      {/* Current sprint comment input */}
      {editable ? (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {sprint?.name || 'Sprint'} assessment note
          </label>
          <textarea
            rows={2}
            value={draft}
            onChange={e => setCommentDrafts(prev => ({ ...prev, [rowKey]: e.target.value }))}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Why did we assess this progress level?"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:border-blue-300 focus:ring-1 focus:ring-blue-200 outline-none resize-y"
          />
        </div>
      ) : savedComment ? (
        <div>
          <span className="text-xs font-medium text-gray-500">{sprint?.name || 'Sprint'} note:</span>
          <p className="text-sm text-gray-600 mt-0.5">{savedComment}</p>
        </div>
      ) : null}

      {/* Comment history */}
      {pastHistory.length > 0 ? (
        <div className="space-y-2">
          <span className="text-xs font-medium text-gray-400">Prior notes</span>
          {pastHistory.map(entry => (
            <div key={`${entry.sprintId}-${entry.releaseId}`} className="border-l-2 border-gray-200 pl-3">
              <div className="text-xs text-gray-400">
                {entry.sprintName}
                {entry.updatedAt && <span> · {formatDate(entry.updatedAt)}</span>}
                {entry.percentComplete !== null && <span> · {entry.percentComplete}%</span>}
              </div>
              <div className="text-sm text-gray-600">{entry.comment}</div>
            </div>
          ))}
        </div>
      ) : !editable && !savedComment ? (
        <p className="text-xs text-gray-300 italic">No assessment notes yet.</p>
      ) : null}
    </div>
  );
}
