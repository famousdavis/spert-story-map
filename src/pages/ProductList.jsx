import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { exportProduct, readImportFile, createNewProduct, duplicateProduct } from '../lib/storage';
import { createSampleProduct } from '../lib/sampleData';
import { getTotalProjectPoints, getAllRibItems, getProjectPercentComplete } from '../lib/calculations';
import { sortByOrder } from '../lib/sortByOrder';
import { useStorage } from '../lib/StorageProvider';
import { useAuth } from '../lib/AuthProvider';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ThemeToggle from '../components/ui/ThemeToggle';
import { useDarkMode } from '../hooks/useDarkMode';
import AppSettingsModal from '../components/settings/AppSettingsModal';
import CreateProjectModal from '../components/product/CreateProjectModal';
import ProjectCard from '../components/product/ProjectCard';
import { Footer } from './ChangelogView';

function enrichProduct(entry, full) {
  const allRibs = getAllRibItems(full);
  const totalPoints = getTotalProjectPoints(full);
  const unsized = allRibs.filter(r => !r.size).length;
  const pctComplete = getProjectPercentComplete(full);
  return { ...entry, totalItems: allRibs.length, totalPoints, unsized, pctComplete };
}

export default function ProductList() {
  const { driver, mode, storageReady } = useStorage();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importConfirm, setImportConfirm] = useState(null);
  const [importError, setImportError] = useState(null);
  const [showWarning, setShowWarning] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useDarkMode();

  // Drag-to-reorder state
  const [projectOrder, setProjectOrder] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dropBeforeId, setDropBeforeId] = useState(null);
  const dropBeforeRef = useRef(null);

  const sortedProducts = useMemo(
    () => sortByOrder(products, projectOrder),
    [products, projectOrder]
  );

  const refresh = useCallback(async () => {
    if (!driver) return;
    setLoading(true);
    try {
      const allProducts = await driver.loadProductIndex();
      const detailed = allProducts.filter(Boolean).map(p => enrichProduct(p, p));
      setProducts(detailed);
    } finally {
      setLoading(false);
    }
  }, [driver]);

  useEffect(() => {
    if (storageReady) refresh();
  }, [storageReady, refresh]);

  // Load persisted project order from preferences
  useEffect(() => {
    if (!driver) return;
    driver.loadPreferences().then(prefs => {
      if (prefs?.projectOrder) setProjectOrder(prefs.projectOrder);
    });
  }, [driver]);

  // Drag-to-reorder handlers
  const handleProjectDragStart = (e, id) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragId(id);
  };

  const handleProjectDragOver = (e, id) => {
    e.preventDefault();
    if (id === dragId) return;
    if (dropBeforeRef.current !== id) {
      dropBeforeRef.current = id;
      setDropBeforeId(id);
    }
  };

  const handleProjectDrop = (e) => {
    e.preventDefault();
    if (!dragId) return;
    const beforeId = dropBeforeRef.current;
    const ids = sortedProducts.map(p => p.id);
    const dragIdx = ids.indexOf(dragId);
    if (dragIdx < 0) return;
    ids.splice(dragIdx, 1);
    if (beforeId) {
      const beforeIdx = ids.indexOf(beforeId);
      ids.splice(beforeIdx >= 0 ? beforeIdx : ids.length, 0, dragId);
    } else {
      ids.push(dragId);
    }
    setProjectOrder(ids);
    // Persist to preferences
    if (driver) {
      driver.loadPreferences().then(prefs => {
        driver.savePreferences({ ...prefs, projectOrder: ids });
      });
    }
    handleProjectDragEnd();
  };

  const handleProjectDragEnd = () => {
    setDragId(null);
    setDropBeforeId(null);
    dropBeforeRef.current = null;
  };

  const handleCreate = async (name, desc) => {
    if (!driver) return;
    const product = createNewProduct(name, desc, driver.getWorkspaceId());
    await driver.createProduct(product);
    setShowCreate(false);
    navigate(`/product/${product.id}/structure`);
  };

  const handleLoadSample = async () => {
    if (!driver) return;
    const sample = createSampleProduct();
    await driver.createProduct(sample);
    refresh();
  };

  const handleDuplicate = async (id) => {
    if (!driver) return;
    const original = await driver.loadProduct(id);
    if (!original) return;
    const dup = duplicateProduct(original, driver.getWorkspaceId());
    await driver.createProduct(dup);
    refresh();
  };

  const handleDelete = async (id) => {
    if (!driver) return;
    await driver.deleteProduct(id);
    refresh();
  };

  const handleExport = async (id) => {
    if (!driver) return;
    const product = await driver.loadProduct(id);
    if (product) exportProduct(product, driver.getWorkspaceId());
  };

  const handleImport = () => {
    setImportError(null);
    readImportFile(
      async (imported) => {
        if (!driver) return;
        const existing = await driver.loadProduct(imported.id);
        if (existing) {
          setImportConfirm({ product: imported, existingName: existing.name });
        } else {
          await driver.saveProductImmediate(imported);
          refresh();
        }
      },
      (errorMsg) => setImportError(errorMsg),
    );
  };

  const confirmImport = async () => {
    if (importConfirm && driver) {
      await driver.saveProductImmediate(importConfirm.product);
      setImportConfirm(null);
      refresh();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              SPERT<sup className="text-[0.45em] text-gray-400 dark:text-gray-500 font-normal tracking-wide">®</sup> Story Map
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Plan and track agile project releases.{' '}
              {mode === 'cloud'
                ? 'Data is stored in your cloud account.'
                : 'Data is stored locally in your browser.'}
            </p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button
              onClick={() => setShowSettings(true)}
              title="App Settings"
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <Link to="/about" className="text-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors">
              About
            </Link>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Project
          </button>
          <button
            onClick={handleImport}
            className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Import Project
          </button>
          <button
            onClick={handleLoadSample}
            className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Load Sample Project
          </button>
        </div>

        {/* Import error */}
        {importError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg px-4 py-3 mb-6 flex items-start justify-between gap-3">
            <p className="text-sm text-red-700 dark:text-red-300">{importError}</p>
            <button onClick={() => setImportError(null)} className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 flex-shrink-0">&times;</button>
          </div>
        )}

        {/* Data warning */}
        {showWarning && mode === 'local' && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg px-4 py-3 mb-6 flex items-start justify-between gap-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Your data is stored in this browser's localStorage. Export regularly to avoid data loss if browser data is cleared.
            </p>
            <button
              onClick={() => setShowWarning(false)}
              className="text-amber-400 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-300 text-sm leading-none flex-shrink-0 mt-0.5"
              aria-label="Dismiss warning"
            >
              &times;
            </button>
          </div>
        )}

        {/* Product List */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <p className="text-sm">Loading projects...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <p className="text-lg mb-2">No projects yet</p>
            <p className="text-sm">Create a new project or load the sample to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedProducts.map(p => (
              <ProjectCard
                key={p.id}
                product={p}
                isShared={!!(p._owner && user && p._owner !== user.uid)}
                isDragging={dragId === p.id}
                isDropTarget={dropBeforeId === p.id}
                onNavigate={() => navigate(`/product/${p.id}/structure`)}
                onExport={() => handleExport(p.id)}
                onDuplicate={() => handleDuplicate(p.id)}
                onDelete={() => setDeleteTarget(p)}
                onDragStart={e => handleProjectDragStart(e, p.id)}
                onDragOver={e => handleProjectDragOver(e, p.id)}
                onDrop={handleProjectDrop}
                onDragEnd={handleProjectDragEnd}
              />
            ))}
          </div>
        )}
      </div>

      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget.id)}
        title="Delete Project"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone. Consider exporting first.`}
      />

      {/* Import Confirm (overwrite existing) */}
      <ConfirmDialog
        open={!!importConfirm}
        onClose={() => setImportConfirm(null)}
        onConfirm={confirmImport}
        title="Overwrite Project"
        message={`Importing "${importConfirm?.product.name}" will overwrite the existing project "${importConfirm?.existingName}" because they share the same internal ID. This cannot be undone.`}
        confirmLabel="Overwrite"
      />

      <AppSettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      <div className="max-w-4xl mx-auto px-6">
        <Footer />
      </div>
    </div>
  );
}
