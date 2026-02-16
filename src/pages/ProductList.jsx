import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { loadProductIndex, loadProduct, saveProductImmediate, deleteProduct, exportProduct, readImportFile, createNewProduct, duplicateProduct } from '../lib/storage';
import { createSampleProduct } from '../lib/sampleData';
import { getTotalProjectPoints, getAllRibItems, getProjectPercentComplete } from '../lib/calculations';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ThemeToggle from '../components/ui/ThemeToggle';
import { useDarkMode } from '../hooks/useDarkMode';
import { Footer } from './ChangelogView';

function loadProducts() {
  const index = loadProductIndex();
  return index.map(entry => {
    const full = loadProduct(entry.id);
    if (!full) return null;
    const allRibs = getAllRibItems(full);
    const totalPoints = getTotalProjectPoints(full);
    const unsized = allRibs.filter(r => !r.size).length;
    const pctComplete = getProjectPercentComplete(full);
    return { ...entry, totalItems: allRibs.length, totalPoints, unsized, pctComplete };
  }).filter(Boolean);
}

export default function ProductList() {
  const [products, setProducts] = useState(loadProducts);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importConfirm, setImportConfirm] = useState(null);
  const [showWarning, setShowWarning] = useState(true);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useDarkMode();

  const refresh = useCallback(() => setProducts(loadProducts()), []);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const product = createNewProduct(newName.trim(), newDesc.trim());
    saveProductImmediate(product);
    setShowCreate(false);
    setNewName('');
    setNewDesc('');
    navigate(`/product/${product.id}/structure`);
  };

  const handleLoadSample = () => {
    const sample = createSampleProduct();
    saveProductImmediate(sample);
    refresh();
  };

  const handleDuplicate = (id) => {
    const original = loadProduct(id);
    if (!original) return;
    const dup = duplicateProduct(original);
    saveProductImmediate(dup);
    refresh();
  };

  const handleDelete = (id) => {
    deleteProduct(id);
    refresh();
  };

  const handleExport = (id) => {
    const product = loadProduct(id);
    if (product) exportProduct(product);
  };

  const handleImport = () => {
    readImportFile((imported) => {
      const existing = loadProduct(imported.id);
      if (existing) {
        setImportConfirm({ product: imported, existingName: existing.name });
      } else {
        saveProductImmediate(imported);
        refresh();
      }
    });
  };

  const confirmImport = () => {
    if (importConfirm) {
      saveProductImmediate(importConfirm.product);
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
              Plan and track agile project releases. Data is stored locally in your browser.
            </p>
          </div>
          <div className="flex items-center gap-3 mt-1">
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

        {/* Data warning */}
        {showWarning && (
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
        {products.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <p className="text-lg mb-2">No projects yet</p>
            <p className="text-sm">Create a new project or load the sample to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map(p => (
              <div
                key={p.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group"
              >
                <div className="flex items-start justify-between">
                  <button
                    onClick={() => navigate(`/product/${p.id}/structure`)}
                    className="text-left flex-1"
                  >
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>{p.totalItems} items</span>
                      <span>{p.totalPoints} pts</span>
                      {p.unsized > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">{p.unsized} unsized</span>
                      )}
                      <span>{Math.round(p.pctComplete)}% complete</span>
                      <span>Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleExport(p.id)}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                      title="Export as JSON"
                    >
                      Export
                    </button>
                    <button
                      onClick={() => handleDuplicate(p.id)}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                      title="Duplicate"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="px-2 py-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Product Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Project">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g., Billing System v2"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Brief description of the project"
              rows={2}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>

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

      <div className="max-w-4xl mx-auto px-6">
        <Footer />
      </div>
    </div>
  );
}
