export default function ReleaseDivider({ lane, totalWidth, isFirst, isDropTarget }) {
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
        className="absolute flex items-start pt-2 px-2"
        style={{
          top: lane.y,
          left: 0,
          width: 106,
          height: lane.height,
        }}
        data-release-id={lane.releaseId}
      >
        <span className={`text-xs font-semibold px-2 py-1 rounded truncate max-w-full ${
          isDropTarget
            ? 'text-blue-700 bg-blue-200'
            : 'text-blue-600 bg-blue-50'
        }`}>
          {lane.releaseName}
        </span>
      </div>
    </>
  );
}
