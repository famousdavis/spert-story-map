import useInlineEdit from './useInlineEdit';

const THEME_COLORS = [
  'bg-blue-600',
  'bg-teal-600',
  'bg-violet-600',
  'bg-rose-600',
  'bg-amber-600',
  'bg-emerald-600',
  'bg-indigo-600',
  'bg-orange-600',
];

export { THEME_COLORS };

export default function ThemeHeader({ themeSpan, index, onRename, isDropTarget }) {
  const color = THEME_COLORS[index % THEME_COLORS.length];
  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(themeSpan.themeName, (name) => onRename(themeSpan.themeId, name));

  return (
    <div
      className={`absolute ${color} rounded-md flex items-center px-3 transition-shadow ${isDropTarget ? 'ring-2 ring-white/60 shadow-lg' : ''}`}
      style={{
        left: themeSpan.x,
        top: 0,
        width: themeSpan.width,
        height: 36,
      }}
      data-theme-id={themeSpan.themeId}
    >
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
    </div>
  );
}
