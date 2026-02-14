/**
 * Renders column and theme drop-target highlights during drag operations.
 * Extracted from MapContent to reduce inline JSX complexity.
 */
export default function DropHighlight({ columns, themeSpans, totalHeight, highlightBackboneId, highlightThemeId, dragSourceThemeId }) {
  return (
    <>
      {/* Backbone column highlight (rib X-axis drag) */}
      {highlightBackboneId && columns.map(col => {
        if (col.backboneId !== highlightBackboneId) return null;
        return (
          <div
            key={`col-highlight-${col.backboneId}`}
            className="absolute bg-blue-100/40 border-2 border-blue-300 border-dashed rounded pointer-events-none"
            style={{
              left: col.x,
              top: 0,
              width: col.width,
              height: totalHeight,
              zIndex: 1,
            }}
          />
        );
      })}

      {/* Theme span highlight (backbone drag) */}
      {highlightThemeId && highlightThemeId !== dragSourceThemeId && themeSpans.map(ts => {
        if (ts.themeId !== highlightThemeId) return null;
        return (
          <div
            key={`theme-highlight-${ts.themeId}`}
            className="absolute bg-blue-100/30 border-2 border-blue-300 border-dashed rounded pointer-events-none"
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
