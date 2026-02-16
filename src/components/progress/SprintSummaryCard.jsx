import { formatDate } from '../../lib/formatDate';

export default function SprintSummaryCard({ summary }) {
  return (
    <div className="mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-4 space-y-3">
      <div className="flex items-center gap-8">
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Sprint pts</div>
          <div className={`text-lg font-semibold ${summary.pointsThisSprint > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
            {summary.pointsThisSprint > 0 ? '+' : ''}{summary.pointsThisSprint}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Completed</div>
          <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {summary.completedPoints}<span className="text-sm font-normal text-gray-400 dark:text-gray-500"> / {summary.totalPoints} pts</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Remaining</div>
          <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {summary.remainingPoints}<span className="text-sm font-normal text-gray-400 dark:text-gray-500"> pts</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Items updated</div>
          <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {summary.itemsUpdated}<span className="text-sm font-normal text-gray-400 dark:text-gray-500"> / {summary.itemsTotal}</span>
          </div>
        </div>
        {summary.endDate && (
          <div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Ends</div>
            <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">{formatDate(summary.endDate)}</div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-6 pt-2 border-t border-gray-100 dark:border-gray-800">
        {[
          { label: 'Core', data: summary.core },
          { label: 'Non-core', data: summary.nonCore },
          { label: 'Total', data: { percentComplete: summary.percentComplete, completedPoints: summary.completedPoints, totalPoints: summary.totalPoints, pointsThisSprint: summary.pointsThisSprint } },
        ].map(({ label, data }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-xs text-gray-400 dark:text-gray-500 w-16">{label}</span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 tabular-nums w-12 text-right">{data.percentComplete}%</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{data.completedPoints} / {data.totalPoints} pts</span>
            <span className={`text-xs font-medium tabular-nums ${data.pointsThisSprint > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
              {data.pointsThisSprint > 0 ? '+' : ''}{data.pointsThisSprint}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
