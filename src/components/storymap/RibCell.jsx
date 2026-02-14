import { SIZE_COLORS } from '../ui/SizePicker';

export default function RibCell({ cell, onClick, onDragStart, isDragging }) {
  const sizeColor = cell.size ? (SIZE_COLORS[cell.size] || 'bg-gray-100 text-gray-800') : '';
  const allocWarning = cell.allocTotal > 0 && cell.allocTotal !== 100;

  const handleGripPointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDragStart) onDragStart(e, cell);
  };

  return (
    <div
      className={`absolute rounded border text-left select-none transition-colors ${
        isDragging
          ? 'border-blue-400 bg-blue-50 opacity-50 shadow-lg ring-2 ring-blue-300'
          : allocWarning
            ? 'border-amber-300 bg-amber-50 hover:border-amber-400'
            : 'border-gray-200 bg-white hover:border-blue-400'
      } cursor-pointer px-2 py-1.5 overflow-hidden`}
      style={{
        left: cell.x,
        top: cell.y,
        width: cell.width,
        height: cell.height,
        zIndex: isDragging ? 50 : undefined,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(cell);
      }}
      data-rib-id={cell.id}
      data-backbone-id={cell.backboneId}
      data-theme-id={cell.themeId}
      data-release-id={cell.releaseId || ''}
    >
      <div className="flex items-start justify-between gap-1">
        {/* Drag grip */}
        <span
          className="text-[10px] leading-none text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0 mt-0.5 select-none"
          onPointerDown={handleGripPointerDown}
          title="Drag to move"
        >
          ⠿
        </span>
        <span className="text-xs text-gray-800 leading-tight truncate flex-1 font-medium">
          {cell.name}
        </span>
        {cell.size && (
          <span className={`text-[10px] font-medium px-1 py-0.5 rounded flex-shrink-0 leading-none ${sizeColor}`}>
            {cell.size}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
        {cell.points > 0 && <span className="text-gray-400">{cell.points}pts</span>}
        {cell.isPartial && <span className="text-blue-600 font-medium">{cell.allocation.percentage}%</span>}
        {allocWarning && <span className="text-amber-600 font-medium">{cell.allocTotal}%</span>}
        <span className={`ml-auto ${cell.category === 'core' ? 'text-blue-500' : 'text-gray-400'}`}>
          {cell.category === 'core' ? 'Core' : 'N-C'}
        </span>
      </div>
    </div>
  );
}
