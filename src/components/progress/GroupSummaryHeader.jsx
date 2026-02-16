import { getRibItemPoints, getRibItemPercentComplete, getReleasePercentComplete } from '../../lib/calculations';
import ProgressBar from '../ui/ProgressBar';

export default function GroupSummaryHeader({ label, items, sizeMapping, groupBy, releaseId, product, collapsed, onToggle }) {
  const totalItems = items.length;
  const totalPoints = items.reduce((sum, rib) => sum + getRibItemPoints(rib, sizeMapping), 0);

  let percentComplete;
  if (groupBy === 'release' && releaseId) {
    percentComplete = getReleasePercentComplete(product, releaseId);
  } else if (totalPoints === 0) {
    percentComplete = 0;
  } else {
    const completedPoints = items.reduce((sum, rib) => {
      const pts = getRibItemPoints(rib, sizeMapping);
      return sum + pts * getRibItemPercentComplete(rib) / 100;
    }, 0);
    percentComplete = (completedPoints / totalPoints) * 100;
  }

  return (
    <button onClick={onToggle} className="flex items-center gap-2 w-full text-left mb-2">
      <span className={`text-gray-400 dark:text-gray-500 text-xs transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}>&#9654;</span>
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {totalItems} items &middot; {totalPoints} pts &middot;{' '}
        <span className={Math.round(percentComplete) === 100 ? 'text-emerald-700 dark:text-emerald-400' : 'text-emerald-600 dark:text-emerald-400'}>
          {Math.round(percentComplete)}% done
        </span>
      </span>
      <div className="flex-1 max-w-32">
        <ProgressBar percent={percentComplete} height="h-1.5" />
      </div>
    </button>
  );
}
