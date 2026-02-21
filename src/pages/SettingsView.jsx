import { useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { deleteReleaseFromProduct, deleteSprintFromProduct, releaseHasAllocations } from '../lib/settingsMutations';
import { useProductMutations } from '../hooks/useProductMutations';
import { useStorage } from '../lib/StorageProvider';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Section, Field } from '../components/ui/Section';
import SharingSection from '../components/settings/SharingSection';
import SizeMappingSection from '../components/settings/SizeMappingSection';
import DataSection from '../components/settings/DataSection';

export default function SettingsView() {
  const { product, updateProduct } = useOutletContext();
  const { addRelease, addSprint } = useProductMutations(updateProduct);
  const { driver } = useStorage();
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Release drag-to-reorder state
  const [dragReleaseId, setDragReleaseId] = useState(null);
  const [dropBeforeReleaseId, setDropBeforeReleaseId] = useState(null);
  const dropBeforeReleaseRef = useRef(null);

  // Releases
  const updateRelease = (id, updates) => {
    updateProduct(prev => ({
      ...prev,
      releases: prev.releases.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  };

  const handleReleaseDragStart = (e, releaseId) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragReleaseId(releaseId);
  };

  const handleReleaseDragOver = (e, releaseId) => {
    e.preventDefault();
    if (releaseId === dragReleaseId) return;
    if (dropBeforeReleaseRef.current !== releaseId) {
      dropBeforeReleaseRef.current = releaseId;
      setDropBeforeReleaseId(releaseId);
    }
  };

  const handleReleaseDrop = (e) => {
    e.preventDefault();
    if (!dragReleaseId) return;
    const beforeId = dropBeforeReleaseRef.current;
    updateProduct(prev => {
      const releases = [...prev.releases];
      const dragIdx = releases.findIndex(r => r.id === dragReleaseId);
      if (dragIdx < 0) return prev;
      const [dragged] = releases.splice(dragIdx, 1);
      if (beforeId) {
        const beforeIdx = releases.findIndex(r => r.id === beforeId);
        releases.splice(beforeIdx >= 0 ? beforeIdx : releases.length, 0, dragged);
      } else {
        releases.push(dragged);
      }
      return { ...prev, releases: releases.map((r, i) => ({ ...r, order: i + 1 })) };
    });
    handleReleaseDragEnd();
  };

  const handleReleaseDragEnd = () => {
    setDragReleaseId(null);
    setDropBeforeReleaseId(null);
    dropBeforeReleaseRef.current = null;
  };

  const deleteRelease = (id) => {
    if (releaseHasAllocations(product, id)) {
      setDeleteTarget({ type: 'release', id, message: 'This release has rib items allocated to it. Deleting it will remove those allocations. Continue?' });
    } else {
      updateProduct(prev => deleteReleaseFromProduct(prev, id));
    }
  };

  // Sprints
  const updateSprint = (id, updates) => {
    updateProduct(prev => ({
      ...prev,
      sprints: prev.sprints.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
  };

  const deleteSprint = (id) => {
    updateProduct(prev => deleteSprintFromProduct(prev, id));
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Settings</h2>

      {/* Project Info */}
      <Section title="Project Details">
        <div className="space-y-3">
          <Field label="Name">
            <input
              type="text"
              value={product.name}
              onChange={e => updateProduct(prev => ({ ...prev, name: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={product.description || ''}
              onChange={e => updateProduct(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none resize-none"
            />
          </Field>
        </div>
      </Section>

      <SizeMappingSection sizeMapping={product.sizeMapping} updateProduct={updateProduct} />

      {/* Releases */}
      <Section title="Releases">
        <div className="space-y-1" onDragOver={e => { e.preventDefault(); if (!dropBeforeReleaseRef.current) setDropBeforeReleaseId(null); }} onDrop={handleReleaseDrop}>
          {product.releases.map((r) => (
            <div key={r.id}>
              {dropBeforeReleaseId === r.id && dragReleaseId !== r.id && (
                <div className="h-0.5 bg-blue-400 rounded-full mx-1 my-0.5" />
              )}
              <div
                onDragOver={e => handleReleaseDragOver(e, r.id)}
                className={`flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 ${dragReleaseId === r.id ? 'opacity-40' : ''}`}
              >
                <div
                  draggable
                  onDragStart={e => handleReleaseDragStart(e, r.id)}
                  onDragEnd={handleReleaseDragEnd}
                  className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 select-none"
                >
                  <span className="text-sm leading-none">⠿</span>
                </div>
                <input
                  type="text"
                  value={r.name}
                  onChange={e => updateRelease(r.id, { name: e.target.value })}
                  className="w-64 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1.5 text-sm"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Target
                  <input
                    type="date"
                    value={r.targetDate || ''}
                    onChange={e => updateRelease(r.id, { targetDate: e.target.value || null })}
                    className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded px-2 py-1.5 text-sm text-gray-600"
                  />
                </label>
                <button onClick={() => deleteRelease(r.id)} className="text-red-400 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400 text-sm">Delete</button>
              </div>
            </div>
          ))}
          <button onClick={addRelease} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-2">+ Add Release</button>
        </div>
      </Section>

      {/* Sprints */}
      <Section title="Sprints">
        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Sprint cadence</label>
          <select
            value={product.sprintCadenceWeeks || 2}
            onChange={e => updateProduct(prev => ({ ...prev, sprintCadenceWeeks: parseInt(e.target.value, 10) || 2 }))}
            className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1.5 text-sm text-gray-700"
          >
            <option value={1}>1 week</option>
            <option value={2}>2 weeks</option>
            <option value={3}>3 weeks</option>
            <option value={4}>4 weeks</option>
          </select>
        </div>
        <div className="space-y-2">
          {product.sprints.map((s) => (
            <div key={s.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <input
                type="text"
                value={s.name}
                onChange={e => updateSprint(s.id, { name: e.target.value })}
                className="w-64 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1.5 text-sm"
              />
              <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                Finish
                <input
                  type="date"
                  value={s.endDate || ''}
                  onChange={e => updateSprint(s.id, { endDate: e.target.value || null })}
                  className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded px-2 py-1.5 text-sm text-gray-600"
                />
              </label>
              <button onClick={() => deleteSprint(s.id)} className="text-red-400 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400 text-sm">Delete</button>
            </div>
          ))}
          <button onClick={addSprint} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-2">+ Add Sprint</button>
        </div>
      </Section>

      <SharingSection productId={product.id} />

      <DataSection product={product} driver={driver} />

      {/* Delete confirm (release with allocations) */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget.type === 'release') updateProduct(prev => deleteReleaseFromProduct(prev, deleteTarget.id));
        }}
        title="Confirm Delete"
        message={deleteTarget?.message || ''}
      />
    </div>
  );
}
