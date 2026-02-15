import { LANE_LABEL_WIDTH } from './useMapLayout';

/**
 * Renders the "Unassigned" lane at the bottom of the story map.
 * Extracted from MapContent for readability.
 */
export default function UnassignedLane({ lane, totalWidth, isDropTarget, onAddRelease }) {
  return (
    <>
      <div
        className={`absolute left-0 transition-colors ${
          isDropTarget ? 'bg-blue-100/60 dark:bg-blue-900/30' : 'bg-amber-50/40 dark:bg-amber-900/20'
        }`}
        style={{
          top: lane.y,
          width: totalWidth,
          height: lane.height,
        }}
      />
      <div
        className={`absolute left-0 h-px border-t border-dashed ${
          isDropTarget ? 'border-blue-400 dark:border-blue-500' : 'border-amber-300 dark:border-amber-700'
        }`}
        style={{
          top: lane.y,
          width: totalWidth,
        }}
      />
      <div
        className="absolute flex items-start pt-2 px-2"
        style={{
          top: lane.y,
          left: 0,
          width: LANE_LABEL_WIDTH,
          height: lane.height,
        }}
      >
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-1 rounded">
          Unassigned
        </span>
      </div>
      {/* + Release button at right end of divider line */}
      {onAddRelease && (
        <button
          className="absolute bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300 text-[10px] font-medium rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
          style={{ left: totalWidth + 8, top: lane.y - 8 }}
          onClick={() => onAddRelease(null)}
          title="Add release here"
        >
          + Release
        </button>
      )}
    </>
  );
}
