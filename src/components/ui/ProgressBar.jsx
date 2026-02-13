export default function ProgressBar({ percent, className = '', height = 'h-2', showLabel = false, color = 'bg-blue-500' }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-1 bg-gray-200 rounded-full overflow-hidden ${height}`}>
        <div
          className={`${color} ${height} rounded-full transition-all duration-300`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-gray-500 tabular-nums w-12 text-right">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
