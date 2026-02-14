/**
 * Renders the "Unassigned" lane at the bottom of the story map.
 * Extracted from MapContent for readability.
 */
export default function UnassignedLane({ lane, totalWidth, isDropTarget }) {
  return (
    <>
      <div
        className={`absolute left-0 transition-colors ${
          isDropTarget ? 'bg-blue-100/60' : 'bg-amber-50/40'
        }`}
        style={{
          top: lane.y,
          width: totalWidth,
          height: lane.height,
        }}
      />
      <div
        className={`absolute left-0 h-px border-t border-dashed ${
          isDropTarget ? 'border-blue-400' : 'border-amber-300'
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
          width: 106,
          height: lane.height,
        }}
      >
        <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-1 rounded">
          Unassigned
        </span>
      </div>
    </>
  );
}
