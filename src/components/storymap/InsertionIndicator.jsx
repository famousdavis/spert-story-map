import { CELL_HEIGHT, CELL_GAP, CELL_PAD } from './useMapLayout';

/**
 * Renders a horizontal blue line indicating where the dragged card(s) will be inserted.
 * Positioned inside the zoom transform using absolute coordinates from layout data.
 */
export default function InsertionIndicator({ dragState, layout }) {
  if (!dragState?.isDragging || dragState.dragType !== 'rib') return null;
  if (dragState.insertIndex == null) return null;

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
      {/* Dot indicators at ends */}
      <div className="absolute -left-1 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
      <div className="absolute -right-1 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
    </div>
  );
}
