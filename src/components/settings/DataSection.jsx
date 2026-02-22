import { useState } from 'react';
import { exportProduct, readImportFile } from '../../lib/storage';
import { downloadForecasterExport } from '../../lib/exportForForecaster';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Section } from '../ui/Section';

export default function DataSection({ product, driver }) {
  const [importConfirm, setImportConfirm] = useState(null);
  const [importError, setImportError] = useState(null);

  const handleExport = () => exportProduct(product, driver.getWorkspaceId());

  const handleImport = () => {
    setImportError(null);
    readImportFile(
      (imported) => setImportConfirm(imported),
      (errorMsg) => setImportError(errorMsg),
    );
  };

  const confirmImport = async () => {
    if (importConfirm) {
      const merged = { ...importConfirm, id: product.id };
      await driver.saveProductImmediate(merged);
      setImportConfirm(null);
      window.location.reload();
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

  return (
    <>
      <Section title="Data">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Export and import this project's data.</p>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleExport} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Export as JSON</button>
          <button onClick={() => downloadForecasterExport(product)} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">Export for SPERT Forecaster</button>
          <button onClick={handleImport} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600">Import Project from JSON</button>
          <button onClick={handleDownloadTemplate} className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">Download Template</button>
        </div>
        {importError && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-3 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{importError}</p>
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
