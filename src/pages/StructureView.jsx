import { useState, useMemo, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import InlineEdit from '../components/ui/InlineEdit';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import BackboneSection from '../components/structure/BackboneSection';
import { getThemeStats, getBackboneStats, getRibItemPoints, getAllocationTotal, getRibItemPercentComplete } from '../lib/calculations';
import { reduceRibs } from '../lib/ribHelpers';
import { useProductMutations } from '../hooks/useProductMutations';
import { THEME_COLOR_OPTIONS, getThemeColorClasses } from '../lib/themeColors';

export default function StructureView() {
  const { product, updateProduct } = useOutletContext();
  const [collapsed, setCollapsed] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [colorPickerThemeId, setColorPickerThemeId] = useState(null);
  const colorPickerRef = useRef(null);

  // Rib drag-to-reorder state
  const [dragRib, setDragRib] = useState(null);
  const [dropBeforeRib, setDropBeforeRib] = useState(null);
  const dropBeforeRef = useRef(null);

  const mutations = useProductMutations(updateProduct);
  const { updateTheme, updateBackbone, updateRib, addTheme, addBackbone, addRib, moveItem } = mutations;

  // Close color picker on click outside
  useEffect(() => {
    if (!colorPickerThemeId) return;
    const handler = (e) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
        setColorPickerThemeId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPickerThemeId]);

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

      return {
        ...next,
        themes: next.themes.map(t => ({
          ...t,
          backboneItems: t.backboneItems.map(b => {
            if (t.id === targetThemeId && b.id === targetBackboneId) {
              const items = [...b.ribItems];
              if (beforeRibId) {
                const idx = items.findIndex(r => r.id === beforeRibId);
                if (idx >= 0) items.splice(idx, 0, draggedRib);
                else items.push(draggedRib);
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

  const handleDeleteRib = (themeId, backboneId, ribId, name) => {
    setDeleteTarget({ type: 'rib', themeId, backboneId, ribId, name });
  };

  const handleDeleteBackbone = (themeId, backboneId, name) => {
    setDeleteTarget({ type: 'backbone', themeId, backboneId, name });
  };

  // Pre-compute rib stats to pass down as flat props
  const enrichedProduct = useMemo(() => ({
    ...product,
    themes: product.themes.map(theme => ({
      ...theme,
      backboneItems: theme.backboneItems.map(backbone => ({
        ...backbone,
        ribItems: backbone.ribItems.map(rib => {
          const pts = getRibItemPoints(rib, product.sizeMapping);
          const pctComplete = getRibItemPercentComplete(rib);
          return {
            ...rib,
            _pts: pts,
            _allocTotal: getAllocationTotal(rib),
            _pctComplete: pctComplete,
            _remaining: Math.round(pts * (100 - pctComplete) / 100),
          };
        }),
      })),
    })),
  }), [product]);

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
          {enrichedProduct.themes.map((theme, themeIdx) => {
            const themeStats = getThemeStats(theme, product.sizeMapping);
            const isThemeCollapsed = collapsed[theme.id];
            const themeColor = getThemeColorClasses(theme, themeIdx);

            return (
              <div key={theme.id} className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
                {/* Theme header */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-800 group/theme">
                  <button onClick={() => toggle(theme.id)} className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 w-5 flex-shrink-0 text-base leading-none">
                    {isThemeCollapsed ? '▶' : '▼'}
                  </button>
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setColorPickerThemeId(prev => prev === theme.id ? null : theme.id)}
                      className={`w-4 h-4 rounded-full ${themeColor.swatch} ring-1 ring-black/10 hover:ring-2 hover:ring-black/20 transition-shadow`}
                      title="Change theme color"
                    />
                    {colorPickerThemeId === theme.id && (
                      <div ref={colorPickerRef} className="absolute top-6 left-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-2 flex gap-1.5">
                        {THEME_COLOR_OPTIONS.map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => { updateTheme(theme.id, { color: opt.key }); setColorPickerThemeId(null); }}
                            className={`w-5 h-5 rounded-full ${opt.swatch} hover:scale-110 transition-transform ${theme.color === opt.key ? 'ring-2 ring-offset-1 ring-gray-800 dark:ring-gray-200 dark:ring-offset-gray-800' : 'ring-1 ring-black/10'}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
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
                      theme.backboneItems.map((backbone, bbIdx) => (
                        <BackboneSection
                          key={backbone.id}
                          theme={theme}
                          backbone={backbone}
                          bbIdx={bbIdx}
                          themeColor={themeColor}
                          sizeMapping={product.sizeMapping}
                          isCollapsed={collapsed[backbone.id]}
                          onToggle={() => toggle(backbone.id)}
                          dragRib={dragRib}
                          dropBeforeRib={dropBeforeRib}
                          onRibDragStart={handleRibDragStart}
                          onRibDragEnd={handleRibDragEnd}
                          onRibDragOver={handleRibDragOver}
                          onRibDrop={handleRibDrop}
                          onRenameBackbone={updateBackbone}
                          onUpdateRib={updateRib}
                          onDeleteBackbone={handleDeleteBackbone}
                          onAddRib={addRib}
                          onDeleteRib={handleDeleteRib}
                          onMoveBackbone={moveBackbone}
                          bbStats={getBackboneStats(backbone, product.sizeMapping)}
                        />
                      ))
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
