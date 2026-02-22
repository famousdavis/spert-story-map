import { parseDate } from '../../lib/formatDate';

export default function ProjectCard({
  product: p,
  isShared,
  isDragging,
  isDropTarget,
  onNavigate,
  onExport,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`bg-white dark:bg-gray-900 border rounded-xl p-5 transition-colors group ${
        isDragging
          ? 'opacity-40 border-gray-300 dark:border-gray-600'
          : isDropTarget
            ? 'border-blue-400 dark:border-blue-500 border-t-2'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between">
        <span
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-500 mr-3 mt-0.5 select-none"
          title="Drag to reorder"
        >⠿</span>
        <button
          onClick={onNavigate}
          className="text-left flex-1"
        >
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {p.name}
            {isShared && (
              <span className="ml-2 inline-block text-[10px] font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded-full align-middle">
                Shared
              </span>
            )}
          </h3>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span>{p.totalItems} {p.totalItems === 1 ? 'item' : 'items'}</span>
            <span>{p.totalPoints} pts</span>
            {p.unsized > 0 && (
              <span className="text-amber-600 dark:text-amber-400">{p.unsized} unsized</span>
            )}
            <span>{Math.round(p.pctComplete)}% complete</span>
            <span>Updated {(parseDate(p.updatedAt) || new Date()).toLocaleDateString()}</span>
          </div>
        </button>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onExport}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            title="Export as JSON"
          >
            Export
          </button>
          <button
            onClick={onDuplicate}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            title="Duplicate"
          >
            Duplicate
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
            title="Delete"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
