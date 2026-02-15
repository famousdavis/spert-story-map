/**
 * Ghost preview that follows the cursor during drag.
 * Renders outside the zoom transform as a fixed-position overlay.
 * Shows up to 3 card names stacked with a "+N more" badge for larger selections.
 */
export default function DragGhost({ dragState, cells, zoom }) {
  if (!dragState?.isDragging || dragState.dragType !== 'rib') return null;

  const draggedIds = dragState.selectedIds || new Set([dragState.ribId]);
  const draggedCells = cells.filter(c => draggedIds.has(c.id));

  if (draggedCells.length === 0) return null;

  return (
    <div
      className="fixed pointer-events-none"
      style={{
        left: dragState.screenX + 12,
        top: dragState.screenY - 16,
        opacity: 0.8,
        transform: `scale(${Math.min(zoom, 1)})`,
        transformOrigin: 'top left',
        zIndex: 100,
      }}
    >
      {draggedCells.slice(0, 3).map((cell, i) => (
        <div
          key={cell.id}
          className="bg-white dark:bg-gray-900 border border-blue-300 dark:border-blue-500 rounded shadow-md px-2 py-1.5 text-xs font-medium text-gray-800 dark:text-gray-200 mb-1 w-44 truncate"
          style={{
            transform: i > 0 ? `translate(${i * 3}px, ${i * -2}px)` : undefined,
          }}
        >
          {cell.name}
        </div>
      ))}
      {draggedCells.length > 3 && (
        <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium ml-1">
          +{draggedCells.length - 3} more
        </div>
      )}
    </div>
  );
}
