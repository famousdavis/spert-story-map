import InlineEdit from '../ui/InlineEdit';
import RibRow, { GRID_COLS } from './RibRow';

export default function BackboneSection({
  theme, backbone, bbIdx, themeColor, sizeMapping,
  isCollapsed, onToggle,
  dragRib, dropBeforeRib,
  onRibDragStart, onRibDragEnd, onRibDragOver, onRibDrop,
  onRenameBackbone, onUpdateRib, onDeleteBackbone,
  onAddRib, onDeleteRib, onMoveBackbone,
  bbStats,
}) {
  return (
    <div className={bbIdx > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}>
      {/* Backbone header */}
      <div className="flex items-center gap-2 pl-8 pr-4 py-2 group/bb">
        <button onClick={onToggle} className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 w-4 flex-shrink-0 text-sm leading-none">
          {isCollapsed ? '▶' : '▼'}
        </button>
        <div className={`w-1.5 h-1.5 rounded-full ${themeColor.dot} flex-shrink-0`} />
        <InlineEdit
          value={backbone.name}
          onSave={name => onRenameBackbone(theme.id, backbone.id, { name })}
          className="font-medium text-gray-900 dark:text-gray-100 text-sm"
        />
        <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
          {bbStats.totalItems} items &middot; {bbStats.totalPoints} pts &middot; <span className={bbStats.percentComplete === 100 ? 'text-emerald-700 dark:text-emerald-400' : 'text-emerald-600 dark:text-emerald-400'}>{bbStats.percentComplete}% done</span> &middot; {bbStats.remainingPoints} remaining
          {bbStats.unsized > 0 && <span className="text-amber-700 dark:text-amber-400"> &middot; {bbStats.unsized} unsized</span>}
        </span>
        <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover/bb:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={() => onMoveBackbone(theme.id, backbone.id, -1)} disabled={bbIdx === 0} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 disabled:opacity-30 text-xs px-1">↑</button>
          <button onClick={() => onMoveBackbone(theme.id, backbone.id, 1)} disabled={bbIdx === theme.backboneItems.length - 1} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 disabled:opacity-30 text-xs px-1">↓</button>
          <button onClick={() => onAddRib(theme.id, backbone.id)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs px-1.5">+ Rib</button>
          <button onClick={() => onDeleteBackbone(theme.id, backbone.id, backbone.name)} className="text-red-400 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400 text-xs px-1">&times;</button>
        </div>
      </div>

      {/* Rib items */}
      {!isCollapsed && (
        <div className="pb-1">
          {backbone.ribItems.length === 0 ? (
            <div className="pl-16 pr-4 py-2 text-sm text-gray-500 dark:text-gray-400 italic">
              No rib items. <button onClick={() => onAddRib(theme.id, backbone.id)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 not-italic">Add one</button>
            </div>
          ) : (
            <div className="ml-14 mr-4">
              {/* Column header */}
              <div
                className="grid items-center text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-0.5 border-b border-gray-100 dark:border-gray-800 mb-0.5"
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                <span></span>
                <span>Name</span>
                <span className="text-center">Size</span>
                <span className="text-right">Pts</span>
                <span className="text-center">Type</span>
                <span className="text-right">Alloc</span>
                <span className="text-right">Done</span>
                <span className="text-right">Rem</span>
                <span></span>
              </div>

              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => onRibDrop(e, theme.id, backbone.id)}
              >
                {backbone.ribItems.map(rib => (
                  <RibRow
                    key={rib.id}
                    rib={rib}
                    themeId={theme.id}
                    backboneId={backbone.id}
                    sizeMapping={sizeMapping}
                    isDragging={dragRib?.ribId === rib.id}
                    isDropTarget={dropBeforeRib === rib.id && dragRib?.ribId !== rib.id}
                    onDragStart={onRibDragStart}
                    onDragEnd={onRibDragEnd}
                    onDragOver={onRibDragOver}
                    onRename={onUpdateRib}
                    onDelete={onDeleteRib}
                  />
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => onAddRib(theme.id, backbone.id)}
            className="ml-14 mt-0.5 mb-1 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            + Add rib item
          </button>
        </div>
      )}
    </div>
  );
}
