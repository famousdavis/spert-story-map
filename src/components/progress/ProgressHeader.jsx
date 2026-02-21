export default function ProgressHeader({
  selectedSprint, setSelectedSprint, sprints, addSprint,
  groupBy, setGroupBy,
  allExpanded, toggleExpandAll, hasAssignedRibs,
  percentComplete,
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Progress Tracking</h2>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Project: <span className="font-medium text-gray-700 dark:text-gray-300">{Math.round(percentComplete)}%</span> complete
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Sprint:</span>
          <select
            value={selectedSprint || ''}
            onChange={e => setSelectedSprint(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none"
          >
            {sprints.length === 0 && <option value="">No sprints defined</option>}
            {sprints.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={() => addSprint(setSelectedSprint)}
            className="text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 text-lg leading-none px-1"
            title="Add sprint"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Group:</span>
          {['release', 'backbone', 'theme'].map(g => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-2 py-1 text-xs rounded ${groupBy === g ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        {hasAssignedRibs && (
          <button
            onClick={toggleExpandAll}
            className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
            title={allExpanded ? 'Collapse all notes' : 'Expand all notes'}
          >
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        )}
      </div>
    </div>
  );
}
