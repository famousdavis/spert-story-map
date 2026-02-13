import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { exportProduct, importProductFromJSON, saveProductImmediate } from '../lib/storage';
import ConfirmDialog from '../components/ui/ConfirmDialog';

export default function SettingsView() {
  const { product, updateProduct } = useOutletContext();
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Size mapping
  const updateSizeMapping = (index, field, value) => {
    updateProduct(prev => ({
      ...prev,
      sizeMapping: prev.sizeMapping.map((m, i) =>
        i === index ? { ...m, [field]: field === 'points' ? (parseInt(value) || 0) : value } : m
      ),
    }));
  };

  const addSize = () => {
    updateProduct(prev => ({
      ...prev,
      sizeMapping: [...prev.sizeMapping, { label: 'New', points: 0 }],
    }));
  };

  const removeSize = (index) => {
    updateProduct(prev => ({
      ...prev,
      sizeMapping: prev.sizeMapping.filter((_, i) => i !== index),
    }));
  };

  // Releases
  const addRelease = () => {
    updateProduct(prev => ({
      ...prev,
      releases: [...prev.releases, {
        id: crypto.randomUUID(),
        name: `Release ${prev.releases.length + 1}`,
        order: prev.releases.length + 1,
        description: '',
        targetDate: null,
      }],
    }));
  };

  const updateRelease = (id, updates) => {
    updateProduct(prev => ({
      ...prev,
      releases: prev.releases.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  };

  const moveRelease = (id, direction) => {
    updateProduct(prev => {
      const items = [...prev.releases];
      const idx = items.findIndex(r => r.id === id);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= items.length) return prev;
      [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
      return { ...prev, releases: items.map((r, i) => ({ ...r, order: i + 1 })) };
    });
  };

  const deleteRelease = (id) => {
    // Check if any rib items reference this release
    let hasAllocations = false;
    for (const t of product.themes) {
      for (const b of t.backboneItems) {
        for (const r of b.ribItems) {
          if (r.releaseAllocations.some(a => a.releaseId === id)) {
            hasAllocations = true;
            break;
          }
        }
        if (hasAllocations) break;
      }
      if (hasAllocations) break;
    }

    if (hasAllocations) {
      setDeleteTarget({ type: 'release', id, message: 'This release has rib items allocated to it. Deleting it will remove those allocations. Continue?' });
    } else {
      doDeleteRelease(id);
    }
  };

  const doDeleteRelease = (id) => {
    updateProduct(prev => {
      // Clean the deleted release's column from releaseCardOrder
      const { [id]: _, ...restCardOrder } = prev.releaseCardOrder || {};
      return {
        ...prev,
        releases: prev.releases.filter(r => r.id !== id).map((r, i) => ({ ...r, order: i + 1 })),
        themes: prev.themes.map(t => ({
          ...t,
          backboneItems: t.backboneItems.map(b => ({
            ...b,
            ribItems: b.ribItems.map(r => ({
              ...r,
              releaseAllocations: r.releaseAllocations.filter(a => a.releaseId !== id),
            })),
          })),
        })),
        releaseCardOrder: restCardOrder,
      };
    });
  };

  // Sprints
  const addSprint = () => {
    updateProduct(prev => ({
      ...prev,
      sprints: [...prev.sprints, {
        id: crypto.randomUUID(),
        name: `Sprint ${prev.sprints.length + 1}`,
        order: prev.sprints.length + 1,
        endDate: null,
      }],
    }));
  };

  const updateSprint = (id, updates) => {
    updateProduct(prev => ({
      ...prev,
      sprints: prev.sprints.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
  };

  const moveSprint = (id, direction) => {
    updateProduct(prev => {
      const items = [...prev.sprints];
      const idx = items.findIndex(s => s.id === id);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= items.length) return prev;
      [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
      return { ...prev, sprints: items.map((s, i) => ({ ...s, order: i + 1 })) };
    });
  };

  const deleteSprint = (id) => {
    updateProduct(prev => ({
      ...prev,
      sprints: prev.sprints.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i + 1 })),
      themes: prev.themes.map(t => ({
        ...t,
        backboneItems: t.backboneItems.map(b => ({
          ...b,
          ribItems: b.ribItems.map(r => ({
            ...r,
            progressHistory: r.progressHistory.filter(p => p.sprintId !== id),
          })),
        })),
      })),
    }));
  };

  // Import/Export
  const handleExport = () => exportProduct(product);

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
          const imported = importProductFromJSON(ev.target.result);
          if (!window.confirm(`Import "${imported.name}"? This will overwrite the current product data.`)) return;
          // Overwrite current product with imported data, keeping same ID
          const merged = { ...imported, id: product.id };
          saveProductImmediate(merged);
          window.location.reload();
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleDownloadTemplate = () => {
    const template = {
      id: 'example-id',
      name: 'Example Product',
      description: '',
      schemaVersion: 1,
      sizeMapping: product.sizeMapping,
      releases: [{ id: 'release-1', name: 'Release 1', order: 1, description: '', targetDate: null }],
      sprints: [{ id: 'sprint-1', name: 'Sprint 1', order: 1, endDate: null }],
      themes: [{
        id: 'theme-1',
        name: 'Example Theme',
        order: 1,
        backboneItems: [{
          id: 'backbone-1',
          name: 'Example Backbone',
          description: '',
          order: 1,
          ribItems: [{
            id: 'rib-1',
            name: 'Example Rib Item',
            description: '',
            order: 1,
            size: 'M',
            category: 'core',
            releaseAllocations: [{ releaseId: 'release-1', percentage: 100 }],
            progressHistory: [{ sprintId: 'sprint-1', percentComplete: 50 }],
          }],
        }],
      }],
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'release-planner-template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Settings</h2>

      {/* Product Info */}
      <Section title="Product Details">
        <div className="space-y-3">
          <Field label="Name">
            <input
              type="text"
              value={product.name}
              onChange={e => updateProduct(prev => ({ ...prev, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={product.description || ''}
              onChange={e => updateProduct(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none resize-none"
            />
          </Field>
        </div>
      </Section>

      {/* Size Mapping */}
      <Section title="T-Shirt Size Mapping">
        <div className="space-y-2">
          {product.sizeMapping.map((m, i) => (
            <div key={i} className="flex items-center gap-3">
              <input
                type="text"
                value={m.label}
                onChange={e => updateSizeMapping(i, 'label', e.target.value)}
                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm text-center"
                placeholder="Label"
              />
              <input
                type="number"
                value={m.points}
                onChange={e => updateSizeMapping(i, 'points', e.target.value)}
                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm text-center"
                placeholder="Points"
              />
              <span className="text-xs text-gray-400">pts</span>
              <button onClick={() => removeSize(i)} className="text-red-400 hover:text-red-600 text-sm ml-auto">Remove</button>
            </div>
          ))}
          <button onClick={addSize} className="text-sm text-blue-600 hover:text-blue-700 mt-2">+ Add Size</button>
        </div>
      </Section>

      {/* Releases */}
      <Section title="Releases">
        <div className="space-y-2">
          {product.releases.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1">
                <button onClick={() => moveRelease(r.id, -1)} disabled={i === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-xs">↑</button>
                <button onClick={() => moveRelease(r.id, 1)} disabled={i === product.releases.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-xs">↓</button>
              </div>
              <input
                type="text"
                value={r.name}
                onChange={e => updateRelease(r.id, { name: e.target.value })}
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
              <input
                type="date"
                value={r.targetDate || ''}
                onChange={e => updateRelease(r.id, { targetDate: e.target.value || null })}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600"
              />
              <button onClick={() => deleteRelease(r.id)} className="text-red-400 hover:text-red-600 text-sm">Delete</button>
            </div>
          ))}
          <button onClick={addRelease} className="text-sm text-blue-600 hover:text-blue-700 mt-2">+ Add Release</button>
        </div>
      </Section>

      {/* Sprints */}
      <Section title="Sprints">
        <div className="space-y-2">
          {product.sprints.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1">
                <button onClick={() => moveSprint(s.id, -1)} disabled={i === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-xs">↑</button>
                <button onClick={() => moveSprint(s.id, 1)} disabled={i === product.sprints.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-xs">↓</button>
              </div>
              <input
                type="text"
                value={s.name}
                onChange={e => updateSprint(s.id, { name: e.target.value })}
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
              />
              <input
                type="date"
                value={s.endDate || ''}
                onChange={e => updateSprint(s.id, { endDate: e.target.value || null })}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600"
              />
              <button onClick={() => deleteSprint(s.id)} className="text-red-400 hover:text-red-600 text-sm">Delete</button>
            </div>
          ))}
          <button onClick={addSprint} className="text-sm text-blue-600 hover:text-blue-700 mt-2">+ Add Sprint</button>
        </div>
      </Section>

      {/* Import/Export */}
      <Section title="Data">
        <div className="flex flex-wrap gap-3">
          <button onClick={handleExport} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Export as JSON</button>
          <button onClick={handleImport} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300">Import from JSON</button>
          <button onClick={handleDownloadTemplate} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 rounded-lg border border-gray-200">Download Template</button>
        </div>
      </Section>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget.type === 'release') doDeleteRelease(deleteTarget.id);
        }}
        title="Confirm Delete"
        message={deleteTarget?.message || ''}
      />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
