import { DEFAULT_SIZE_MAPPING, SCHEMA_VERSION } from './constants';
import { loadPreferences, getWorkspaceId, migrateToV2, appendChangeLogEntry } from './storage';

/**
 * Export a product as a downloadable JSON file.
 */
export function exportProduct(product, storageRefOverride) {
  const prefs = loadPreferences();
  const exportData = {
    ...product,
    _storageRef: storageRefOverride || getWorkspaceId(),
    ...(prefs.exportName ? { _exportedBy: prefs.exportName } : {}),
    ...(prefs.exportId ? { _exportedById: prefs.exportId } : {}),
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `${product.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse and validate a JSON string into a product object.
 */
export function importProductFromJSON(jsonString) {
  let data = JSON.parse(jsonString);
  // Basic validation
  if (!data.id || !data.name || !Array.isArray(data.themes)) {
    throw new Error('Invalid product data: missing required fields');
  }
  for (const theme of data.themes) {
    if (!theme.id || !Array.isArray(theme.backboneItems)) {
      throw new Error('Invalid product data: theme missing id or backboneItems');
    }
    for (const bb of theme.backboneItems) {
      if (!bb.id || !Array.isArray(bb.ribItems)) {
        throw new Error('Invalid product data: backbone missing id or ribItems');
      }
    }
  }
  if (!data.sizeMapping) data.sizeMapping = [...DEFAULT_SIZE_MAPPING];
  if (!data.releases) data.releases = [];
  if (!data.sprints) data.sprints = [];
  // Migrate if needed
  if (!data.schemaVersion || data.schemaVersion < SCHEMA_VERSION) {
    data = migrateToV2(data);
  }

  // Preserve _originRef from imported file; backfill if pre-feature
  if (!data._originRef) {
    data._originRef = getWorkspaceId();
  }

  // Append import event to changelog
  data._changeLog = appendChangeLogEntry(data, {
    op: 'import',
    entity: 'product',
    source: 'file',
  });

  // Strip export-time-only fields
  delete data._storageRef;
  delete data._exportedBy;
  delete data._exportedById;

  return data;
}

/** Open a file picker, read + parse the JSON, and call onParsed(product). */
export function readImportFile(onParsed) {
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
        onParsed(product);
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
