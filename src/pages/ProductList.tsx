// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { exportProduct, createNewProduct, duplicateProduct, loadProductIndex as loadLocalIndex } from '../lib/storage';
import { exportAllProductsBundled } from '../lib/importExport';
import { useImportState } from '../hooks/useImportState';
import { useProjectOrder } from '../hooks/useProjectOrder';
import ImportPreviewSection from '../components/product/ImportPreviewSection';
import { createSampleProduct } from '../lib/sampleData';
import { getTotalProjectPoints, getAllRibItems, getProjectPercentComplete, isRibUnsized } from '../lib/calculations';
import { getStrandedRows } from '../lib/reconciliation';
import { cloneName } from '../lib/cloneName';
import { swallowRestOfGesture } from '../lib/gestureGuard';
import { useStorage } from '../lib/StorageProvider';
import { useAuth } from '../lib/AuthProvider';
import { INVITATIONS_ENABLED } from '../lib/featureFlags';
import { useDarkMode } from '../hooks/useDarkMode';
import AppSettingsModal from '../components/settings/AppSettingsModal';
import AppNotices from '../components/ui/AppNotices';
import ProjectsHeader from '../components/product/ProjectsHeader';
import ProjectsToolbar from '../components/product/ProjectsToolbar';
import ProjectGrid, { type GridProject } from '../components/product/ProjectGrid';
import ProjectsEmptyState from '../components/product/ProjectsEmptyState';
import ProjectDialog, { type ProjectEdits } from '../components/product/ProjectDialog';
import DeleteProjectDialog from '../components/product/DeleteProjectDialog';
import { findTile, findTileControl } from '../components/product/tile-focus';
import ShareDialog from '../components/product/ShareDialog';
import { Footer } from './ChangelogView';
import type { MemberRole, Product, StorageDriver } from '../types';

function enrichProduct(product: Product) {
  const allRibs = getAllRibItems(product);
  const totalPoints = getTotalProjectPoints(product);
  const unsized = allRibs.filter(r => isRibUnsized(r, product.sizeMapping)).length;
  const pctComplete = getProjectPercentComplete(product);
  const stranded = getStrandedRows(product).length;
  return {
    ...product, totalItems: allRibs.length, totalPoints, unsized, pctComplete, stranded,
    releaseCount: product.releases.length, sprintCount: product.sprints.length,
  };
}

/** A Product plus the derived figures its tile displays. */
type EnrichedProduct = ReturnType<typeof enrichProduct>;

type DialogState = { kind: 'new' } | { kind: 'edit'; id: string; name: string; description: string };
type DeleteTarget = { id: string; name: string; next?: string; prev?: string };
type FocusRequest = { kind: 'open'; id: string } | ({ kind: 'deleted' } & DeleteTarget);

/**
 * The person's role on a project, as the Firestore rules decide it (`members[uid]`). Local mode:
 * owner. In the cloud anything else, an absent entry included, counts as a viewer: fail closed.
 */
function roleOf(p: Product, isCloud: boolean, uid: string | undefined): MemberRole | undefined {
  if (!isCloud) return 'owner';
  return uid ? p._members?.[uid] : undefined;
}

export default function ProductList() {
  const { driver, mode, storageReady } = useStorage();
  const [products, setProducts] = useState<EnrichedProduct[]>([]);
  // "Loading products..." is for the first load on a driver only. Every later refresh (an action,
  // an import, an invitation) updates the list in place, so untouched tiles keep their DOM nodes
  // and focus stays where it was.
  const [loadedFor, setLoadedFor] = useState<StorageDriver | null>(null);
  const loading = loadedFor !== driver;
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{ id: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const announceTimerRef = useRef<number | null>(null);
  const [cloudDataLoaded, setCloudDataLoaded] = useState(false);
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

  const mainRef = useRef<HTMLElement>(null);
  const newProjectRef = useRef<HTMLButtonElement>(null);
  // The button that opened the New Product dialog: the toolbar's, or the welcome panel's.
  const newOpenerRef = useRef<HTMLElement | null>(null);
  const deleteConfirmedRef = useRef(false);

  const order = useProjectOrder(driver, products);
  const { refreshStarted, listed } = order;

  const refresh = useCallback(async () => {
    if (!driver) return;
    const gen = refreshStarted();
    try {
      const allProducts = await driver.loadProductIndex();
      // Each project on its own: one that cannot be summarised is left off the
      // list rather than leaving the whole list empty. The shape guard on both
      // read paths makes this unreachable; this is the containment behind it.
      const detailed = allProducts.filter(Boolean).flatMap(p => {
        try {
          return [enrichProduct(p)];
        } catch (e) {
          console.warn('[load-guard] project left off the list:', p.id, e instanceof Error ? e.name : 'Error');
          return [];
        }
      });
      listed(detailed, gen);
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
      setLoadedFor(driver);
    }
  }, [driver, mode, refreshStarted, listed]);

  useEffect(() => {
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

  // Focus moves from an effect, after the re-render that shows the result: never from a handler
  // or a dialog's cleanup, which run before the list holds it.
  useEffect(() => {
    if (!focusRequest) return;
    const root = mainRef.current;
    if (focusRequest.kind === 'open') {
      findTileControl(root, focusRequest.id, 'open')?.focus();
      return;
    }
    // A refused delete leaves the project listed: focus goes back to its Delete. Otherwise the
    // next tile's open button, else the previous one's, else New Product.
    const { id, next, prev } = focusRequest;
    const target = findTileControl(root, id, 'delete')
      ?? (next ? findTileControl(root, next, 'open') : null)
      ?? (prev ? findTileControl(root, prev, 'open') : null)
      ?? newProjectRef.current;
    target?.focus();
  }, [focusRequest]);

  // A new tile (a clone, the sample) is scrolled into view once it is on the page.
  useEffect(() => {
    if (scrollTarget) findTile(mainRef.current, scrollTarget.id)?.scrollIntoView({ block: 'nearest' });
  }, [scrollTarget]);

  // A live region speaks only when its text changes, so the same message twice (a second Load
  // Sample) would be silent. Empty it first, in its own render, then set the message a tick later.
  const announce = (message: string) => {
    if (announceTimerRef.current !== null) window.clearTimeout(announceTimerRef.current);
    flushSync(() => setAnnouncement(''));
    announceTimerRef.current = window.setTimeout(() => {
      announceTimerRef.current = null;
      setAnnouncement(message);
    }, 0);
  };
  useEffect(() => () => {
    if (announceTimerRef.current !== null) window.clearTimeout(announceTimerRef.current);
  }, []);

  const handleCreate = async (name: string, desc: string) => {
    if (!driver) return;
    const product = createNewProduct(name, desc, driver.getWorkspaceId());
    await driver.createProduct(product);
    setDialog(null);
    navigate(`/product/${product.id}/structure`);
  };

  // Edit writes only what changed, onto a fresh load: an untouched field is left as stored, so a
  // description written meanwhile elsewhere survives a rename. No changelog entry, as before.
  const handleUpdate = async (id: string, edits: ProjectEdits) => {
    setDialog(null);
    if (!driver) return;
    const product = await driver.loadProduct(id);
    if (!product) return;
    await driver.saveProductImmediate({ ...product, ...edits });
    await refresh();
  };

  const handleLoadSample = async (fromWelcome: boolean) => {
    if (!driver) return;
    const sample = createSampleProduct();
    await driver.createProduct(sample);
    await refresh();
    announce('Loaded the sample product.');
    setScrollTarget({ id: sample.id });
    // The welcome panel goes once a project exists, and its button with it.
    if (fromWelcome) setFocusRequest({ kind: 'open', id: sample.id });
  };

  // Clone: import's numbering against every name taken, so a double-click gives (Copy) and
  // (Copy 2), never longer than a name may be; placed right after its source. `duplicateProduct`
  // is unchanged and still writes the one `duplicate` changelog entry.
  const handleClone = async (id: string) => {
    if (!driver) return;
    const original = await driver.loadProduct(id);
    if (!original) return;
    const name = cloneName(original.name, order.takenNames());
    const dup = { ...duplicateProduct(original, driver.getWorkspaceId()), name };
    const flight = order.placeClone(id, dup.id, name);
    await driver.createProduct(dup);
    flight.settled();
    await refresh();
    announce(`Cloned "${original.name}" as "${name}".`);
    setScrollTarget({ id: dup.id });
  };

  const openDelete = (id: string) => {
    const shown = order.sorted;
    const index = shown.findIndex(p => p.id === id);
    const p = shown[index];
    if (!p) return;
    deleteConfirmedRef.current = false;
    setDeleteTarget({ id, name: p.name, next: shown[index + 1]?.id, prev: shown[index - 1]?.id });
  };

  // The dialog closes at once; then the delete, then the in-place refresh; then focus moves.
  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target || !driver) return;
    deleteConfirmedRef.current = true;
    setDeleteTarget(null);
    await driver.deleteProduct(target.id);
    await refresh();
    setFocusRequest({ kind: 'deleted', ...target });
  };

  const handleExport = async (id: string) => {
    if (!driver) return;
    const product = await driver.loadProduct(id);
    if (product) await exportProduct(product, driver, driver.getWorkspaceId());
  };

  const openNew = (e: React.MouseEvent<HTMLButtonElement>) => {
    newOpenerRef.current = e.currentTarget;
    setDialog({ kind: 'new' });
  };

  const openEdit = (id: string) => {
    const p = products.find(x => x.id === id);
    if (p) setDialog({ kind: 'edit', id, name: p.name, description: p.description ?? '' });
  };

  const openShare = (id: string) => {
    const p = products.find(x => x.id === id);
    if (p) setShareTarget({ id, name: p.name });
  };

  const openProject = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    // A mouse or touch click (not a key): the rest of a double-click must not land on Structure.
    if (e.detail === 1) swallowRestOfGesture();
    navigate(`/product/${id}/structure`);
  };

  const gridProjects: GridProject[] = order.sorted.map(p => {
    const role = roleOf(p, isCloudMode, user?.uid);
    return {
      ...p,
      isShared: !!(p._owner && user && p._owner !== user.uid),
      canEdit: role === 'owner' || role === 'editor',
      canDelete: role === 'owner',
      showShare: isCloudMode && role === 'owner',
    };
  });

  const editTarget = dialog?.kind === 'edit' ? dialog : null;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <div className="max-w-[1200px] w-full mx-auto px-2 sm:px-4 md:px-8 p-4 sm:p-6 md:p-8 flex-1 flex flex-col">
        <ProjectsHeader
          logo={(
            <Link
              to="/"
              onClick={() => window.scrollTo(0, 0)}
              aria-label="Go to products home"
              className="mr-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <img
                src={isDark ? "/spert-favicon-storymap-dark.png" : "/spert-favicon-storymap.png"}
                alt="SPERT Story Map icon"
                className="h-7 w-7 rounded-lg ring-1 ring-white/20"
              />
            </Link>
          )}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => setShowSettings(true)}
        />

        <AppNotices className="mb-4" />

        <main ref={mainRef}>
          {/* Access-denied banner — one-shot, shown after useProduct redirects
              here because Firestore returned permission-denied (owner revoked
              collaborator access mid-session, or revoked between sessions). */}
          {accessDeniedMsg && (
            <div className="mb-4 flex items-start justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg px-4 py-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                You no longer have access to that product.
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

          <ProjectsToolbar
            hasProjects={products.length > 0}
            importDisabled={(mode === 'cloud' && !cloudDataLoaded) || importPhase.tag === 'applying'}
            newProjectRef={newProjectRef}
            onExportAll={() => driver && exportAllProductsBundled(driver, driver.getWorkspaceId())}
            onImport={() => fileInputRef.current?.click()}
            onLoadSample={() => handleLoadSample(false)}
            onNewProject={openNew}
          />

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

          {/* Cloud orphan warning */}
          {localOrphanCount > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg px-4 py-3 mb-6">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                Your cloud account has no products, but you have {localOrphanCount} product{localOrphanCount !== 1 ? 's' : ''} stored locally.
                Go to App Settings → Storage to upload them, or switch back to Local mode.
              </p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <p className="text-sm">Loading products...</p>
            </div>
          ) : products.length === 0 ? (
            <ProjectsEmptyState onCreateNew={openNew} onLoadSample={() => handleLoadSample(true)} />
          ) : (
            <ProjectGrid
              projects={gridProjects}
              onOpen={openProject}
              onShare={openShare}
              onExport={handleExport}
              onEdit={openEdit}
              onClone={handleClone}
              onDelete={openDelete}
              onMove={order.moveOnto}
            />
          )}

          {/* What Clone and Load Sample did, for a screen reader: the new tile may be out of sight. */}
          <div role="status" className="sr-only">{announcement}</div>
        </main>
      </div>

      {dialog && (
        <ProjectDialog
          key={editTarget ? `edit:${editTarget.id}` : 'new'}
          project={editTarget ? { name: editTarget.name, description: editTarget.description } : null}
          onCancel={() => setDialog(null)}
          onCreate={handleCreate}
          onUpdate={edits => { if (editTarget) handleUpdate(editTarget.id, edits); }}
          onUnchanged={() => setDialog(null)}
          returnFocusTo={() => (editTarget
            ? findTileControl(mainRef.current, editTarget.id, 'edit')
            : newOpenerRef.current)}
        />
      )}

      {deleteTarget && (
        <DeleteProjectDialog
          projectName={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          returnFocusTo={() => (deleteConfirmedRef.current
            ? null
            : findTileControl(mainRef.current, deleteTarget.id, 'delete'))}
        />
      )}

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
