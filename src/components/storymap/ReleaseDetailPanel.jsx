import { useEffect, useMemo } from 'react';
import { getPointsForRelease, getReleasePercentComplete, getCoreNonCorePointsForRelease } from '../../lib/calculations';
import useInlineEdit from './useInlineEdit';

export default function ReleaseDetailPanel({ releaseId, product, onClose, onRename }) {
  const release = product.releases.find(r => r.id === releaseId);
  const releaseName = release?.name || '';

  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(releaseName, (name) => onRename(releaseId, name));

  // Compute release stats
  const stats = useMemo(() => {
    if (!release) return null;
    const totalPoints = getPointsForRelease(product, releaseId);
    const pctComplete = getReleasePercentComplete(product, releaseId);
    const { core, nonCore } = getCoreNonCorePointsForRelease(product, releaseId);

    let ribCount = 0;
    const backboneSet = new Set();
    const themeSet = new Set();
    for (const theme of product.themes) {
      for (const backbone of theme.backboneItems) {
        for (const rib of backbone.ribItems) {
          if (rib.releaseAllocations.some(a => a.releaseId === releaseId)) {
            ribCount++;
            backboneSet.add(backbone.id);
            themeSet.add(theme.id);
          }
        }
      }
    }

    return {
      totalPoints: Math.round(totalPoints * 10) / 10,
      pctComplete: Math.round(pctComplete * 10) / 10,
      corePoints: Math.round(core * 10) / 10,
      nonCorePoints: Math.round(nonCore * 10) / 10,
      ribCount,
      backboneCount: backboneSet.size,
      themeCount: themeSet.size,
    };
  }, [product, releaseId, release]);

  // Close on Escape (but not while editing)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && !editing) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, editing]);

  if (!release || !stats) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="absolute inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="absolute top-0 right-0 z-50 h-full w-80 bg-white border-l border-gray-200 shadow-lg overflow-y-auto">
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
                className="text-base font-semibold text-gray-900 leading-tight flex-1 bg-blue-50 border border-blue-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-300 min-w-0"
              />
            ) : (
              <h3
                className="text-base font-semibold text-gray-900 leading-tight cursor-text hover:text-blue-700 transition-colors"
                onClick={startEditing}
                title="Click to rename"
              >
                {release.name}
              </h3>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0 -mt-0.5"
            >
              ×
            </button>
          </div>

          {/* Progress */}
          <div className="space-y-3">
            <DetailRow label="Progress">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-24">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, stats.pctComplete)}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700 tabular-nums">{stats.pctComplete}%</span>
              </div>
            </DetailRow>
            <DetailRow label="Total Points" value={stats.totalPoints} />
            <DetailRow label="Core Points" value={stats.corePoints} />
            <DetailRow label="Non-Core Points" value={stats.nonCorePoints} />
          </div>

          {/* Scope */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Scope</h4>
            <div className="space-y-3">
              <DetailRow label="Rib Items" value={stats.ribCount} />
              <DetailRow label="Backbones" value={stats.backboneCount} />
              <DetailRow label="Themes" value={stats.themeCount} />
            </div>
          </div>

          {/* Release details */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Details</h4>
            <div className="space-y-3">
              <DetailRow label="Order" value={`#${release.order}`} />
              {release.targetDate && (
                <DetailRow label="Target Date" value={release.targetDate} />
              )}
            </div>
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
