import { useState } from 'react';
import { getRibItemPoints } from '../../lib/calculations';
import Modal from '../ui/Modal';

export default function AllocationModal({ rib, product, onSave, onClose }) {
  const [allocations, setAllocations] = useState(
    rib.releaseAllocations.map(a => ({ ...a }))
  );

  const parsePct = (v) => { const n = parseInt(v); return isNaN(n) ? 0 : Math.max(0, Math.min(100, n)); };
  const total = allocations.reduce((s, a) => s + parsePct(a.percentage), 0);
  const pts = getRibItemPoints(rib, product.sizeMapping);

  const addRelease = (releaseId) => {
    if (allocations.some(a => a.releaseId === releaseId)) return;
    const remaining = Math.max(0, 100 - total);
    setAllocations([...allocations, { releaseId, percentage: remaining, memo: '' }]);
  };

  const updatePct = (releaseId, raw) => {
    setAllocations(allocations.map(a =>
      a.releaseId === releaseId ? { ...a, percentage: raw } : a
    ));
  };

  const updateMemo = (releaseId, memo) => {
    setAllocations(allocations.map(a =>
      a.releaseId === releaseId ? { ...a, memo } : a
    ));
  };

  const removeAlloc = (releaseId) => {
    setAllocations(allocations.filter(a => a.releaseId !== releaseId));
  };

  const availableReleases = product.releases.filter(
    r => !allocations.some(a => a.releaseId === r.id)
  );

  return (
    <Modal open onClose={onClose} title={`Allocate: ${rib.name}`} wide>
      <div className="space-y-4">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {rib.size && <span>Size: <strong>{rib.size}</strong></span>}
          {pts > 0 && <span>Points: <strong>{pts}</strong></span>}
          <span>Category: <strong>{rib.category}</strong></span>
        </div>

        <div className="space-y-3">
          {allocations.map(alloc => {
            const release = product.releases.find(r => r.id === alloc.releaseId);
            if (!release) return null;
            return (
              <div key={alloc.releaseId} className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-40 truncate">{release.name}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={alloc.percentage}
                    onChange={e => updatePct(alloc.releaseId, e.target.value)}
                    onBlur={e => updatePct(alloc.releaseId, parsePct(e.target.value))}
                    className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center"
                  />
                  <span className="text-xs text-gray-400">%</span>
                  {pts > 0 && (
                    <span className="text-xs text-gray-500">{Math.round(pts * parsePct(alloc.percentage) / 100)} pts</span>
                  )}
                  <button onClick={() => removeAlloc(alloc.releaseId)} className="text-red-400 hover:text-red-600 text-sm ml-auto">Remove</button>
                </div>
                <div className="ml-43">
                  <input
                    type="text"
                    value={alloc.memo || ''}
                    onChange={e => updateMemo(alloc.releaseId, e.target.value)}
                    placeholder="Add a note..."
                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 placeholder:text-gray-300 focus:border-blue-300 focus:ring-1 focus:ring-blue-200 outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {availableReleases.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Add to:</span>
            {availableReleases.map(r => (
              <button
                key={r.id}
                onClick={() => addRelease(r.id)}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded transition-colors"
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        <div className={`flex items-center gap-2 text-sm font-medium ${total === 100 ? 'text-green-600' : total > 100 ? 'text-red-600' : 'text-amber-600'}`}>
          <span>Total: {total}%</span>
          {total !== 100 && total > 0 && <span className="text-xs font-normal">(should be 100%)</span>}
        </div>

        <div className="flex justify-between pt-2">
          {allocations.length > 0 ? (
            <button
              onClick={() => onSave([])}
              className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            >
              Unassign All
            </button>
          ) : <div />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
            <button
              onClick={() => onSave(allocations.map(a => ({ ...a, percentage: parsePct(a.percentage) })).filter(a => a.percentage > 0))}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Save Allocation
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
