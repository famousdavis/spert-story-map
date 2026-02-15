import useInlineEdit from './useInlineEdit';
import { THEME_COLOR_OPTIONS } from '../../lib/themeColors';

export default function ThemeHeader({ themeSpan, colorClasses, onRename, onDelete, isDropTarget, isDragging, onDragStart }) {
  const color = colorClasses?.solid || THEME_COLOR_OPTIONS[0].solid;
  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(themeSpan.themeName, (name) => onRename(themeSpan.themeId, name));

  const handleGripPointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDragStart) onDragStart(e, themeSpan);
  };

  return (
    <div
      className={`absolute ${color} rounded-md flex items-center gap-0.5 px-1 transition-shadow ${
        isDragging ? 'opacity-50 ring-2 ring-white/60' : ''
      } ${isDropTarget ? 'ring-2 ring-white/60 shadow-lg' : ''}`}
      style={{
        left: themeSpan.x,
        top: 0,
        width: themeSpan.width,
        height: 36,
        zIndex: isDragging ? 50 : undefined,
      }}
      data-theme-id={themeSpan.themeId}
    >
      {/* Drag grip */}
      <span
        className="text-sm leading-none text-white/40 hover:text-white/80 cursor-grab active:cursor-grabbing flex-shrink-0 px-0.5 select-none"
        onPointerDown={handleGripPointerDown}
        title="Drag to reorder"
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
          className="bg-white/20 text-white placeholder-white/60 text-sm font-semibold rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-white/40 w-full border-0"
        />
      ) : (
        <span
          className="text-sm font-semibold text-white truncate cursor-pointer hover:bg-white/10 rounded px-1 py-0.5 transition-colors"
          onDoubleClick={startEditing}
          title="Double-click to rename"
        >
          {themeSpan.themeName}
        </span>
      )}
      {onDelete && (
        <button
          className="text-xs leading-none text-white/30 hover:text-white/90 flex-shrink-0 ml-auto transition-opacity"
          onClick={(e) => { e.stopPropagation(); onDelete(themeSpan.themeId); }}
          title="Delete theme"
        >
          ×
        </button>
      )}
    </div>
  );
}
