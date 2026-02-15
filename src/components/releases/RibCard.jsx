import { getRibItemPoints, getAllocationTotal } from '../../lib/calculations';
import { SIZE_COLORS } from '../ui/SizePicker';

export default function RibCard({ rib, product, allocation, isDragging, isDropBefore, onDragStart, onDragEnd, onDragOver, onDrop, onClick }) {
  const pts = getRibItemPoints(rib, product.sizeMapping);
  const allocTotal = getAllocationTotal(rib);
  const isPartial = allocation && allocation.percentage < 100;
  const allocWarning = allocTotal > 0 && allocTotal !== 100;
  const sizeColor = rib.size ? (SIZE_COLORS[rib.size] || 'bg-gray-100 text-gray-800') : '';

  return (
    <div className="mb-1.5">
      {isDropBefore && (
        <div className="h-1 bg-blue-400 rounded-full mx-1 mb-1.5" />
      )}
      <div
        draggable
        onDragStart={e => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={onClick}
        className={`px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all ${
          isDragging ? 'opacity-40 scale-95' : ''
        } ${
          allocWarning ? 'border-amber-300 bg-amber-50 hover:border-amber-400 dark:border-amber-700 dark:bg-amber-900/20 dark:hover:border-amber-600' : 'border-gray-100 bg-white hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-500'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-gray-800 dark:text-gray-200 leading-tight flex-1">{rib.name}</span>
          {rib.size && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${sizeColor}`}>
              {rib.size}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-xs">
          {pts > 0 && <span className="text-gray-500 dark:text-gray-400">{pts} pts</span>}
          {isPartial && <span className="text-blue-600 dark:text-blue-400 font-medium">{allocation.percentage}%</span>}
          {allocWarning && <span className="text-amber-600 dark:text-amber-400 font-medium">{allocTotal}% alloc</span>}
          <span className={`ml-auto ${rib.category === 'core' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {rib.category === 'core' ? 'Core' : 'Non-core'}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{rib.backboneName}</div>
      </div>
    </div>
  );
}
