import { SIZE_COLORS } from '../ui/SizePicker';
import { useTooltip } from '../ui/Tooltip';
import useInlineEdit from './useInlineEdit';

export default function RibCell({ cell, onClick, onRename, onDelete, onDragStart, isDragging, isSelected }) {
  const sizeColor = cell.size ? (SIZE_COLORS[cell.size] || 'bg-gray-100 text-gray-800') : '';
  const allocWarning = cell.allocTotal > 0 && cell.allocTotal !== 100;

  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(cell.name, (name) => onRename(cell.themeId, cell.backboneId, cell.id, name));

  const { triggerRef, onMouseEnter, onMouseLeave, tooltipEl } = useTooltip(cell.name);

  const handleGripPointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDragStart) onDragStart(e, cell);
  };

  return (
    <div
      ref={triggerRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`absolute rounded border text-left select-none transition-colors ${
        isDragging
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 opacity-50 shadow-lg ring-2 ring-blue-300 dark:ring-blue-500/50'
          : isSelected
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-500/50 dark:border-blue-500'
            : allocWarning
              ? 'border-amber-300 bg-amber-50 hover:border-amber-400 dark:border-amber-700 dark:bg-amber-900/20 dark:hover:border-amber-600'
              : 'border-gray-200 bg-white hover:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-500'
      } group cursor-pointer px-2 py-1.5 overflow-hidden`}
      style={{
        left: cell.x,
        top: cell.y,
        width: cell.width,
        height: cell.height,
        zIndex: isDragging ? 50 : undefined,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!editing) onClick(cell, e);
      }}
      data-rib-id={cell.id}
      data-backbone-id={cell.backboneId}
      data-theme-id={cell.themeId}
      data-release-id={cell.releaseId || ''}
    >
      <div className="flex items-start justify-between gap-1">
        {/* Drag grip */}
        <span
          className="text-sm leading-none text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0 mt-0.5 px-0.5 select-none"
          onPointerDown={handleGripPointerDown}
          title="Drag to move"
        >
          ⠿
        </span>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
            className="text-xs leading-tight flex-1 font-medium bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-600 rounded px-1 py-0 outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-500 text-gray-900 dark:text-gray-100 min-w-0"
          />
        ) : (
          <span
            className="text-xs text-gray-800 dark:text-gray-200 leading-tight truncate flex-1 font-medium"
            onDoubleClick={startEditing}
          >
            {cell.name}
          </span>
        )}
        {cell.size && (
          <span className={`text-[10px] font-medium px-1 py-0.5 rounded flex-shrink-0 leading-none ${sizeColor}`}>
            {cell.size}
          </span>
        )}
        {onDelete && (
          <button
            className="text-[10px] leading-none text-red-300 hover:text-red-600 dark:text-red-400/50 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 -mr-0.5"
            onClick={(e) => { e.stopPropagation(); onDelete(cell.themeId, cell.backboneId, cell.id); }}
            title="Delete"
          >
            ×
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
        {cell.points > 0 && <span className="text-gray-400 dark:text-gray-500">{cell.points}pts</span>}
        {cell.isPartial && <span className="text-blue-600 dark:text-blue-400 font-medium">{cell.allocation.percentage}%</span>}
        {allocWarning && <span className="text-amber-600 dark:text-amber-400 font-medium">{cell.allocTotal}%</span>}
        <span className={`ml-auto ${cell.category === 'core' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
          {cell.category === 'core' ? 'Core' : 'Non-Core'}
        </span>
      </div>
      {tooltipEl}
    </div>
  );
}
