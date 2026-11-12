// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useId, useState } from 'react';
import { getBackboneStats, getThemeStats } from '../../lib/calculations';
import { NOTES_MAX } from '../../lib/constants';
import { useBufferedField } from '../../hooks/useBufferedField';
import useInlineEdit from './useInlineEdit';
import { resolveEntity } from './mapEntity';
import type { MapEntityTarget, ResolvedEntity } from './mapEntity';
import type { Product } from '../../types';

export type EntityPatch = { name?: string; description?: string };

interface MapEntityPanelProps {
  /** The theme or backbone this panel was opened for. Read once: a switch remounts the panel (see `key`). */
  target: MapEntityTarget;
  product: Product;
  onClose: () => void;
  /** Writes a rename or a description. Resolves the target again and writes nothing if it is gone. */
  onCommit: (target: MapEntityTarget, patch: EntityPatch) => void;
  /** A press inside the panel: cancels a pending open from a name click. */
  onPointerDownCapture: () => void;
}

/**
 * The theme or backbone panel on the Map tab: its name (click to rename), the counts the
 * Structure tab shows, and its description. No backdrop: the map stays usable, and
 * clicking another name switches the panel. Docked beside the map from `md` up; an
 * overlay over the map below that, where a docked 384 px panel would leave no map.
 *
 * Bound to one entity. The parent keys it by `entityKey` (a backbone's key carries the
 * theme it was clicked in), and it reads `target` once, so it commits to the entity it
 * was mounted for, whatever the parent passes later. The description commits on blur,
 * and on unmount while focused and changed, because React fires no blur when a focused
 * field is removed: switching panels by a rib card or a release label would lose it.
 */
export default function MapEntityPanel({ target: initialTarget, product, onClose, onCommit, onPointerDownCapture }: MapEntityPanelProps) {
  const [target] = useState(initialTarget);
  const resolved = resolveEntity(product.themes, target);
  const name = resolved ? nameOf(resolved) : '';
  const descriptionId = useId();

  const { editing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit(name, (next) => onCommit(target, { name: next }));

  const commitDescription = useCallback((v: string) => onCommit(target, { description: v }), [onCommit, target]);
  const { localValue, setLocalValue, handleFocus, handleBlur } = useBufferedField(
    resolved ? descriptionOf(resolved) : '', commitDescription, { commitOnUnmount: true },
  );

  if (!resolved) return null;
  const kindLabel = resolved.kind === 'theme' ? 'Theme' : 'Backbone';
  const stats = resolved.kind === 'theme'
    ? getThemeStats(resolved.theme, product.sizeMapping, product.sprints)
    : getBackboneStats(resolved.backbone, product.sizeMapping, product.sprints);
  const counterColor =
    localValue.length >= NOTES_MAX ? 'text-red-500 dark:text-red-400' :
    localValue.length >= 1800 ? 'text-amber-500 dark:text-amber-400' :
    'text-gray-400 dark:text-gray-500';

  return (
    <aside
      data-map-entity-panel=""
      aria-label={`${kindLabel} details`}
      onPointerDownCapture={onPointerDownCapture}
      className="absolute inset-y-0 right-0 z-50 w-full md:static md:z-auto md:w-96 md:shrink-0 h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-lg md:shadow-none flex flex-col overflow-hidden"
    >
      <div className="p-5 space-y-5 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{kindLabel}</p>
            {editing ? (
              <input
                ref={inputRef}
                name={resolved.kind === 'theme' ? 'themeName' : 'backboneName'}
                type="text"
                autoComplete="off"
                aria-label={`${kindLabel} name`}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                className="w-full text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-600 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500"
              />
            ) : (
              <h3
                className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight break-words cursor-text hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                onClick={startEditing}
                title="Click to rename"
              >
                {name}
              </h3>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${kindLabel.toLowerCase()} details`}
            title="Close"
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-lg leading-none flex-shrink-0 -mt-0.5"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          {resolved.kind === 'backbone' && <DetailRow label="Theme" value={resolved.theme.name} />}
          {resolved.kind === 'theme' && <DetailRow label="Backbones" value={resolved.theme.backboneItems.length} />}
          <DetailRow label="Rib items" value={stats.totalItems} />
          <DetailRow label="Points" value={stats.totalPoints} />
          <DetailRow label="Done" value={`${stats.percentComplete}%`} />
          <DetailRow label="Unsized" value={stats.unsized} />
        </div>
      </div>

      {/* Description: fills the rest of the panel's height */}
      <div className="flex flex-col flex-1 min-h-0 px-5 pb-5 border-t border-gray-100 dark:border-gray-800">
        <label
          htmlFor={descriptionId}
          className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-5 mb-2 shrink-0"
        >
          Description
        </label>
        <textarea
          id={descriptionId}
          name={resolved.kind === 'theme' ? 'themeDescription' : 'backboneDescription'}
          autoComplete="off"
          value={localValue}
          onChange={e => setLocalValue(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          maxLength={NOTES_MAX}
          placeholder={`What this ${kindLabel.toLowerCase()} covers, its goals, scope or context…`}
          className="flex-1 min-h-0 w-full text-sm resize-none rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-600"
        />
        <div className={`text-xs text-right mt-1 tabular-nums shrink-0 ${counterColor}`}>
          {localValue.length} / {NOTES_MAX}
        </div>
      </div>
    </aside>
  );
}

function nameOf(resolved: ResolvedEntity): string {
  return resolved.kind === 'theme' ? resolved.theme.name : resolved.backbone.name;
}

function descriptionOf(resolved: ResolvedEntity): string {
  return (resolved.kind === 'theme' ? resolved.theme.description : resolved.backbone.description) ?? '';
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-700 dark:text-gray-300 truncate min-w-0">{value}</span>
    </div>
  );
}
