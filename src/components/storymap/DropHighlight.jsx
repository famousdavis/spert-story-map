/**
 * Renders column, lane, and cell intersection highlights during drag operations.
 * Shows a "crosshair" effect for 2D rib drags (column + lane + intersection).
 */
export default function DropHighlight({
  columns, themeSpans, releaseLanes, unassignedLane, totalHeight,
  highlightBackboneId, highlightReleaseId, highlightThemeId, dragSourceThemeId,
}) {
  // Find highlighted column and lane for cell intersection
  const col = highlightBackboneId ? columns.find(c => c.backboneId === highlightBackboneId) : null;
  const lane = highlightReleaseId !== undefined
    ? (highlightReleaseId === null
      ? unassignedLane
      : releaseLanes?.find(l => l.releaseId === highlightReleaseId))
    : null;

  return (
    <>
      {/* Backbone column highlight (rib drag) */}
      {col && (
        <div
          className="absolute bg-blue-100/30 dark:bg-blue-500/10 border-2 border-blue-300 dark:border-blue-500 border-dashed rounded pointer-events-none"
          style={{
            left: col.x,
            top: 0,
            width: col.width,
            height: totalHeight,
            zIndex: 1,
          }}
        />
      )}

      {/* Cell intersection highlight (column + lane overlap) */}
      {col && lane && (
        <div
          className="absolute bg-blue-200/40 dark:bg-blue-500/20 border-2 border-blue-400 dark:border-blue-500 rounded pointer-events-none"
          style={{
            left: col.x,
            top: lane.y,
            width: col.width,
            height: lane.height,
            zIndex: 2,
          }}
        />
      )}

      {/* Theme span highlight (backbone drag) */}
      {highlightThemeId && highlightThemeId !== dragSourceThemeId && themeSpans.map(ts => {
        if (ts.themeId !== highlightThemeId) return null;
        return (
          <div
            key={`theme-highlight-${ts.themeId}`}
            className="absolute bg-blue-100/30 dark:bg-blue-500/10 border-2 border-blue-300 dark:border-blue-500 border-dashed rounded pointer-events-none"
            style={{
              left: ts.x,
              top: 0,
              width: ts.width,
              height: totalHeight,
              zIndex: 1,
            }}
          />
        );
      })}
    </>
  );
}
