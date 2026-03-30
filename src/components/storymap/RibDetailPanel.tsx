// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import React, { useState } from 'react';
import { useEffect } from 'react';
import { getRibItemPercentComplete } from '../../lib/calculations';
import SizePicker from '../ui/SizePicker';
import useInlineEdit from './useInlineEdit';
import type { RibItem, Product, Category, Size } from '../../types';

const NOTES_MAX = 2000;

interface DetailRib extends RibItem {
  themeId: string;
  backboneId: string;
  backboneName: string;
  themeName: string;
  points: number;
  allocTotal: number;
}

interface RibDetailPanelProps {
  rib: DetailRib;
  product: Product;
  onClose: () => void;
  onRename?: (themeId: string, backboneId: string, ribId: string, name: string) => void;
  onUpdate?: (themeId: string, backboneId: string, ribId: string, updates: { category?: Category; size?: Size | string; notes?: string }) => void;
}

export default function RibDetailPanel({ rib, product, onClose, onRename, onUpdate }: RibDetailPanelProps) {
  const pctComplete = getRibItemPercentComplete(rib);
  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(rib.name, (name) => onRename?.(rib.themeId, rib.backboneId, rib.id, name));

  const [notes, setNotes] = useState(rib.notes ?? '');

  // Reset notes when switching to a different rib
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setNotes(rib.notes ?? '');
  }, [rib.id, rib.notes]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Find release names for allocations
  const releaseMap = {};
  product.releases.forEach(r => { releaseMap[r.id] = r.name; });

  // Close on Escape (but not while editing an input or textarea)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleNotesBlur = () => {
    if (notes !== (rib.notes ?? '')) {
      onUpdate?.(rib.themeId, rib.backboneId, rib.id, { notes });
    }
  };

  const notesLen = notes.length;
  const counterColor =
    notesLen >= NOTES_MAX ? 'text-red-500 dark:text-red-400' :
    notesLen >= 1800 ? 'text-amber-500 dark:text-amber-400' :
    'text-gray-400 dark:text-gray-500';

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute top-0 right-0 z-50 h-full w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-lg overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            {editing ? (
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-600 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 flex-1 min-w-0"
              />
            ) : (
              <h3
                className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                onClick={startEditing}
                title="Click to rename"
              >
                {rib.name}
              </h3>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-lg leading-none flex-shrink-0 -mt-0.5"
            >
              ×
            </button>
          </div>

          {/* Description */}
          {rib.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{rib.description}</p>
          )}

          {/* Metadata */}
          <div className="space-y-3">
            <DetailRow label="Backbone" value={rib.backboneName} />
            <DetailRow label="Theme" value={rib.themeName} />
            <DetailRow label="Category">
              <div className="flex gap-1">
                {['core', 'non-core'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => onUpdate?.(rib.themeId, rib.backboneId, rib.id, { category: cat })}
                    className={`text-xs font-medium px-2 py-0.5 rounded transition-colors ${
                      rib.category === cat
                        ? cat === 'core'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        : 'bg-gray-50 text-gray-400 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700'
                    }`}
                  >
                    {cat === 'core' ? 'Core' : 'Non-core'}
                  </button>
                ))}
              </div>
            </DetailRow>
            <DetailRow label="Size">
              <div className="flex items-center gap-2">
                <SizePicker
                  value={rib.size || null}
                  sizeMapping={product.sizeMapping}
                  onChange={(size) => onUpdate?.(rib.themeId, rib.backboneId, rib.id, { size: size || '' })}
                />
                {rib.points > 0 && <span className="text-sm text-gray-500 dark:text-gray-400">{rib.points} pts</span>}
              </div>
            </DetailRow>
            <DetailRow label="Progress">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 max-w-24">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, pctComplete)}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">{pctComplete}%</span>
              </div>
            </DetailRow>
          </div>

          {/* Release Allocations */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Release Allocations</h4>
            {rib.releaseAllocations.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">Not assigned to any release</p>
            ) : (
              <div className="space-y-2">
                {rib.releaseAllocations.map(alloc => (
                  <div key={alloc.releaseId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{releaseMap[alloc.releaseId] || 'Unknown'}</span>
                    <span className="text-gray-500 dark:text-gray-400 font-medium tabular-nums">{alloc.percentage}%</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm pt-1 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">Total</span>
                  <span className={`font-semibold tabular-nums ${rib.allocTotal === 100 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {rib.allocTotal}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Notes</h4>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              maxLength={NOTES_MAX}
              rows={4}
              placeholder="Add notes, requirements, or reference text…"
              className="w-full text-sm resize-none rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-600"
            />
            <div className={`text-xs text-right mt-1 tabular-nums ${counterColor}`}>
              {notesLen} / {NOTES_MAX}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

interface DetailRowProps {
  label: string;
  value?: string | number;
  children?: React.ReactNode;
}

function DetailRow({ label, value, children }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
      {children || <span className="text-sm text-gray-700 dark:text-gray-300">{value}</span>}
    </div>
  );
}
