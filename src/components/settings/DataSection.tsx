// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useRef, type ChangeEvent } from 'react';
import { exportProduct } from '../../lib/storage';
import { downloadForecasterExport } from '../../lib/exportForForecaster';
import { downloadExcelExport } from '../../lib/exportForExcel';
import { parseImportFile } from '../../lib/import-utils';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Section } from '../ui/Section';
import type { Product, StorageDriver, ProductUpdater } from '../../types';

interface DataSectionProps {
  product: Product;
  driver: StorageDriver;
  /** Updates in-memory product state after a successful replace (replaces window.location.reload). */
  updateProduct: (updater: ProductUpdater) => void;
}

export default function DataSection({ product, driver, updateProduct }: DataSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importConfirm, setImportConfirm] = useState<Product | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [forecasterIssues, setForecasterIssues] = useState<string[] | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // Ref-based double-submission guard. Using useState would race because two
  // rapid synchronous clicks both read the same stale `false` from the closure
  // before setState commits.
  const applyingRef = useRef(false);

  // exportProduct is async — wrap in `void` so React's click handler doesn't
  // get a Promise return type. Errors are logged but not surfaced (the only
  // failure mode is a Firestore prefs read for cloud users; download still
  // happens with empty attribution).
  const handleExport = () => {
    void exportProduct(product, driver, driver.getWorkspaceId()).catch(err => {
      console.error('Export failed:', err);
    });
  };

  const handleImport = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    try {
      // FileReader (not file.text()) for jsdom compatibility and consistency
      // with useImportState. Wrapped in a promise so the rest of the handler
      // can stay linear.
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target!.result as string);
        reader.onerror = () => reject(new Error('Could not read file. Please try again.'));
        reader.readAsText(file);
      });
      const result = parseImportFile(text);

      if (!result.ok) {
        setImportError(result.error);
        return;
      }

      if (result.products.length > 1) {
        setImportError(
          'This file contains multiple projects. To import a bundled file, use the "Import Project" button on the project list homepage.',
        );
        return;
      }

      const imported = result.products[0];
      if (!imported) {
        setImportError('Unexpected empty result from file parser. Please try again.');
        return;
      }

      setImportConfirm(imported);
    } catch (err) {
      setImportError(`Failed to read file: ${(err as Error).message}`);
    }
  };

  const confirmImport = async () => {
    if (!importConfirm || applyingRef.current) return;
    applyingRef.current = true;
    try {
      const merged: Product = { ...importConfirm, id: product.id };
      await driver.replaceProduct(merged);

      // Preserve createdAt and _originRef from the current product in the
      // in-memory state. Without this, useProduct's 500ms debounced saveProduct
      // would write the imported file's values back, overwriting what
      // replaceProduct just preserved.
      //
      // owner/members are absent from the in-memory product because
      // validateProduct strips any key not in KNOWN_PRODUCT_FIELDS during
      // import, and stripFirestoreFields destroys them on every Firestore
      // listener echo. doSaveProduct's payload therefore omits them, and
      // merge:true preserves Firestore's existing values.
      updateProduct({
        ...merged,
        createdAt: product.createdAt,
        _originRef: product._originRef,
      });

      setImportConfirm(null);
    } catch (err) {
      setImportError(`Import failed: ${(err as Error).message}`);
      setImportConfirm(null);
    } finally {
      applyingRef.current = false;
    }
  };

  const handleExcelExport = async () => {
    setIsExporting(true);
    try {
      await downloadExcelExport(product);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const template = {
      id: 'example-id',
      name: 'Example Project',
      description: '',
      schemaVersion: 2,
      sizeMapping: product.sizeMapping,
      releases: [{ id: 'release-1', name: 'Release 1', order: 1, description: '', targetDate: null }],
      sprints: [{ id: 'sprint-1', name: 'Sprint 1', order: 1, endDate: null }],
      sprintCadenceWeeks: 2,
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
            releaseAllocations: [{ releaseId: 'release-1', percentage: 100, memo: '' }],
            progressHistory: [{ sprintId: 'sprint-1', releaseId: 'release-1', percentComplete: 50, comment: 'Initial implementation started', updatedAt: new Date().toISOString() }],
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

  // Blocks rather than warns — see downloadForecasterExport. The try/catch is
  // not defensive: a sprint endDate that is present but malformed reaches
  // `addDays` and throws RangeError, and validateProduct checks the field's
  // presence but never its format.
  const handleForecasterExport = () => {
    setForecasterIssues(null);
    try {
      const issues = downloadForecasterExport(product);
      if (issues.length > 0) setForecasterIssues(issues);
    } catch {
      setForecasterIssues([
        'The export could not be built. A sprint may have an invalid end date — check the Sprints section in Settings.',
      ]);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      <Section title="Data">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Export and import this project's data.</p>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleExport} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Export as JSON</button>
          <button onClick={handleForecasterExport} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">Export for SPERT Forecaster</button>
          <button onClick={handleExcelExport} disabled={isExporting} className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg">{isExporting ? 'Exporting…' : 'Export as Excel'}</button>
          <button onClick={handleImport} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600">Import Project from JSON</button>
          <button onClick={handleDownloadTemplate} className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">Download Template</button>
        </div>
        {importError && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-3 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{importError}</p>
        )}
        {forecasterIssues && (
          <div role="alert" className="text-sm text-red-600 dark:text-red-400 mt-3 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            <p className="font-medium">This project cannot be exported to SPERT Forecaster yet:</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              {forecasterIssues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={!!importConfirm}
        onClose={() => setImportConfirm(null)}
        onConfirm={confirmImport}
        title="Replace Project Data"
        message={`Importing "${importConfirm?.name}" will permanently replace all data in "${product.name}" — themes, backbones, rib items, releases, sprints, and progress history. This cannot be undone.`}
        confirmLabel="Replace All Data"
      />
    </>
  );
}
