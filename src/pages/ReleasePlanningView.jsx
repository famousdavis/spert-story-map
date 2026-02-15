import { useState, useMemo, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getAllRibItems, getPointsForRelease, getCoreNonCorePointsForRelease, getTotalProjectPoints, getCoreNonCorePoints } from '../lib/calculations';
import { deleteReleaseFromProduct } from '../lib/settingsMutations';
import { useProductMutations } from '../hooks/useProductMutations';
import ReleaseColumn from '../components/releases/ReleaseColumn';
import AllocationModal from '../components/releases/AllocationModal';

export default function ReleasePlanningView() {
  const { product, updateProduct } = useOutletContext();
  const { addRelease } = useProductMutations(updateProduct);
  const handleDeleteRelease = useCallback((releaseId) => {
    updateProduct(prev => deleteReleaseFromProduct(prev, releaseId));
  }, [updateProduct]);
  const [filter, setFilter] = useState('all');
  const [allocModal, setAllocModal] = useState(null);

  // Card drag state
  const [dragRibId, setDragRibId] = useState(null);
  const [dragFromCol, setDragFromCol] = useState(null); // releaseId or 'unassigned'
  const [dropTarget, setDropTarget] = useState(null); // { col, beforeRibId }
  const dropTargetRef = useRef(null); // Ref to avoid stale closure in handleDrop

  // Column (release) drag state
  const [dragColId, setDragColId] = useState(null);
  const [dropBeforeColId, setDropBeforeColId] = useState(null);
  const dropBeforeColRef = useRef(null);

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
    // Sort by position in order array; items not in order go to end
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

  // Drag handlers — declared before handleDrop so they're available
  const setDropTargetBoth = useCallback((val) => {
    setDropTarget(val);
    dropTargetRef.current = val;
  }, []);

  const handleDragStart = useCallback((ribId, fromCol) => {
    setDragRibId(ribId);
    setDragFromCol(fromCol);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragRibId(null);
    setDragFromCol(null);
    setDropTargetBoth(null);
  }, [setDropTargetBoth]);

  // Full drop handler: move between columns + reorder
  // Does everything in a single updateProduct call to avoid race conditions
  const handleDrop = useCallback((targetCol) => {
    if (!dragRibId) return;

    const rib = allRibs.find(r => r.id === dragRibId);
    if (!rib) { handleDragEnd(); return; }

    const sameColumn = dragFromCol === targetCol;

    // Read the drop target from ref (guaranteed latest)
    const currentDropTarget = dropTargetRef.current;
    const beforeRibId = currentDropTarget?.col === targetCol ? currentDropTarget.beforeRibId : undefined;

    // Compute the new ordering for the target column
    let targetRibs;
    if (targetCol === 'unassigned') {
      targetRibs = sameColumn ? unassigned : [...unassigned.filter(r => r.id !== dragRibId), rib];
    } else {
      targetRibs = sameColumn ? ribsForRelease(targetCol) : [...ribsForRelease(targetCol).filter(r => r.id !== dragRibId), rib];
    }
    const currentIds = targetRibs.map(r => r.id);

    let newOrder;
    if (beforeRibId && beforeRibId !== dragRibId) {
      const withoutDragged = currentIds.filter(id => id !== dragRibId);
      const insertIdx = withoutDragged.indexOf(beforeRibId);
      if (insertIdx >= 0) {
        newOrder = [...withoutDragged.slice(0, insertIdx), dragRibId, ...withoutDragged.slice(insertIdx)];
      } else {
        newOrder = [...withoutDragged, dragRibId];
      }
    } else {
      const withoutDragged = currentIds.filter(id => id !== dragRibId);
      newOrder = [...withoutDragged, dragRibId];
    }

    // Single atomic updateProduct call for both allocation + order changes
    updateProduct(prev => {
      let next = { ...prev };

      // 1. Handle allocation change for cross-column moves
      if (!sameColumn) {
        let newAllocations;
        if (targetCol === 'unassigned') {
          newAllocations = [];
        } else if (dragFromCol === 'unassigned') {
          newAllocations = [{ releaseId: targetCol, percentage: 100, memo: '' }];
        } else {
          const oldAlloc = rib.releaseAllocations.find(a => a.releaseId === dragFromCol);
          const pct = oldAlloc ? oldAlloc.percentage : 100;
          const memo = oldAlloc?.memo || '';
          newAllocations = rib.releaseAllocations
            .filter(a => a.releaseId !== dragFromCol)
            .concat({ releaseId: targetCol, percentage: pct, memo });
        }

        next = {
          ...next,
          themes: next.themes.map(t => ({
            ...t,
            backboneItems: t.backboneItems.map(b => ({
              ...b,
              ribItems: b.ribItems.map(r =>
                r.id === dragRibId ? { ...r, releaseAllocations: newAllocations } : r
              ),
            })),
          })),
        };
      }

      // 2. Update card order — save new order for target column, clean source column
      const prevCardOrder = { ...(next.releaseCardOrder || {}) };
      prevCardOrder[targetCol] = newOrder;

      if (!sameColumn) {
        // Remove dragged card from source column order
        const srcOrder = prevCardOrder[dragFromCol] || [];
        if (srcOrder.includes(dragRibId)) {
          prevCardOrder[dragFromCol] = srcOrder.filter(id => id !== dragRibId);
        }
      }

      next.releaseCardOrder = prevCardOrder;
      return next;
    });

    handleDragEnd();
  }, [dragRibId, dragFromCol, allRibs, unassigned, ribsForRelease, updateProduct, handleDragEnd]);

  const handleColumnDragOver = (e, col) => {
    e.preventDefault();
    // Only set column-level target if not already on a specific card
    if (!dropTargetRef.current || dropTargetRef.current.col !== col) {
      setDropTargetBoth({ col });
    }
  };

  const handleCardDragOver = (e, col, ribId) => {
    e.preventDefault();
    e.stopPropagation();
    if (ribId === dragRibId) return; // Don't target yourself
    if (dropTargetRef.current?.col !== col || dropTargetRef.current?.beforeRibId !== ribId) {
      setDropTargetBoth({ col, beforeRibId: ribId });
    }
  };

  // Column drag handlers
  const handleColDragStart = (e, releaseId) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragColId(releaseId);
  };

  const handleColDragEnd = () => {
    setDragColId(null);
    setDropBeforeColId(null);
    dropBeforeColRef.current = null;
  };

  const handleColDragOver = (e, releaseId) => {
    if (!dragColId || dragColId === releaseId) return;
    e.preventDefault();
    e.stopPropagation();
    if (dropBeforeColRef.current !== releaseId) {
      dropBeforeColRef.current = releaseId;
      setDropBeforeColId(releaseId);
    }
  };

  const handleColDrop = (e) => {
    e.preventDefault();
    if (!dragColId) return;
    const beforeId = dropBeforeColRef.current;

    updateProduct(prev => {
      const releases = [...prev.releases];
      const dragIdx = releases.findIndex(r => r.id === dragColId);
      if (dragIdx < 0) return prev;
      const [dragged] = releases.splice(dragIdx, 1);

      if (beforeId) {
        const beforeIdx = releases.findIndex(r => r.id === beforeId);
        if (beforeIdx >= 0) {
          releases.splice(beforeIdx, 0, dragged);
        } else {
          releases.push(dragged);
        }
      } else {
        releases.push(dragged);
      }

      return { ...prev, releases: releases.map((r, i) => ({ ...r, order: i + 1 })) };
    });

    handleColDragEnd();
  };

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

