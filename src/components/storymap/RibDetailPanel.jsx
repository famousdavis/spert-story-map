import { useEffect } from 'react';
import { getRibItemPercentComplete } from '../../lib/calculations';
import { SIZE_COLORS } from '../ui/SizePicker';
import useInlineEdit from './useInlineEdit';

export default function RibDetailPanel({ rib, product, onClose, onRename }) {
  const sizeColor = rib.size ? (SIZE_COLORS[rib.size] || 'bg-gray-100 text-gray-800') : '';
  const pctComplete = getRibItemPercentComplete(rib);
  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(rib.name, (name) => onRename?.(rib.themeId, rib.backboneId, rib.id, name));

  // Find release names for allocations
  const releaseMap = {};
  product.releases.forEach(r => { releaseMap[r.id] = r.name; });

  // Close on Escape (but not while editing)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && e.target.tagName !== 'INPUT') onClose();
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
      <div className="absolute top-0 right-0 z-50 h-full w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-lg overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            {editing ? (
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-600 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 flex-1 min-w-0"
              />
            ) : (
              <h3
                className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                onClick={startEditing}
                title="Click to rename"
              >
                {rib.name}
              </h3>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-lg leading-none flex-shrink-0 -mt-0.5"
            >
              ×
            </button>
          </div>

          {/* Description */}
          {rib.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{rib.description}</p>
          )}

          {/* Metadata */}
          <div className="space-y-3">
            <DetailRow label="Backbone" value={rib.backboneName} />
            <DetailRow label="Theme" value={rib.themeName} />
            <DetailRow label="Category">
              <span className={`text-sm font-medium ${rib.category === 'core' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {rib.category === 'core' ? 'Core' : 'Non-core'}
              </span>
            </DetailRow>
            {rib.size && (
              <DetailRow label="Size">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${sizeColor}`}>
                  {rib.size}
                </span>
                {rib.points > 0 && <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">{rib.points} pts</span>}
              </DetailRow>
            )}
            <DetailRow label="Progress">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 max-w-24">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, pctComplete)}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">{pctComplete}%</span>
              </div>
            </DetailRow>
          </div>

          {/* Release Allocations */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Release Allocations</h4>
            {rib.releaseAllocations.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">Not assigned to any release</p>
            ) : (
              <div className="space-y-2">
                {rib.releaseAllocations.map(alloc => (
                  <div key={alloc.releaseId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{releaseMap[alloc.releaseId] || 'Unknown'}</span>
                    <span className="text-gray-500 dark:text-gray-400 font-medium tabular-nums">{alloc.percentage}%</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm pt-1 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">Total</span>
                  <span className={`font-semibold tabular-nums ${rib.allocTotal === 100 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
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
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
      {children || <span className="text-sm text-gray-700 dark:text-gray-300">{value}</span>}
    </div>
  );
}
