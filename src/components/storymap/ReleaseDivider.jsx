import { useRef } from 'react';
import { LANE_LABEL_WIDTH } from './useMapLayout';
import useInlineEdit from './useInlineEdit';

export default function ReleaseDivider({ lane, totalWidth, isFirst, isDropTarget, onRename, onAddRelease, onClick }) {
  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(lane.releaseName, (name) => onRename(lane.releaseId, name));

  // Click/double-click disambiguation: single-click opens detail panel, double-click edits
  const clickTimer = useRef(null);
  const handleClick = (e) => {
    e.stopPropagation();
    if (clickTimer.current) return; // already waiting for dblclick
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      if (onClick) onClick(lane.releaseId);
    }, 200);
  };
  const handleDoubleClick = (e) => {
    e.stopPropagation();
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    startEditing();
  };

  return (
    <>
      {/* Lane background — highlight when drop target */}
      <div
        className={`absolute left-0 transition-colors ${isDropTarget ? 'bg-blue-100/60' : ''}`}
        style={{
          top: lane.y,
          width: totalWidth,
          height: lane.height,
        }}
      />
      {/* Horizontal divider line at top of lane */}
      <div
        className={`absolute left-0 ${
          isDropTarget
            ? 'h-0.5 bg-blue-400'
            : isFirst ? 'h-px bg-blue-300' : 'h-px bg-blue-200'
        }`}
        style={{
          top: lane.y,
          width: totalWidth,
        }}
      />
      {/* Release label on left */}
      <div
        className="absolute flex items-start pt-2 px-2 pointer-events-none"
        style={{
          top: lane.y,
          left: 0,
          width: LANE_LABEL_WIDTH,
          height: lane.height,
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
            className="pointer-events-auto text-xs font-semibold text-blue-700 bg-white/80 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-300 w-full border-0"
          />
        ) : (
          <span
            className={`pointer-events-auto text-xs font-semibold px-2 py-1 rounded truncate max-w-full cursor-pointer ${
              isDropTarget
                ? 'text-blue-700 bg-blue-200'
                : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
            }`}
            data-release-id={lane.releaseId}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            title="Click for details · Double-click to rename"
          >
            {lane.releaseName}
          </span>
        )}
      </div>
      {/* + Release button at right end of divider line */}
      {onAddRelease && (
        <button
          className="absolute bg-blue-50 hover:bg-blue-100 text-blue-400 hover:text-blue-600 text-[10px] font-medium rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
          style={{ left: totalWidth + 8, top: lane.y - 8 }}
          onClick={() => onAddRelease(lane.releaseId)}
          title="Add release here"
        >
          + Release
        </button>
      )}
    </>
  );
}
