import { useState, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import InlineEdit from '../components/ui/InlineEdit';
import SizePicker from '../components/ui/SizePicker';
import CategoryBadge from '../components/ui/CategoryBadge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { getThemeStats, getBackboneStats, getRibItemPoints, getAllocationTotal, getRibItemPercentComplete } from '../lib/calculations';
import { reduceRibs } from '../lib/ribHelpers';
import { useProductMutations } from '../hooks/useProductMutations';

const GRID_COLS = '24px minmax(120px, 1fr) 48px 44px 80px 56px 56px 56px 36px';

export default function StructureView() {
  const { product, updateProduct } = useOutletContext();
  const [collapsed, setCollapsed] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Rib drag-to-reorder state
  const [dragRib, setDragRib] = useState(null); // { themeId, backboneId, ribId }
  const [dropBeforeRib, setDropBeforeRib] = useState(null); // ribId to insert before
  const dropBeforeRef = useRef(null);

  const mutations = useProductMutations(updateProduct);
  const { updateTheme, updateBackbone, updateRib, addTheme, addBackbone, addRib, moveItem } = mutations;

  const toggle = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  const deleteItem = () => {
    if (!deleteTarget) return;
    const { type, themeId, backboneId, ribId } = deleteTarget;
    if (type === 'theme') mutations.deleteTheme(themeId);
    else if (type === 'backbone') mutations.deleteBackbone(themeId, backboneId);
    else if (type === 'rib') mutations.deleteRib(themeId, backboneId, ribId);
  };

  const moveBackbone = (themeId, backboneId, direction) => {
    updateTheme(themeId, t => ({ ...t, backboneItems: moveItem(t.backboneItems, backboneId, direction) }));
  };

  const moveTheme = (themeId, direction) => {
    updateProduct(prev => ({ ...prev, themes: moveItem(prev.themes, themeId, direction) }));
  };

  // Rib drag handlers
  const handleRibDragStart = (themeId, backboneId, ribId) => {
    setDragRib({ themeId, backboneId, ribId });
  };

  const handleRibDragOver = (e, ribId) => {
    e.preventDefault();
    e.stopPropagation();
    if (ribId === dragRib?.ribId) return;
    if (dropBeforeRef.current !== ribId) {
      dropBeforeRef.current = ribId;
      setDropBeforeRib(ribId);
    }
  };

  const handleRibDragEnd = () => {
    setDragRib(null);
    setDropBeforeRib(null);
    dropBeforeRef.current = null;
  };

  const handleRibDrop = (e, targetThemeId, targetBackboneId) => {
    e.preventDefault();
    if (!dragRib) return;

    const beforeRibId = dropBeforeRef.current;

    updateProduct(prev => {
      // Find and remove the rib from its source backbone
      let draggedRib = null;
      const next = {
        ...prev,
        themes: prev.themes.map(t => ({
          ...t,
          backboneItems: t.backboneItems.map(b => {
            if (t.id === dragRib.themeId && b.id === dragRib.backboneId) {
              draggedRib = b.ribItems.find(r => r.id === dragRib.ribId);
              return { ...b, ribItems: b.ribItems.filter(r => r.id !== dragRib.ribId) };
            }
            return b;
          }),
        })),
      };

      if (!draggedRib) return prev;

      // Insert into target backbone
      return {
        ...next,
        themes: next.themes.map(t => ({
          ...t,
          backboneItems: t.backboneItems.map(b => {
            if (t.id === targetThemeId && b.id === targetBackboneId) {
              const items = [...b.ribItems];
              if (beforeRibId) {
                const idx = items.findIndex(r => r.id === beforeRibId);
                if (idx >= 0) {
                  items.splice(idx, 0, draggedRib);
                } else {
                  items.push(draggedRib);
                }
              } else {
                items.push(draggedRib);
              }
              return { ...b, ribItems: items.map((r, i) => ({ ...r, order: i + 1 })) };
            }
            return b;
          }),
        })),
      };
    });

    handleRibDragEnd();
  };

  const stats = useMemo(() => reduceRibs(product, (acc, rib) => {
    acc.totalItems++;
    acc.totalPoints += getRibItemPoints(rib, product.sizeMapping);
    if (!rib.size) acc.unsized++;
    return acc;
  }, { totalItems: 0, totalPoints: 0, unsized: 0 }), [product]);

  return (
    <div className="max-w-3xl">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Structure</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {stats.totalItems} items &middot; {stats.totalPoints} pts
            {stats.unsized > 0 && <span className="text-amber-700 dark:text-amber-400"> &middot; {stats.unsized} unsized</span>}
          </span>
        </div>
        <button
          onClick={addTheme}
          className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
        >
          + Theme
        </button>
      </div>

      {product.themes.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <p>No themes yet. Add a theme to start building your story map.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {product.themes.map((theme, themeIdx) => {
            const themeStats = getThemeStats(theme, product.sizeMapping);
            const isThemeCollapsed = collapsed[theme.id];

            return (
              <div key={theme.id} className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
                {/* Theme header */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-800 group/theme">
                  <button onClick={() => toggle(theme.id)} className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 w-5 flex-shrink-0 text-base leading-none">
                    {isThemeCollapsed ? '▶' : '▼'}
                  </button>
                  <InlineEdit
                    value={theme.name}
                    onSave={name => updateTheme(theme.id, { name })}
                    className="font-semibold text-gray-900 dark:text-gray-100 text-sm"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {themeStats.totalItems} items &middot; {themeStats.totalPoints} pts &middot; <span className={themeStats.percentComplete === 100 ? 'text-emerald-700 dark:text-emerald-400' : 'text-emerald-600 dark:text-emerald-400'}>{themeStats.percentComplete}% done</span>
                    {themeStats.unsized > 0 && <span className="text-amber-700 dark:text-amber-400"> &middot; {themeStats.unsized} unsized</span>}
                  </span>
                  <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover/theme:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => moveTheme(theme.id, -1)} disabled={themeIdx === 0} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 disabled:opacity-30 text-xs px-1">↑</button>
                    <button onClick={() => moveTheme(theme.id, 1)} disabled={themeIdx === product.themes.length - 1} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 disabled:opacity-30 text-xs px-1">↓</button>
                    <button onClick={() => addBackbone(theme.id)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs px-1.5">+ Backbone</button>
                    <button onClick={() => setDeleteTarget({ type: 'theme', themeId: theme.id, name: theme.name })} className="text-red-400 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400 text-xs px-1">&times;</button>
                  </div>
                </div>

                {!isThemeCollapsed && (
                  <div>
                    {theme.backboneItems.length === 0 ? (
                      <div className="px-10 py-4 text-sm text-gray-500 dark:text-gray-400 italic">
                        No backbone items. <button onClick={() => addBackbone(theme.id)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 not-italic">Add one</button>
                      </div>
                    ) : (
                      theme.backboneItems.map((backbone, bbIdx) => {
                        const bbStats = getBackboneStats(backbone, product.sizeMapping);
                        const isBBCollapsed = collapsed[backbone.id];

                        return (
                          <div key={backbone.id} className={bbIdx > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}>
                            {/* Backbone header */}
                            <div className="flex items-center gap-2 pl-8 pr-4 py-2 group/bb">
                              <button onClick={() => toggle(backbone.id)} className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 w-4 flex-shrink-0 text-sm leading-none">
                                {isBBCollapsed ? '▶' : '▼'}
                              </button>
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                              <InlineEdit
                                value={backbone.name}
                                onSave={name => updateBackbone(theme.id, backbone.id, { name })}
                                className="font-medium text-gray-900 dark:text-gray-100 text-sm"
                              />
                              <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                                {bbStats.totalItems} items &middot; {bbStats.totalPoints} pts &middot; <span className={bbStats.percentComplete === 100 ? 'text-emerald-700 dark:text-emerald-400' : 'text-emerald-600 dark:text-emerald-400'}>{bbStats.percentComplete}% done</span> &middot; {bbStats.remainingPoints} remaining
                                {bbStats.unsized > 0 && <span className="text-amber-700 dark:text-amber-400"> &middot; {bbStats.unsized} unsized</span>}
                              </span>
                              <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover/bb:opacity-100 transition-opacity flex-shrink-0">
                                <button onClick={() => moveBackbone(theme.id, backbone.id, -1)} disabled={bbIdx === 0} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 disabled:opacity-30 text-xs px-1">↑</button>
                                <button onClick={() => moveBackbone(theme.id, backbone.id, 1)} disabled={bbIdx === theme.backboneItems.length - 1} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 disabled:opacity-30 text-xs px-1">↓</button>
                                <button onClick={() => addRib(theme.id, backbone.id)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs px-1.5">+ Rib</button>
                                <button onClick={() => setDeleteTarget({ type: 'backbone', themeId: theme.id, backboneId: backbone.id, name: backbone.name })} className="text-red-400 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400 text-xs px-1">&times;</button>
                              </div>
                            </div>

                            {/* Rib items — table-like grid */}
                            {!isBBCollapsed && (
                              <div className="pb-1">
                                {backbone.ribItems.length === 0 ? (
                                  <div className="pl-16 pr-4 py-2 text-sm text-gray-500 dark:text-gray-400 italic">
                                    No rib items. <button onClick={() => addRib(theme.id, backbone.id)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 not-italic">Add one</button>
                                  </div>
                                ) : (
                                  <div className="ml-14 mr-4">
                                    {/* Column header */}
                                    <div
                                      className="grid items-center text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pb-0.5 border-b border-gray-100 dark:border-gray-800 mb-0.5"
                                      style={{ gridTemplateColumns: GRID_COLS }}
                                    >
                                      <span></span>
                                      <span>Name</span>
                                      <span className="text-center">Size</span>
                                      <span className="text-right">Pts</span>
                                      <span className="text-center">Type</span>
                                      <span className="text-right">Alloc</span>
                                      <span className="text-right">Done</span>
                                      <span className="text-right">Rem</span>
                                      <span></span>
                                    </div>

                                    <div
                                      onDragOver={e => e.preventDefault()}
                                      onDrop={e => handleRibDrop(e, theme.id, backbone.id)}
                                    >
                                    {backbone.ribItems.map((rib) => {
                                      const pts = getRibItemPoints(rib, product.sizeMapping);
                                      const allocTotal = getAllocationTotal(rib);
                                      const pctComplete = getRibItemPercentComplete(rib);
                                      const remaining = Math.round(pts * (100 - pctComplete) / 100);
                                      const isDragging = dragRib?.ribId === rib.id;
                                      const isDropTarget = dropBeforeRib === rib.id && dragRib?.ribId !== rib.id;

                                      return (
                                        <div key={rib.id}>
                                          {isDropTarget && (
                                            <div className="h-0.5 bg-blue-400 rounded-full mx-1 my-0.5" />
                                          )}
                                          <div
                                            draggable
                                            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; handleRibDragStart(theme.id, backbone.id, rib.id); }}
                                            onDragEnd={handleRibDragEnd}
                                            onDragOver={e => handleRibDragOver(e, rib.id)}
                                            className={`grid items-center py-1 group/rib hover:bg-blue-50/50 dark:hover:bg-blue-900/20 rounded transition-colors ${isDragging ? 'opacity-40' : ''}`}
                                            style={{ gridTemplateColumns: GRID_COLS }}
                                          >
                                            {/* Drag handle */}
                                            <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 opacity-0 group-hover/rib:opacity-100 transition-opacity">
                                              <span className="text-[10px] leading-none select-none dark:text-gray-600">⠿</span>
                                            </div>

                                            {/* Name */}
                                            <div className="min-w-0 pr-2">
                                              <InlineEdit
                                                value={rib.name}
                                                onSave={name => updateRib(theme.id, backbone.id, rib.id, { name })}
                                                className="text-[13px] text-gray-800 dark:text-gray-200 truncate"
                                              />
                                            </div>

                                            {/* Size */}
                                            <div className="text-center">
                                              <SizePicker
                                                value={rib.size}
                                                sizeMapping={product.sizeMapping}
                                                onChange={size => updateRib(theme.id, backbone.id, rib.id, { size })}
                                              />
                                            </div>

                                            {/* Points */}
                                            <div className="text-right">
                                              <span className="text-[13px] text-gray-600 dark:text-gray-400 tabular-nums">{pts || '—'}</span>
                                            </div>

                                            {/* Category */}
                                            <div className="text-center">
                                              <CategoryBadge
                                                category={rib.category}
                                                onClick={() => updateRib(theme.id, backbone.id, rib.id, { category: rib.category === 'core' ? 'non-core' : 'core' })}
                                              />
                                            </div>

                                            {/* Allocation */}
                                            <div className="text-right">
                                              {allocTotal > 0 ? (
                                                <span className={`text-[13px] tabular-nums ${allocTotal === 100 ? 'text-gray-600 dark:text-gray-400' : 'text-amber-700 dark:text-amber-400 font-medium'}`}>
                                                  {allocTotal}%
                                                </span>
                                              ) : (
                                                <span className="text-[13px] text-gray-400 dark:text-gray-500">—</span>
                                              )}
                                            </div>

                                            {/* Progress */}
                                            <div className="text-right">
                                              {pctComplete > 0 ? (
                                                <span className={`text-[13px] tabular-nums ${pctComplete === 100 ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                  {pctComplete}%
                                                </span>
                                              ) : (
                                                <span className="text-[13px] text-gray-400 dark:text-gray-500">—</span>
                                              )}
                                            </div>

                                            {/* Remaining */}
                                            <div className="text-right">
                                              {pts > 0 ? (
                                                <span className={`text-[13px] tabular-nums ${remaining === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                                                  {remaining}
                                                </span>
                                              ) : (
                                                <span className="text-[13px] text-gray-400 dark:text-gray-500">—</span>
                                              )}
                                            </div>

                                            {/* Delete */}
                                            <div className="flex items-center justify-end opacity-0 group-hover/rib:opacity-100 transition-opacity">
                                              <button onClick={() => setDeleteTarget({ type: 'rib', themeId: theme.id, backboneId: backbone.id, ribId: rib.id, name: rib.name })} className="text-red-400 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400 text-xs px-0.5">&times;</button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    </div>
                                  </div>
                                )}
                                <button
                                  onClick={() => addRib(theme.id, backbone.id)}
                                  className="ml-14 mt-0.5 mb-1 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                  + Add rib item
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteItem}
        title={`Delete ${deleteTarget?.type}`}
        message={`Are you sure you want to delete "${deleteTarget?.name}"? ${
          deleteTarget?.type === 'theme' ? 'All backbone items and rib items within it will also be deleted.' :
          deleteTarget?.type === 'backbone' ? 'All rib items within it will also be deleted.' :
          'This cannot be undone.'
        }`}
      />
    </div>
  );
}
