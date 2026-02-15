import RibCard from './RibCard';

/**
 * A single column in the release planning board.
 * Handles both "unassigned" and named-release columns.
 */
export default function ReleaseColumn({
  colId,
  release,       // null for unassigned column
  ribs,
  stats,         // { totalPts, core, nonCore } — only for release columns
  product,
  dragRibId,
  dropTarget,
  isColDropTarget,
  isColDragging,
  onColumnDragOver,
  onColumnDrop,
  onColDragStart,
  onColDragEnd,
  onColDragOver,
  onColDrop,
  onCardDragStart,
  onCardDragEnd,
  onCardDragOver,
  onCardDrop,
  onCardClick,
}) {
  const isOver = dropTarget?.col === colId && dragRibId;
  const isUnassigned = !release;

  const cardList = ribs.map(rib => (
    <RibCard
      key={rib.id}
      rib={rib}
      product={product}
      allocation={release ? rib.releaseAllocations.find(a => a.releaseId === release.id) : undefined}
      isDragging={dragRibId === rib.id}
      isDropBefore={dropTarget?.col === colId && dropTarget?.beforeRibId === rib.id}
      onDragStart={() => onCardDragStart(rib.id, colId)}
      onDragEnd={onCardDragEnd}
      onDragOver={e => onCardDragOver(e, colId, rib.id)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); onCardDrop(colId); }}
      onClick={() => onCardClick(rib)}
    />
  ));

  if (isUnassigned) {
    return (
      <div
        className="flex-shrink-0 w-72"
        onDragOver={e => onColumnDragOver(e, 'unassigned')}
        onDrop={e => { e.preventDefault(); onColumnDrop('unassigned'); }}
      >
        <div className={`bg-amber-50 dark:bg-amber-900/20 border rounded-xl overflow-hidden transition-colors ${
          isOver ? 'border-amber-400 ring-2 ring-amber-200 dark:border-amber-500 dark:ring-amber-700' : 'border-amber-200 dark:border-amber-700'
        }`}>
          <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-700">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Unassigned</h3>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{ribs.length} items</p>
          </div>
          <div className="p-2 min-h-[60px] max-h-[calc(100vh-250px)] overflow-y-auto">
            {cardList}
            {ribs.length === 0 && !isOver && (
              <p className="text-xs text-amber-400 dark:text-amber-500 text-center py-4 italic">All items assigned</p>
            )}
            {isOver && ribs.length === 0 && (
              <div className="h-10 border-2 border-dashed border-amber-300 dark:border-amber-600 rounded-lg mx-1" />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-shrink-0 flex"
      onDragOver={e => {
        if (onColDragOver) onColDragOver(e, release.id);
        else onColumnDragOver(e, release.id);
      }}
      onDrop={e => {
        e.preventDefault();
        e.stopPropagation();
        if (onColDrop) onColDrop(e);
        else onColumnDrop(release.id);
      }}
    >
      {isColDropTarget && (
        <div className="w-1 bg-blue-400 rounded-full flex-shrink-0 mx-1 self-stretch" />
      )}
      <div className={`w-72 transition-opacity ${isColDragging ? 'opacity-40' : ''}`}>
        <div className={`bg-white dark:bg-gray-900 border rounded-xl overflow-hidden h-full transition-colors ${
          isOver ? 'border-blue-400 ring-2 ring-blue-200 dark:border-blue-500 dark:ring-blue-700' : 'border-gray-200 dark:border-gray-700'
        }`}>
          <div
            draggable
            onDragStart={e => onColDragStart(e, release.id)}
            onDragEnd={onColDragEnd}
            className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 cursor-grab active:cursor-grabbing"
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{release.name}</h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{stats.totalPts} pts</span>
              <span className="text-blue-600 dark:text-blue-400">{Math.round(stats.core)} core</span>
              <span className="text-gray-400 dark:text-gray-500">{Math.round(stats.nonCore)} non-core</span>
              <span>{ribs.length} items</span>
            </div>
            {release.targetDate && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Target: {new Date(release.targetDate).toLocaleDateString()}</p>
            )}
          </div>
          <div className="p-2 min-h-[60px] max-h-[calc(100vh-280px)] overflow-y-auto">
            {cardList}
            {ribs.length === 0 && !isOver && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 italic">
                Drag items here or click to assign
              </p>
            )}
            {isOver && ribs.length === 0 && (
              <div className="h-10 border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-lg mx-1" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
