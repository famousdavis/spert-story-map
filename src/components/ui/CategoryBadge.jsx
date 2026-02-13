export default function CategoryBadge({ category, onClick }) {
  const isCore = category === 'core';
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${
        isCore
          ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
          : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
      }`}
      title={`Click to toggle to ${isCore ? 'non-core' : 'core'}`}
    >
      {isCore ? 'Core' : 'Non-core'}
    </button>
  );
}
