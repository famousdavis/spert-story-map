// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import {
  useRef,
  useEffect,
  type RefObject,
  type ChangeEvent,
} from 'react';
import type {
  ImportPhase,
  ImportConflict,
  ImportDecision,
  ConflictAction,
  ParsedImport,
  StorageMode,
} from '../../types';

interface ImportPreviewSectionProps {
  phase: ImportPhase;
  mode: StorageMode;
  cloudDataLoaded: boolean;
  // React 19: useRef<T>(null) returns RefObject<T | null>, not RefObject<T>.
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSetDecision: (importedProductId: string, action: ConflictAction) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function buildBannerText(outcome: ImportPhase & { tag: 'done' }): string {
  const o = outcome.outcome;
  const parts: string[] = [];
  if (o.added > 0)               parts.push(`${o.added} added`);
  if (o.replaced > 0)            parts.push(`${o.replaced} replaced`);
  if (o.copied > 0)              parts.push(`${o.copied} imported as cop${o.copied === 1 ? 'y' : 'ies'}`);
  if (o.skipped > 0)             parts.push(`${o.skipped} skipped`);
  if (o.driftSkipped.length > 0) parts.push(`${o.driftSkipped.length} skipped (workspace changed)`);
  if (o.errors.length > 0)       parts.push(`${o.errors.length} failed`);
  return parts.length > 0
    ? `Import complete: ${parts.join(', ')}.`
    : 'No changes were made.';
}

function DecisionRow({
  conflict, decision, onSetDecision, disabled,
}: {
  conflict: ImportConflict;
  decision: ImportDecision;
  onSetDecision: (id: string, action: ConflictAction) => void;
  disabled: boolean;
}) {
  const isId = conflict.type === 'id';
  const badge = isId
    ? { label: 'ID match',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
    : { label: 'Name match', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <div className="flex items-start gap-2 mb-2">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>
          {badge.label}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {conflict.incomingProduct.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isId
              ? 'Same project ID as an existing project'
              : `Matches the name of "${conflict.existingProduct.name}"`}
          </p>
        </div>
      </div>
      <div role="radiogroup" aria-label={`Decision for ${conflict.incomingProduct.name}`} className="flex gap-3">
        {(['skip', 'copy', 'replace'] as ConflictAction[]).map(action => (
          <label key={action} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={`decision-${conflict.incomingProduct.id}`}
              value={action}
              checked={decision.action === action}
              disabled={disabled}
              onChange={() => onSetDecision(conflict.incomingProduct.id, action)}
              className="accent-blue-600"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">
              {action === 'copy' ? 'Import as copy' : action === 'replace' ? 'Replace existing' : 'Skip'}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImportPreviewBody — sub-component, mounts only for phase.tag === 'preview'.
// Extracted so its useRef/useEffect (heading focus) run unconditionally at its
// own top level. `key={phase.pickSeq}` on the call site forces remount on every
// file pick, including consecutive picks of files with identical names.
// ---------------------------------------------------------------------------

function ImportPreviewBody({
  parsed, conflicts, decisions, onSetDecision, onConfirm, onCancel,
}: {
  parsed: ParsedImport;
  conflicts: ImportConflict[];
  decisions: ImportDecision[];
  onSetDecision: (id: string, action: ConflictAction) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const conflictProductIds = new Set(conflicts.map(c => c.incomingProduct.id));
  const noConflictProducts = parsed.products.filter(p => !conflictProductIds.has(p.id));
  const conflictRows = conflicts.map(c => ({
    conflict: c,
    decision: decisions.find(d => d.importedProductId === c.incomingProduct.id)!,
  }));
  const hasReplaceDecisions = decisions.some(d => d.action === 'replace');

  return (
    <div
      role="region"
      aria-labelledby="import-preview-heading"
      className="border border-gray-200 dark:border-gray-700 rounded-xl mt-4 overflow-hidden"
    >
      <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3
          id="import-preview-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
        >
          Import preview — {parsed.fileName}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {parsed.products.length} project{parsed.products.length !== 1 ? 's' : ''} in file
        </p>
      </div>

      <div className="p-4 space-y-4">
        {noConflictProducts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Will be added ({noConflictProducts.length})
            </p>
            <div className="space-y-1">
              {noConflictProducts.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/10 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-sm text-gray-800 dark:text-gray-200">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {conflictRows.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Conflicts — choose action ({conflictRows.length})
            </p>
            <div className="space-y-2">
              {conflictRows.map(({ conflict, decision }) => (
                <DecisionRow
                  key={conflict.incomingProduct.id}
                  conflict={conflict}
                  decision={decision}
                  onSetDecision={onSetDecision}
                  disabled={false}
                />
              ))}
            </div>
          </div>
        )}

        {hasReplaceDecisions && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 space-y-1">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              One or more projects will <strong>permanently replace</strong> existing data.
              This cannot be undone. Consider exporting first.
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              The existing project's audit history will also be replaced by the incoming
              file's history. If the destination project's prior history matters, export it
              before proceeding.
            </p>
          </div>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
          Cancel
        </button>
        <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
          Confirm Import
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImportPreviewSection — outer component (Escape-key effect at top level)
// ---------------------------------------------------------------------------

export default function ImportPreviewSection({
  phase, mode, cloudDataLoaded, fileInputRef,
  onFileChange, onSetDecision, onConfirm, onCancel,
}: ImportPreviewSectionProps) {
  useEffect(() => {
    if (phase.tag === 'idle') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [phase.tag, onCancel]);

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".json"
      className="hidden"
      onChange={onFileChange}
      aria-hidden="true"
    />
  );

  if (phase.tag === 'idle') {
    return (
      <>
        {hiddenInput}
        {mode === 'cloud' && !cloudDataLoaded && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Loading cloud projects… Import will be available once your workspace loads.
          </p>
        )}
      </>
    );
  }

  if (phase.tag === 'error') {
    return (
      <>
        {hiddenInput}
        <div role="alert" className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mt-3">
          <p className="text-sm text-red-700 dark:text-red-300 flex-1 whitespace-pre-wrap">{phase.message}</p>
          <button onClick={onCancel} className="text-red-400 hover:text-red-600 flex-shrink-0 text-lg leading-none" aria-label="Dismiss error">&times;</button>
        </div>
      </>
    );
  }

  if (phase.tag === 'applying') {
    return (
      <>
        {hiddenInput}
        <div aria-busy="true" aria-label="Applying import…" className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 mt-3">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-300">Applying import…</p>
        </div>
      </>
    );
  }

  if (phase.tag === 'done') {
    const o = phase.outcome;
    const hasErrors = o.errors.length > 0;
    const hasDriftSkips = o.driftSkipped.length > 0;
    const bannerCls = hasErrors
      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
    const textCls = hasErrors ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300';

    return (
      <>
        {hiddenInput}
        <div role={hasErrors ? 'alert' : 'status'} aria-live={hasErrors ? 'assertive' : 'polite'} className={`border rounded-lg px-4 py-3 mt-3 ${bannerCls}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className={`text-sm font-medium ${textCls}`}>{buildBannerText(phase)}</p>
              {hasDriftSkips && (
                <ul className="mt-1 text-xs text-yellow-700 dark:text-yellow-400 list-disc list-inside">
                  {o.driftSkipped.map((s, i) => <li key={i}><strong>{s.productName}</strong>: {s.reason}</li>)}
                </ul>
              )}
              {hasErrors && (
                <ul className="mt-1 text-xs text-red-600 dark:text-red-400 list-disc list-inside">
                  {o.errors.map((e, i) => <li key={i}><strong>{e.productName}</strong>: {e.reason}</li>)}
                </ul>
              )}
            </div>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 flex-shrink-0 text-lg leading-none" aria-label="Dismiss">&times;</button>
          </div>
        </div>
      </>
    );
  }

  // phase.tag === 'preview'
  return (
    <>
      {hiddenInput}
      <ImportPreviewBody
        key={phase.pickSeq}
        parsed={phase.parsed}
        conflicts={phase.conflicts}
        decisions={phase.decisions}
        onSetDecision={onSetDecision}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </>
  );
}
