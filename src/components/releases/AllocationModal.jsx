import { useState } from 'react';
import { getRibItemPoints } from '../../lib/calculations';
import Modal from '../ui/Modal';

export default function AllocationModal({ rib, product, onSave, onClose }) {
  const [allocations, setAllocations] = useState(
    rib.releaseAllocations.map(a => ({ ...a }))
  );

  const total = allocations.reduce((s, a) => s + a.percentage, 0);
  const pts = getRibItemPoints(rib, product.sizeMapping);

  const addRelease = (releaseId) => {
    if (allocations.some(a => a.releaseId === releaseId)) return;
    const remaining = Math.max(0, 100 - total);
    setAllocations([...allocations, { releaseId, percentage: remaining }]);
  };

  const updatePct = (releaseId, pct) => {
    setAllocations(allocations.map(a =>
      a.releaseId === releaseId ? { ...a, percentage: Math.max(0, Math.min(100, pct)) } : a
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
              <div key={alloc.releaseId} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 w-40 truncate">{release.name}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={alloc.percentage}
                  onChange={e => updatePct(alloc.releaseId, parseInt(e.target.value) || 0)}
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center"
                />
                <span className="text-xs text-gray-400">%</span>
                {pts > 0 && (
                  <span className="text-xs text-gray-500">{Math.round(pts * alloc.percentage / 100)} pts</span>
                )}
                <button onClick={() => removeAlloc(alloc.releaseId)} className="text-red-400 hover:text-red-600 text-sm ml-auto">Remove</button>
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
              onClick={() => onSave(allocations.filter(a => a.percentage > 0))}
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
