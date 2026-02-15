export default function CategoryBadge({ category, onClick }) {
  const isCore = category === 'core';
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${
        isCore
          ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50 dark:hover:bg-blue-900/50'
          : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700'
      }`}
      title={`Click to toggle to ${isCore ? 'non-core' : 'core'}`}
    >
      {isCore ? 'Core' : 'Non-core'}
    </button>
  );
}
