// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useRef, useId, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { deleteReleaseFromProduct, deleteSprintFromProduct, releaseHasAllocations } from '../lib/settingsMutations';
import BufferedText from '../components/ui/BufferedText';
import { useProductMutations } from '../hooks/useProductMutations';
import { useStorage } from '../lib/StorageProvider';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Section, Field } from '../components/ui/Section';
import SharingSection from '../components/settings/SharingSection';
import SizeMappingSection from '../components/settings/SizeMappingSection';
import DataSection from '../components/settings/DataSection';
import type { OutletContextValue, Release, Sprint } from '../types';


export default function SettingsView() {
  const { product, updateProduct } = useOutletContext<OutletContextValue>();
  const { addRelease, addSprint } = useProductMutations(updateProduct);
  const { driver } = useStorage();
  // Only releases route through this dialog today; the shape is explicit so
  // the confirm handler can read `.id` / `.message` without a widened object.
  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'release'; id: string; message: string } | null
  >(null);
  const baseId = useId();

  // Release drag-to-reorder state
  const [dragReleaseId, setDragReleaseId] = useState<string | null>(null);
  const [dropBeforeReleaseId, setDropBeforeReleaseId] = useState<string | null>(null);
  const dropBeforeReleaseRef = useRef<string | null>(null);

  // Per-row commit handlers — kept here (not in BufferedText) so the buffered
  // wrapper stays a pure leaf and updateProduct identity stays stable across
  // re-renders.
  const commitName = useCallback((name: string) => {
    updateProduct(prev => ({ ...prev, name }));
  }, [updateProduct]);

  const commitDescription = useCallback((description: string) => {
    updateProduct(prev => ({ ...prev, description }));
  }, [updateProduct]);

  // Releases
  const updateRelease = (id: string, updates: Partial<Release>) => {
    updateProduct(prev => ({
      ...prev,
      releases: prev.releases.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  };

  const handleReleaseDragStart = (e: React.DragEvent, releaseId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragReleaseId(releaseId);
  };

  const handleReleaseDragOver = (e: React.DragEvent, releaseId: string) => {
    e.preventDefault();
    if (releaseId === dragReleaseId) return;
    if (dropBeforeReleaseRef.current !== releaseId) {
      dropBeforeReleaseRef.current = releaseId;
      setDropBeforeReleaseId(releaseId);
    }
  };

  const handleReleaseDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragReleaseId) return;
    const beforeId = dropBeforeReleaseRef.current;
    updateProduct(prev => {
      const releases = [...prev.releases];
      const dragIdx = releases.findIndex(r => r.id === dragReleaseId);
      if (dragIdx < 0) return prev;
      const [dragged] = releases.splice(dragIdx, 1);
      if (!dragged) return prev;
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

  const deleteRelease = (id: string) => {
    if (releaseHasAllocations(product, id)) {
      setDeleteTarget({ type: 'release', id, message: 'This release has rib items allocated to it. Deleting it will remove those allocations. Continue?' });
    } else {
      updateProduct(prev => deleteReleaseFromProduct(prev, id));
    }
  };

  // Sprints
  const updateSprint = (id: string, updates: Partial<Sprint>) => {
    updateProduct(prev => ({
      ...prev,
      sprints: prev.sprints.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
  };

  const deleteSprint = (id: string) => {
    updateProduct(prev => deleteSprintFromProduct(prev, id));
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Settings</h2>

      {/* Project Info */}
      <Section title="Project Details">
        <div className="space-y-3">
          <Field label="Name" htmlFor={`${baseId}-projectName`}>
            <BufferedText
              id={`${baseId}-projectName`}
              name="projectName"
              required
              value={product.name}
              onCommit={commitName}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-500 outline-none"
            />
          </Field>
          <Field label="Description" htmlFor={`${baseId}-projectDesc`}>
            <BufferedText
              id={`${baseId}-projectDesc`}
              name="projectDescription"
              value={product.description || ''}
              onCommit={commitDescription}
              multiline
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
                <BufferedText
                  name="releaseName"
                  required
                  value={r.name}
                  onCommit={(name) => updateRelease(r.id, { name })}
                  className="w-64 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1.5 text-sm"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Target
                  {/* Date input is NOT buffered — native date pickers handle their own
                      input lifecycle, and onChange fires only when the user commits
                      via the picker UI (not on each keystroke). */}
                  <input
                    type="date"
                    name="releaseTargetDate"
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
          <label htmlFor={`${baseId}-sprintCadence`} className="text-xs font-medium text-gray-500 dark:text-gray-400">Sprint cadence</label>
          {/* Select is NOT buffered — single-value change on user selection. */}
          <select
            id={`${baseId}-sprintCadence`}
            name="sprintCadenceWeeks"
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
              <BufferedText
                name="sprintName"
                required
                value={s.name}
                onCommit={(name) => updateSprint(s.id, { name })}
                className="w-64 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1.5 text-sm"
              />
              <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                Finish
                {/* Date input is NOT buffered — see release target note above. */}
                <input
                  type="date"
                  name="sprintEndDate"
                  value={s.endDate || ''}
                  onChange={e => updateSprint(s.id, { endDate: e.target.value || null })}
                  className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded px-2 py-1.5 text-sm text-gray-600"
                />
              </label>
              <button onClick={() => deleteSprint(s.id)} className="text-red-400 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400 text-sm">Delete</button>
            </div>
          ))}
          <button onClick={() => addSprint()} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-2">+ Add Sprint</button>
        </div>
      </Section>

      <SharingSection productId={product.id} />

      {driver && <DataSection product={product} driver={driver} updateProduct={updateProduct} />}

      {/* Delete confirm (release with allocations) */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget?.type === 'release') updateProduct(prev => deleteReleaseFromProduct(prev, deleteTarget.id));
        }}
        title="Confirm Delete"
        message={deleteTarget?.message || ''}
      />
    </div>
  );
}
