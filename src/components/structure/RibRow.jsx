import InlineEdit from '../ui/InlineEdit';
import SizePicker from '../ui/SizePicker';
import CategoryBadge from '../ui/CategoryBadge';

const GRID_COLS = '24px minmax(120px, 1fr) 48px 44px 80px 56px 56px 56px 36px';

export { GRID_COLS };

export default function RibRow({
  rib, themeId, backboneId, sizeMapping,
  isDragging, isDropTarget,
  onDragStart, onDragEnd, onDragOver,
  onRename, onDelete,
}) {
  const pts = rib._pts;
  const allocTotal = rib._allocTotal;
  const pctComplete = rib._pctComplete;
  const remaining = rib._remaining;

  return (
    <div>
      {isDropTarget && (
        <div className="h-0.5 bg-blue-400 rounded-full mx-1 my-0.5" />
      )}
      <div
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(themeId, backboneId, rib.id); }}
        onDragEnd={onDragEnd}
        onDragOver={e => onDragOver(e, rib.id)}
        className={`grid items-center py-1 group/rib hover:bg-blue-50/50 dark:hover:bg-blue-900/20 rounded transition-colors ${isDragging ? 'opacity-40' : ''}`}
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        {/* Drag handle */}
        <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 opacity-0 group-hover/rib:opacity-100 transition-opacity">
          <span className="text-sm leading-none select-none dark:text-gray-600">⠿</span>
        </div>

        {/* Name */}
        <div className="min-w-0 pr-2">
          <InlineEdit
            value={rib.name}
            onSave={name => onRename(themeId, backboneId, rib.id, { name })}
            className="text-[13px] text-gray-800 dark:text-gray-200 truncate"
          />
        </div>

        {/* Size */}
        <div className="text-center">
          <SizePicker
            value={rib.size}
            sizeMapping={sizeMapping}
            onChange={size => onRename(themeId, backboneId, rib.id, { size })}
          />
        </div>

        {/* Points */}
        <div className="text-right">
          <span className="text-[13px] text-gray-600 dark:text-gray-400 tabular-nums">{pts || '—'}</span>
        </div>

        {/* Category */}
        <div className="text-center">
          <CategoryBadge
            category={rib.category}
            onClick={() => onRename(themeId, backboneId, rib.id, { category: rib.category === 'core' ? 'non-core' : 'core' })}
          />
        </div>

        {/* Allocation */}
        <div className="text-right">
          {allocTotal > 0 ? (
            <span className={`text-[13px] tabular-nums ${allocTotal === 100 ? 'text-gray-600 dark:text-gray-400' : 'text-amber-700 dark:text-amber-400 font-medium'}`}>
              {allocTotal}%
            </span>
          ) : (
            <span className="text-[13px] text-gray-400 dark:text-gray-500">—</span>
          )}
        </div>

        {/* Progress */}
        <div className="text-right">
          {pctComplete > 0 ? (
            <span className={`text-[13px] tabular-nums ${pctComplete === 100 ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {pctComplete}%
            </span>
          ) : (
            <span className="text-[13px] text-gray-400 dark:text-gray-500">—</span>
          )}
        </div>

        {/* Remaining */}
        <div className="text-right">
          {pts > 0 ? (
            <span className={`text-[13px] tabular-nums ${remaining === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
              {remaining}
            </span>
          ) : (
            <span className="text-[13px] text-gray-400 dark:text-gray-500">—</span>
          )}
        </div>

        {/* Delete */}
        <div className="flex items-center justify-end opacity-0 group-hover/rib:opacity-100 transition-opacity">
          <button onClick={() => onDelete(themeId, backboneId, rib.id, rib.name)} className="text-red-400 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400 text-xs px-0.5">&times;</button>
        </div>
      </div>
    </div>
  );
}
