export default function CollapsibleSection({ label, open, onToggle, children }) {
  return (
    <div className="mb-8">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 mb-2"
      >
        <span className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>&#9654;</span>
        {label}
      </button>
      {open && children}
    </div>
  );
}
