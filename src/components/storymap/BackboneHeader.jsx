import { THEME_HEIGHT } from './useMapLayout';
import useInlineEdit from './useInlineEdit';

const BACKBONE_BG_COLORS = [
  'bg-blue-100 text-blue-800',
  'bg-teal-100 text-teal-800',
  'bg-violet-100 text-violet-800',
  'bg-rose-100 text-rose-800',
  'bg-amber-100 text-amber-800',
  'bg-emerald-100 text-emerald-800',
  'bg-indigo-100 text-indigo-800',
  'bg-orange-100 text-orange-800',
];

export default function BackboneHeader({ column, themeIndex, onRename, isDropTarget, isDragging, onDragStart }) {
  const color = BACKBONE_BG_COLORS[themeIndex % BACKBONE_BG_COLORS.length];
  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(column.backboneName, (name) => onRename(column.themeId, column.backboneId, name));

  const handleGripPointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDragStart) onDragStart(e, column);
  };

  return (
    <div
      className={`absolute ${color} rounded flex items-center gap-0.5 px-1 transition-shadow ${
        isDragging ? 'opacity-50 ring-2 ring-blue-400' : ''
      } ${isDropTarget ? 'ring-2 ring-blue-400 shadow-md' : ''}`}
      style={{
        left: column.x,
        top: THEME_HEIGHT,
        width: column.width,
        height: 28,
        zIndex: isDragging ? 50 : undefined,
      }}
      data-backbone-id={column.backboneId}
      data-theme-id={column.themeId}
    >
      {/* Drag grip */}
      <span
        className="text-[10px] leading-none opacity-40 hover:opacity-80 cursor-grab active:cursor-grabbing flex-shrink-0 select-none"
        onPointerDown={handleGripPointerDown}
        title="Drag to move between themes"
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
          className="bg-white/60 text-xs font-medium rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-300 w-full border-0"
        />
      ) : (
        <span
          className="text-xs font-medium truncate cursor-pointer hover:bg-white/30 rounded px-1 py-0.5 transition-colors"
          onDoubleClick={startEditing}
          title="Double-click to rename"
        >
          {column.backboneName}
        </span>
      )}
    </div>
  );
}
