import { CELL_HEIGHT, CELL_GAP, CELL_PAD, THEME_HEIGHT, BACKBONE_HEIGHT, COL_WIDTH, COL_GAP } from './useMapLayout';

/**
 * Renders insertion indicators during drag operations:
 * - Horizontal blue line for rib drags (shows where card will be inserted)
 * - Vertical blue line for backbone drags (shows where column will be inserted)
 */
export default function InsertionIndicator({ dragState, layout }) {
  if (!dragState?.isDragging) return null;
  if (dragState.insertIndex == null) return null;

  if (dragState.dragType === 'theme') {
    return <ThemeInsertionLine dragState={dragState} layout={layout} />;
  }

  if (dragState.dragType === 'backbone') {
    return <BackboneInsertionLine dragState={dragState} layout={layout} />;
  }

  if (dragState.dragType === 'rib') {
    return <RibInsertionLine dragState={dragState} layout={layout} />;
  }

  return null;
}

function RibInsertionLine({ dragState, layout }) {
  const { targetBackboneId, targetReleaseId, insertIndex } = dragState;
  const { columns, cells, releaseLanes, unassignedLane } = layout;

  const col = columns.find(c => c.backboneId === targetBackboneId);
  if (!col) return null;

  // Find cells in the target column + lane (excluding dragged ribs)
  const excludeIds = dragState.selectedIds || new Set([dragState.ribId]);
  const laneCells = cells
    .filter(c =>
      c.backboneId === targetBackboneId &&
      (targetReleaseId === null ? c.releaseId === null : c.releaseId === targetReleaseId) &&
      !excludeIds.has(c.id)
    )
    .sort((a, b) => a.y - b.y);

  // Find the lane for Y bounds
  const lane = targetReleaseId === null
    ? unassignedLane
    : releaseLanes.find(l => l.releaseId === targetReleaseId);
  if (!lane) return null;

  // Compute Y position of the insertion line
  let lineY;
  if (laneCells.length === 0 || insertIndex === 0) {
    lineY = lane.y + CELL_PAD;
  } else if (insertIndex >= laneCells.length) {
    const lastCell = laneCells[laneCells.length - 1];
    lineY = lastCell.y + CELL_HEIGHT + CELL_GAP / 2;
  } else {
    lineY = laneCells[insertIndex].y - CELL_GAP / 2;
  }

  return (
    <div
      className="absolute bg-blue-500 rounded-full pointer-events-none"
      style={{
        left: col.x + 4,
        top: lineY,
        width: col.width - 8,
        height: 2,
        zIndex: 40,
      }}
    >
      <div className="absolute -left-1 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
      <div className="absolute -right-1 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
    </div>
  );
}

function ThemeInsertionLine({ dragState, layout }) {
  const { themeId, insertIndex } = dragState;
  const { themeSpans, totalHeight } = layout;

  // Get theme spans excluding the dragged theme
  const otherSpans = themeSpans
    .filter(ts => ts.themeId !== themeId)
    .sort((a, b) => a.x - b.x);

  // Compute X position of the vertical insertion line
  let lineX;
  if (otherSpans.length === 0 || insertIndex === 0) {
    const firstSpan = otherSpans[0] || themeSpans.find(ts => ts.themeId === themeId);
    if (!firstSpan) return null;
    lineX = firstSpan.x - COL_GAP / 2;
  } else if (insertIndex >= otherSpans.length) {
    const lastSpan = otherSpans[otherSpans.length - 1];
    lineX = lastSpan.x + lastSpan.width + COL_GAP / 2;
  } else {
    lineX = otherSpans[insertIndex].x - COL_GAP / 2;
  }

  return (
    <div
      className="absolute bg-blue-500 rounded-full pointer-events-none"
      style={{
        left: lineX,
        top: 0,
        width: 3,
        height: totalHeight,
        zIndex: 40,
      }}
    >
      <div className="absolute -left-1 -top-1 w-3 h-3 bg-blue-500 rounded-full" />
      <div className="absolute -left-1 -bottom-1 w-3 h-3 bg-blue-500 rounded-full" />
    </div>
  );
}

function BackboneInsertionLine({ dragState, layout }) {
  const { targetThemeId, insertIndex, backboneId } = dragState;
  const { columns, totalHeight } = layout;

  // Get columns in the target theme, excluding the dragged backbone
  const themeCols = columns
    .filter(c => c.themeId === targetThemeId && c.backboneId !== backboneId)
    .sort((a, b) => a.x - b.x);

  // Compute X position of the vertical insertion line
  let lineX;
  if (themeCols.length === 0 || insertIndex === 0) {
    // Before first column (or empty theme): left edge of where first column would be
    const firstCol = themeCols[0] || columns.find(c => c.themeId === targetThemeId);
    if (!firstCol) return null;
    lineX = firstCol.x - COL_GAP / 2;
  } else if (insertIndex >= themeCols.length) {
    // After last column
    const lastCol = themeCols[themeCols.length - 1];
    lineX = lastCol.x + COL_WIDTH + COL_GAP / 2;
  } else {
    // Between columns
    lineX = themeCols[insertIndex].x - COL_GAP / 2;
  }

  const lineTop = THEME_HEIGHT;
  const lineHeight = totalHeight - THEME_HEIGHT;

  return (
    <div
      className="absolute bg-blue-500 rounded-full pointer-events-none"
      style={{
        left: lineX,
        top: lineTop,
        width: 2,
        height: lineHeight,
        zIndex: 40,
      }}
    >
      <div className="absolute -left-1 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
      <div className="absolute -left-1 -bottom-1 w-2 h-2 bg-blue-500 rounded-full" />
    </div>
  );
}
