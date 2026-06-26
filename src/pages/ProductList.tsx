// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { exportProduct, createNewProduct, duplicateProduct, loadProductIndex as loadLocalIndex } from '../lib/storage';
import { exportAllProductsBundled } from '../lib/importExport';
import { useImportState } from '../hooks/useImportState';
import ImportPreviewSection from '../components/product/ImportPreviewSection';
import { createSampleProduct } from '../lib/sampleData';
import { getTotalProjectPoints, getAllRibItems, getProjectPercentComplete } from '../lib/calculations';
import { sortByOrder } from '../lib/sortByOrder';
import { useStorage } from '../lib/StorageProvider';
import { useAuth } from '../lib/AuthProvider';
import { INVITATIONS_ENABLED } from '../lib/featureFlags';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ThemeToggle from '../components/ui/ThemeToggle';
import StorageStatusPill from '../components/ui/StorageStatusPill';
import { useDarkMode } from '../hooks/useDarkMode';
import AppSettingsModal from '../components/settings/AppSettingsModal';
import FirstRunBanner from '../components/ui/FirstRunBanner';
import CreateProjectModal from '../components/product/CreateProjectModal';
import ProjectCard from '../components/product/ProjectCard';
import ShareDialog from '../components/product/ShareDialog';
import { Footer } from './ChangelogView';

function enrichProduct(product) {
  const allRibs = getAllRibItems(product);
  const totalPoints = getTotalProjectPoints(product);
  const unsized = allRibs.filter(r => !r.size).length;
  const pctComplete = getProjectPercentComplete(product);
  return { ...product, totalItems: allRibs.length, totalPoints, unsized, pctComplete };
}

export default function ProductList() {
  const { driver, mode, storageReady } = useStorage();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [cloudDataLoaded, setCloudDataLoaded] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [localOrphanCount, setLocalOrphanCount] = useState(0);
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);
  // One-shot banner shown when useProduct redirects here with router state
  // because of a permission-denied (collaborator removed mid-session OR
  // cold-load against a now-inaccessible project). Cleared by the explicit
  // Dismiss button or by router-state cleanup below.
  const [accessDeniedMsg, setAccessDeniedMsg] = useState(false);
  // Save error banner — multi-subscriber to driver.onSaveError. ProductLayout
  // also subscribes; both surface independently because users can hit save
  // failures from either screen.
  const [saveError, setSaveError] = useState(false);
  const { user } = useAuth();
  const isCloudMode = mode === 'cloud';
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme, isDark } = useDarkMode();

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
      const detailed = allProducts.filter(Boolean).map(p => enrichProduct(p));
      setProducts(detailed);
      if (mode === 'cloud') setCloudDataLoaded(true);
      // In cloud mode, detect local projects that weren't migrated. Explicit
      // 'local' override — the active namespace is the cloud user's uid here,
      // so the default-namespace read would return that user's local-mode
      // cache (signed-in users can technically have a per-uid local cache),
      // not the anonymous-session orphans we want to surface a banner for.
      if (mode === 'cloud' && detailed.length === 0) {
        setLocalOrphanCount(loadLocalIndex('local').length);
      } else {
        setLocalOrphanCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, [driver, mode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh sets state; intentional on storage ready
    if (storageReady) refresh();
  }, [storageReady, refresh]);

  // Reset cloud hydration flag when mode or driver changes (e.g., uid-change
  // driver swap). Each change is followed by exactly one refresh() call →
  // cloudDataLoaded=true; the briefly-disabled Import button is acceptable.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional hydration-flag reset on driver swap
    setCloudDataLoaded(false);
  }, [mode, driver]);

  // One-shot capture of router-state from useProduct redirects. Mount-only:
  // StrictMode double-invokes the effect, but the second run finds the
  // flag already cleared (location.state was nulled by the first run) and
  // is a no-op.
  /* eslint-disable react-hooks/exhaustive-deps -- mount-once; StrictMode double-fire is no-op after first clear */
  useEffect(() => {
    const denied = (location.state as { productAccessDenied?: boolean } | null)?.productAccessDenied;
    if (denied) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot banner from router state
      setAccessDeniedMsg(true);
      // Clear the router state so a subsequent navigation (back/forward, link
      // click) doesn't re-trigger the banner on re-mount.
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Subscribe to driver save errors. ProductLayout subscribes on the product
  // detail screens; this subscription covers actions taken from the project
  // list (create, duplicate, delete) so a failed save there isn't silent.
  useEffect(() => {
    if (!driver) return;
    const unsub = driver.onSaveError(() => setSaveError(true));
    return unsub;
  }, [driver]);

  const {
    phase: importPhase,
    fileInputRef,
    handleFileChange,
    setDecision: setImportDecision,
    handleConfirmImport,
    handleCancel: cancelImport,
  } = useImportState(driver, mode, cloudDataLoaded, refresh);

  // Refresh project list when a pending invitation is claimed.
  // `refresh` is useCallback([driver, mode]) — stable; effect re-attaches
  // only when mode or driver changes, both legitimate triggers.
  //
  // J2 peer-refresh gate: drop the hydrated flag BEFORE re-refreshing so the
  // Import button briefly disables (it gates on cloudDataLoaded). Without
  // the gate flip, a user who clicks Import in the ~100ms refresh window
  // could race the project list and see partial data.
  useEffect(() => {
    if (!INVITATIONS_ENABLED) return;
    const onModelsChanged = async () => {
      if (mode !== 'cloud') return;
      setCloudDataLoaded(false);
      await refresh();
    };
    window.addEventListener('spert:models-changed', onModelsChanged);
    return () => window.removeEventListener('spert:models-changed', onModelsChanged);
  }, [mode, refresh]);

  // Load persisted project order from preferences
  useEffect(() => {
    if (!driver) return;
    driver.loadPreferences().then(prefs => {
      if (prefs?.projectOrder) setProjectOrder(prefs.projectOrder);
      if (mode === 'local' && !prefs?.suppressLocalStorageWarning) {
        setShowWarning(true);
      }
    });
  }, [driver, mode]);

  // Drag-to-reorder handlers
  const handleProjectDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragId(id);
  };

  const handleProjectDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id === dragId) return;
    if (dropBeforeRef.current !== id) {
      dropBeforeRef.current = id;
      setDropBeforeId(id);
    }
  };

  const handleProjectDrop = (e: React.DragEvent) => {
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

  const handleRename = async (id, name) => {
    if (!driver) return;
    // Load fresh so we persist the real product, not the enriched list summary
    // (which carries derived totals). saveProductImmediate bumps updatedAt and,
    // in cloud mode, merges only changed fields — never owner/members.
    const product = await driver.loadProduct(id);
    if (!product) return;
    await driver.saveProductImmediate({ ...product, name });
    refresh();
  };

  const handleExport = async (id) => {
    if (!driver) return;
    const product = await driver.loadProduct(id);
    if (product) await exportProduct(product, driver, driver.getWorkspaceId());
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-6 py-12 flex-1 w-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                to="/"
                onClick={() => window.scrollTo(0, 0)}
                aria-label="Go to projects home"
                className="mr-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <img
                  src={isDark ? "/spert-favicon-storymap-dark.png" : "/spert-favicon-storymap.png"}
                  alt="SPERT Story Map icon"
                  className="h-7 w-7 rounded-lg ring-1 ring-white/20"
                />
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                SPERT<sup className="text-[0.45em] text-gray-400 dark:text-gray-500 font-normal tracking-wide">®</sup> Story Map
              </h1>
            </div>
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
            <StorageStatusPill onClick={() => setShowSettings(true)} />
          </div>
        </div>

        <FirstRunBanner />

        {/* Access-denied banner — one-shot, shown after useProduct redirects
            here because Firestore returned permission-denied (owner revoked
            collaborator access mid-session, or revoked between sessions). */}
        {accessDeniedMsg && (
          <div className="mb-4 flex items-start justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              You no longer have access to that project.
            </p>
            <button
              onClick={() => setAccessDeniedMsg(false)}
              className="text-xs font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Save error banner — mode-aware copy (matches ProductLayout). */}
        {saveError && (
          <div className="mb-4 flex items-start justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-lg px-4 py-3">
            <p className="text-sm text-red-800 dark:text-red-200">
              {mode === 'cloud'
                ? 'Changes may not have saved. Check your connection.'
                : 'Your browser may be out of storage or in private mode. Latest changes may not have been saved.'}
            </p>
            <button
              onClick={() => setSaveError(false)}
              className="text-xs font-medium text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-100 ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Project
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={(mode === 'cloud' && !cloudDataLoaded) || importPhase.tag === 'applying'}
            className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import Project
          </button>
          <button
            onClick={() => driver && exportAllProductsBundled(driver, driver.getWorkspaceId())}
            disabled={products.length === 0}
            className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export All Projects
          </button>
          <button
            onClick={handleLoadSample}
            className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Load Sample Project
          </button>
        </div>

        <ImportPreviewSection
          phase={importPhase}
          mode={mode}
          cloudDataLoaded={cloudDataLoaded}
          fileInputRef={fileInputRef}
          onFileChange={handleFileChange}
          onSetDecision={setImportDecision}
          onConfirm={handleConfirmImport}
          onCancel={cancelImport}
        />

        {/* Data warning */}
        {showWarning && mode === 'local' && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg px-4 py-3 mb-6 flex items-start justify-between gap-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Your data exists only in this browser</strong> and can be lost
              without warning. Export at the end of every session to protect your work.
            </p>
            <button
              onClick={() => setShowWarning(false)}
              className="text-xs font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 flex-shrink-0"
            >
              Got it
            </button>
          </div>
        )}

        {/* Cloud orphan warning */}
        {localOrphanCount > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg px-4 py-3 mb-6">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              Your cloud account has no projects, but you have {localOrphanCount} project{localOrphanCount !== 1 ? 's' : ''} stored locally.
              Go to App Settings → Storage to upload them, or switch back to Local mode.
            </p>
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
            {sortedProducts.map(p => {
              // isOwner: local-mode users own all their projects; cloud-mode users
              // own only projects where _owner matches their uid. isShared is the
              // near-inverse: true when someone else's cloud project is shared with you.
              const isOwner = mode !== 'cloud' || !p._owner || p._owner === user?.uid;
              return (
                <ProjectCard
                  key={p.id}
                  product={p}
                  isShared={!!(p._owner && user && p._owner !== user.uid)}
                  isOwner={isOwner}
                  isCloudMode={isCloudMode}
                  isDragging={dragId === p.id}
                  isDropTarget={dropBeforeId === p.id}
                  onNavigate={() => navigate(`/product/${p.id}/structure`)}
                  onRename={newName => handleRename(p.id, newName)}
                  onShare={() => setShareTarget({ id: p.id, name: p.name })}
                  onExport={() => handleExport(p.id)}
                  onDuplicate={() => handleDuplicate(p.id)}
                  onDelete={() => setDeleteTarget(p)}
                  onDragStart={e => handleProjectDragStart(e, p.id)}
                  onDragOver={e => handleProjectDragOver(e, p.id)}
                  onDrop={handleProjectDrop}
                  onDragEnd={handleProjectDragEnd}
                />
              );
            })}
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

      <AppSettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      {shareTarget && (
        <ShareDialog
          productId={shareTarget.id}
          productName={shareTarget.name}
          onClose={() => setShareTarget(null)}
        />
      )}

      <Footer />
    </div>
  );
}
