// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useEffect, useMemo, useId } from 'react';
import Modal from '../ui/Modal';
import SizePicker from '../ui/SizePicker';
import { NOTES_MAX } from '../../lib/constants';
import type { Product, Category, Size, RibItem, Theme, Backbone } from '../../types';

export type SizingRibModalMode =
  | { kind: 'create'; presetThemeId?: string; presetBackboneId?: string }
  | { kind: 'edit'; themeId: string; backboneId: string; ribId: string };

export interface SizingRibModalCreateInput {
  themeId: string;
  backboneId: string;
  name: string;
  category: Category;
  size: Size;
  description: string;
  notes: string;
}

export interface SizingRibModalSaveInput {
  name: string;
  description: string;
  category: Category;
  size: Size;          // ignored by caller when locked
  notes: string;
}

export interface SizingRibModalProps {
  open: boolean;
  mode: SizingRibModalMode;
  product: Product;
  locked: boolean;     // edit mode only; ignored in create mode
  onClose: () => void;
  onCreate?: (input: SizingRibModalCreateInput) => void;
  onSave?: (updates: SizingRibModalSaveInput) => void;
}

interface ResolvedRib {
  rib: RibItem;
  theme: Theme;
  backbone: Backbone;
}

/** Walk the product hierarchy to resolve a rib by IDs. Returns null if any link breaks. */
function resolveRib(product: Product, themeId: string, backboneId: string, ribId: string): ResolvedRib | null {
  const theme = product.themes.find(t => t.id === themeId);
  if (!theme) return null;
  const backbone = theme.backboneItems.find(b => b.id === backboneId);
  if (!backbone) return null;
  const rib = backbone.ribItems.find(r => r.id === ribId);
  if (!rib) return null;
  return { rib, theme, backbone };
}

export default function SizingRibModal({
  open,
  mode,
  product,
  locked,
  onClose,
  onCreate,
  onSave,
}: SizingRibModalProps) {
  // Edit-mode resolution (defensive: returns null if rib was deleted/moved concurrently).
  // Recomputed each render so concurrent edits in cloud mode are detected.
  const resolved = useMemo(() => {
    if (mode.kind !== 'edit') return null;
    return resolveRib(product, mode.themeId, mode.backboneId, mode.ribId);
  }, [mode, product]);

  // Defensive close: when an edit-mode lookup fails, schedule a close.
  // Parents must remount the modal with a fresh `key` to reseed form state.
  useEffect(() => {
    if (open && mode.kind === 'edit' && !resolved) {
      onClose();
    }
  }, [open, mode, resolved, onClose]);

  // Lazy-seeded form state. Parent passes a `key` that changes per target,
  // so the lazy initializer fires once with the correct seed values on each open.
  const [themeId, setThemeId] = useState<string>(() =>
    mode.kind === 'create' ? (mode.presetThemeId ?? '') : mode.themeId);
  const [backboneId, setBackboneId] = useState<string>(() =>
    mode.kind === 'create' ? (mode.presetBackboneId ?? '') : mode.backboneId);
  const [name, setName] = useState<string>(() =>
    mode.kind === 'edit' && resolved ? resolved.rib.name : '');
  const [description, setDescription] = useState<string>(() =>
    mode.kind === 'edit' && resolved ? (resolved.rib.description ?? '') : '');
  const [category, setCategory] = useState<Category>(() =>
    mode.kind === 'edit' && resolved ? resolved.rib.category : 'core');
  const [size, setSize] = useState<Size>(() =>
    mode.kind === 'edit' && resolved ? (resolved.rib.size ?? null) : null);
  const [notes, setNotes] = useState<string>(() =>
    mode.kind === 'edit' && resolved ? (resolved.rib.notes ?? '') : '');

  // Snapshot the initial form values once at mount; we compare against this to detect
  // unsaved changes. Using lazy useState (never updated) instead of useRef so the values
  // can be accessed during render under React 19's react-hooks/refs rule.
  const [initial] = useState({ themeId, backboneId, name, description, category, size, notes });

  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const baseId = useId();

  // Theme/backbone option lists (create-mode only)
  const themes = product.themes;
  const selectedTheme = themes.find(t => t.id === themeId);
  const backbones = selectedTheme?.backboneItems ?? [];

  // Derived backbone id: if user changes theme and the previously selected backbone
  // doesn't belong to the new theme, treat it as cleared at render time.
  const effectiveBackboneId = backbones.some(b => b.id === backboneId) ? backboneId : '';

  const showThemeSelect = mode.kind === 'create' && !mode.presetThemeId;
  const showBackboneSelect = mode.kind === 'create' && !mode.presetBackboneId;

  const trimmedName = name.trim();
  const canSubmit =
    trimmedName.length > 0 &&
    (mode.kind === 'edit' ? true : (themeId !== '' && effectiveBackboneId !== ''));

  const isDirty =
    name !== initial.name ||
    description !== initial.description ||
    category !== initial.category ||
    size !== initial.size ||
    notes !== initial.notes ||
    themeId !== initial.themeId ||
    effectiveBackboneId !== initial.backboneId;

  const notesLen = notes.length;
  const counterColor =
    notesLen >= NOTES_MAX ? 'text-red-500 dark:text-red-400' :
    notesLen >= 1800 ? 'text-amber-500 dark:text-amber-400' :
    'text-gray-400 dark:text-gray-500';

  if (mode.kind === 'edit' && !resolved) return null;

  const title = discardPromptOpen
    ? 'Unsaved changes'
    : (mode.kind === 'create' ? 'Add Rib Item' : 'Edit Rib Item');
  const primaryLabel = mode.kind === 'create' ? 'Add Rib' : 'Save';

  const submit = () => {
    if (!canSubmit) return false;
    if (mode.kind === 'create') {
      onCreate?.({
        themeId,
        backboneId: effectiveBackboneId,
        name: trimmedName,
        category,
        size,
        description,
        notes,
      });
    } else {
      // Modal always sends size in payload; SizingView is the size-omission boundary when locked.
      onSave?.({
        name: trimmedName,
        description,
        category,
        size,
        notes,
      });
    }
    return true;
  };

  const handlePrimary = () => {
    if (submit()) onClose();
  };

  // Intercept all close attempts (X, backdrop click, Escape, Cancel button).
  // While the discard prompt is showing, any close attempt dismisses the prompt
  // and returns the user to the form. Otherwise, dirty state triggers the prompt;
  // clean state closes immediately.
  const requestClose = () => {
    if (discardPromptOpen) {
      setDiscardPromptOpen(false);
      return;
    }
    if (isDirty) {
      setDiscardPromptOpen(true);
      return;
    }
    onClose();
  };

  const handleDiscard = () => {
    setDiscardPromptOpen(false);
    onClose();
  };

  const handleSaveFromPrompt = () => {
    if (submit()) {
      setDiscardPromptOpen(false);
      onClose();
    }
  };

  const handleThemeChange = (next: string) => {
    setThemeId(next);
    // Clear backbone selection when theme changes; effectiveBackboneId already handles render.
    if (backboneId) setBackboneId('');
  };

  if (discardPromptOpen) {
    return (
      <Modal open={open} onClose={requestClose} title={title} wide>
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            You have unsaved changes. What would you like to do?
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setDiscardPromptOpen(false)}
            className="px-3 py-1.5 text-sm rounded text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="px-3 py-1.5 text-sm rounded text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Discard changes
          </button>
          <button
            type="button"
            onClick={handleSaveFromPrompt}
            disabled={!canSubmit}
            title={!canSubmit ? 'Fill in required fields to save' : undefined}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed dark:disabled:bg-gray-700 dark:disabled:text-gray-500"
          >
            Save
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={requestClose} title={title} wide>
      <div className="space-y-4">
        {showThemeSelect && (
          <Field label="Theme">
            <select
              id={`${baseId}-theme`}
              name="ribTheme"
              value={themeId}
              onChange={e => handleThemeChange(e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500"
            >
              <option value="">Select a theme…</option>
              {themes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
        )}

        {showBackboneSelect && (
          <Field label="Backbone">
            <select
              id={`${baseId}-backbone`}
              name="ribBackbone"
              value={effectiveBackboneId}
              onChange={e => setBackboneId(e.target.value)}
              disabled={!selectedTheme}
              className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500"
            >
              <option value="">{selectedTheme ? 'Select a backbone…' : 'Select a theme first'}</option>
              {backbones.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Name">
          <input
            id={`${baseId}-name`}
            name="ribName"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="New Rib Item"
            autoFocus
            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500"
          />
        </Field>

        <Field label="Description">
          <textarea
            id={`${baseId}-desc`}
            name="ribDescription"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 resize-y focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500"
          />
        </Field>

        <Field label="Category">
          <div className="flex gap-1">
            {(['core', 'non-core'] as Category[]).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                  category === cat
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
        </Field>

        <Field label="Size">
          {locked ? (
            <span
              title="Size locked: progress recorded"
              className="inline-flex items-center text-xs font-medium px-2 py-1 rounded border border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            >
              {size ?? '—'}
              <span className="ml-1.5 text-[10px] opacity-70">locked</span>
            </span>
          ) : (
            <SizePicker
              value={size}
              sizeMapping={product.sizeMapping}
              onChange={(s) => setSize(s || null)}
            />
          )}
        </Field>

        <Field label="Notes">
          <textarea
            id={`${baseId}-notes`}
            name="ribNotes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            maxLength={NOTES_MAX}
            rows={4}
            placeholder="Add notes, requirements, or reference text…"
            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 resize-y focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500"
          />
          <div className={`text-xs text-right mt-1 tabular-nums ${counterColor}`}>
            {notesLen} / {NOTES_MAX}
          </div>
        </Field>
      </div>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={requestClose}
          className="px-3 py-1.5 text-sm rounded text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handlePrimary}
          disabled={!canSubmit}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed dark:disabled:bg-gray-700 dark:disabled:text-gray-500"
        >
          {primaryLabel}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{label}</div>
      {children}
    </div>
  );
}
