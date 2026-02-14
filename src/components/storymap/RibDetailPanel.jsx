import { useEffect } from 'react';
import { getRibItemPercentComplete } from '../../lib/calculations';
import { SIZE_COLORS } from '../ui/SizePicker';

export default function RibDetailPanel({ rib, product, onClose }) {
  const sizeColor = rib.size ? (SIZE_COLORS[rib.size] || 'bg-gray-100 text-gray-800') : '';
  const pctComplete = getRibItemPercentComplete(rib);

  // Find release names for allocations
  const releaseMap = {};
  product.releases.forEach(r => { releaseMap[r.id] = r.name; });

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute top-0 right-0 z-50 h-full w-80 bg-white border-l border-gray-200 shadow-lg overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900 leading-tight">{rib.name}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0 -mt-0.5"
            >
              ×
            </button>
          </div>

          {/* Description */}
          {rib.description && (
            <p className="text-sm text-gray-600">{rib.description}</p>
          )}

          {/* Metadata */}
          <div className="space-y-3">
            <DetailRow label="Backbone" value={rib.backboneName} />
            <DetailRow label="Theme" value={rib.themeName} />
            <DetailRow label="Category">
              <span className={`text-sm font-medium ${rib.category === 'core' ? 'text-blue-600' : 'text-gray-600'}`}>
                {rib.category === 'core' ? 'Core' : 'Non-core'}
              </span>
            </DetailRow>
            {rib.size && (
              <DetailRow label="Size">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${sizeColor}`}>
                  {rib.size}
                </span>
                {rib.points > 0 && <span className="text-sm text-gray-500 ml-2">{rib.points} pts</span>}
              </DetailRow>
            )}
            <DetailRow label="Progress">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-24">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, pctComplete)}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700 tabular-nums">{pctComplete}%</span>
              </div>
            </DetailRow>
          </div>

          {/* Release Allocations */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Release Allocations</h4>
            {rib.releaseAllocations.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Not assigned to any release</p>
            ) : (
              <div className="space-y-2">
                {rib.releaseAllocations.map(alloc => (
                  <div key={alloc.releaseId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{releaseMap[alloc.releaseId] || 'Unknown'}</span>
                    <span className="text-gray-500 font-medium tabular-nums">{alloc.percentage}%</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm pt-1 border-t border-gray-100">
                  <span className="text-gray-500 font-medium">Total</span>
                  <span className={`font-semibold tabular-nums ${rib.allocTotal === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                    {rib.allocTotal}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function DetailRow({ label, value, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      {children || <span className="text-sm text-gray-700">{value}</span>}
    </div>
  );
}
