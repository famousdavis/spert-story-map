import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadProductIndex, loadProduct, saveProductImmediate, deleteProduct, exportProduct, importProductFromJSON, createNewProduct, duplicateProduct } from '../lib/storage';
import { createSampleProduct } from '../lib/sampleData';
import { getTotalProjectPoints, getAllRibItems, getProjectPercentComplete } from '../lib/calculations';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Footer } from './ChangelogView';

export default function ProductList() {
  const [products, setProducts] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const navigate = useNavigate();

  const refresh = () => {
    const index = loadProductIndex();
    const loaded = index.map(entry => {
      const full = loadProduct(entry.id);
      if (!full) return null;
      const allRibs = getAllRibItems(full);
      const totalPoints = getTotalProjectPoints(full);
      const unsized = allRibs.filter(r => !r.size).length;
      const pctComplete = getProjectPercentComplete(full);
      return { ...entry, totalItems: allRibs.length, totalPoints, unsized, pctComplete };
    }).filter(Boolean);
    setProducts(loaded);
  };

  useEffect(() => { refresh(); }, []);

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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const product = importProductFromJSON(ev.target.result);
          const existing = loadProduct(product.id);
          if (existing) {
            if (!window.confirm(`A product with the same ID already exists ("${existing.name}"). Overwrite it?`)) return;
          }
          saveProductImmediate(product);
          refresh();
        } catch (err) {
          alert('Failed to import: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Release Planner</h1>
          <p className="text-sm text-gray-500">
            Plan and track agile product releases. Data is stored locally in your browser.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Product
          </button>
          <button
            onClick={handleImport}
            className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Import JSON
          </button>
          <button
            onClick={handleLoadSample}
            className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Load Sample Product
          </button>
        </div>

        {/* Data warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
          <p className="text-xs text-amber-800">
            Your data is stored in this browser's localStorage. Export regularly to avoid data loss if browser data is cleared.
          </p>
        </div>

        {/* Product List */}
        {products.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">No products yet</p>
            <p className="text-sm">Create a new product or load the sample to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map(p => (
              <div
                key={p.id}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors group"
              >
                <div className="flex items-start justify-between">
                  <button
                    onClick={() => navigate(`/product/${p.id}/structure`)}
                    className="text-left flex-1"
                  >
                    <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                      <span>{p.totalItems} items</span>
                      <span>{p.totalPoints} pts</span>
                      {p.unsized > 0 && (
                        <span className="text-amber-600">{p.unsized} unsized</span>
                      )}
                      <span>{Math.round(p.pctComplete)}% complete</span>
                      <span>Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleExport(p.id)}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                      title="Export as JSON"
                    >
                      Export
                    </button>
                    <button
                      onClick={() => handleDuplicate(p.id)}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                      title="Duplicate"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
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
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Product">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g., Billing System v2"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Brief description of the product"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
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
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone. Consider exporting first.`}
      />

      <div className="max-w-4xl mx-auto px-6">
        <Footer />
      </div>
    </div>
  );
}
