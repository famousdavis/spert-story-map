import { useState, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getAllRibItems, getPointsForRelease, getCoreNonCorePointsForRelease, getTotalProjectPoints, getCoreNonCorePoints, getReleasePercentComplete } from '../lib/calculations';
import { deleteReleaseFromProduct } from '../lib/settingsMutations';
import { useProductMutations } from '../hooks/useProductMutations';
import { useReleaseDrag } from '../hooks/useReleaseDrag';
import ReleaseColumn from '../components/releases/ReleaseColumn';
import AllocationModal from '../components/releases/AllocationModal';

export default function ReleasePlanningView() {
  const { product, updateProduct } = useOutletContext();
  const { addRelease } = useProductMutations(updateProduct);
  const handleDeleteRelease = useCallback((releaseId) => {
    updateProduct(prev => deleteReleaseFromProduct(prev, releaseId));
  }, [updateProduct]);
  const handleRenameRelease = useCallback((releaseId, newName) => {
    updateProduct(prev => ({
      ...prev,
      releases: prev.releases.map(r => r.id === releaseId ? { ...r, name: newName } : r),
    }));
  }, [updateProduct]);
  const [filter, setFilter] = useState('all');
  const [allocModal, setAllocModal] = useState(null);

  const allRibs = useMemo(() => getAllRibItems(product), [product]);
  const totalPoints = useMemo(() => getTotalProjectPoints(product), [product]);
  const { core: totalCore, nonCore: totalNonCore } = useMemo(() => getCoreNonCorePoints(product), [product]);

  const filteredRibs = useMemo(() => {
    if (filter === 'all') return allRibs;
    return allRibs.filter(r => r.category === filter);
  }, [allRibs, filter]);

  // Card ordering per column — stored in product.releaseCardOrder
  const cardOrder = product.releaseCardOrder;

  const getSortedRibs = useCallback((colId, ribs) => {
    const order = cardOrder?.[colId];
    if (!order || order.length === 0) return ribs;
    const sorted = [...ribs].sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return sorted;
  }, [cardOrder]);

  const unassigned = useMemo(() => {
    const items = filteredRibs.filter(r => r.releaseAllocations.length === 0);
    return getSortedRibs('unassigned', items);
  }, [filteredRibs, getSortedRibs]);

  const ribsForRelease = useCallback((releaseId) => {
    const items = filteredRibs.filter(r => r.releaseAllocations.some(a => a.releaseId === releaseId));
    return getSortedRibs(releaseId, items);
  }, [filteredRibs, getSortedRibs]);

  // Update a single rib's allocations
  const updateRibAllocation = useCallback((ribId, allocations) => {
    updateProduct(prev => ({
      ...prev,
      themes: prev.themes.map(t => ({
        ...t,
        backboneItems: t.backboneItems.map(b => ({
          ...b,
          ribItems: b.ribItems.map(r =>
            r.id === ribId ? { ...r, releaseAllocations: allocations } : r
          ),
        })),
      })),
    }));
  }, [updateProduct]);

  const {
    dragRibId, dropTarget,
    handleDragStart, handleDragEnd, handleDrop,
    handleColumnDragOver, handleCardDragOver,
    dragColId, dropBeforeColId,
    handleColDragStart, handleColDragEnd, handleColDragOver, handleColDrop,
  } = useReleaseDrag(updateProduct, allRibs, unassigned, ribsForRelease);

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Release Planning</h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">{totalPoints} pts <span className="text-blue-500 dark:text-blue-400">{totalCore} core</span> · <span className="text-gray-400 dark:text-gray-500">{totalNonCore} non-core</span></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">Filter:</span>
          {['all', 'core', 'non-core'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                filter === f
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {f === 'all' ? 'All' : f === 'core' ? 'Core' : 'Non-core'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
          {/* Unassigned column */}
          <ReleaseColumn
            colId="unassigned"
            release={null}
            ribs={unassigned}
            product={product}
            dragRibId={dragRibId}
            dropTarget={dropTarget}
            onColumnDragOver={handleColumnDragOver}
            onColumnDrop={handleDrop}
            onCardDragStart={handleDragStart}
            onCardDragEnd={handleDragEnd}
            onCardDragOver={handleCardDragOver}
            onCardDrop={handleDrop}
            onCardClick={setAllocModal}
          />

          {/* Release columns */}
          {product.releases.map(release => (
            <ReleaseColumn
              key={release.id}
              colId={release.id}
              release={release}
              ribs={ribsForRelease(release.id)}
              stats={{
                totalPts: Math.round(getPointsForRelease(product, release.id)),
                ...getCoreNonCorePointsForRelease(product, release.id),
                percentComplete: getReleasePercentComplete(product, release.id),
              }}
              product={product}
              dragRibId={dragRibId}
              dropTarget={dropTarget}
              isColDropTarget={dropBeforeColId === release.id && dragColId && dragColId !== release.id}
              isColDragging={dragColId === release.id}
              onColumnDragOver={dragColId ? undefined : handleColumnDragOver}
              onColumnDrop={handleDrop}
              onColDragStart={handleColDragStart}
              onColDragEnd={handleColDragEnd}
              onColDragOver={dragColId ? handleColDragOver : undefined}
              onColDrop={dragColId ? handleColDrop : undefined}
              onCardDragStart={handleDragStart}
              onCardDragEnd={handleDragEnd}
              onCardDragOver={handleCardDragOver}
              onCardDrop={handleDrop}
              onCardClick={setAllocModal}
              onDeleteRelease={handleDeleteRelease}
              onRenameRelease={handleRenameRelease}
            />
          ))}

          {/* Add release column */}
          <div className="flex-shrink-0 w-72">
            <button
              onClick={addRelease}
              className="w-full h-24 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              <span className="text-lg">+</span>
              <span className="text-sm font-medium">Add Release</span>
            </button>
          </div>
        </div>

      {/* Allocation modal */}
      {allocModal && (
        <AllocationModal
          rib={allocModal}
          product={product}
          onSave={(allocations) => {
            updateRibAllocation(allocModal.id, allocations);
            setAllocModal(null);
          }}
          onClose={() => setAllocModal(null)}
        />
      )}
    </div>
  );
}
