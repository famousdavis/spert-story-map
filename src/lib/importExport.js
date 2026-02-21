import { DEFAULT_SIZE_MAPPING, SCHEMA_VERSION } from './constants';
import { loadPreferences, getWorkspaceId, migrateToV2, appendChangeLogEntry } from './storage';
import { validateProduct } from './validateProduct';

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
 * Max allowed JSON file size (5 MB). Prevents DoS via oversized imports.
 */
const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

/**
 * Parse, validate, and sanitize a JSON string into a product object.
 * Applies comprehensive schema validation to prevent state corruption.
 */
export function importProductFromJSON(jsonString) {
  if (typeof jsonString !== 'string' || jsonString.length > MAX_IMPORT_SIZE) {
    throw new Error(`Import file too large (max ${MAX_IMPORT_SIZE / 1024 / 1024} MB)`);
  }

  let data = JSON.parse(jsonString);

  // Comprehensive schema validation — checks types, ranges, lengths,
  // strips unknown fields, and clamps numeric values
  data = validateProduct(data);

  // Backfill defaults for optional arrays
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

/**
 * Open a file picker, read + parse the JSON, and call onParsed(product).
 * If parsing/validation fails, calls onError(message) instead of alert().
 */
export function readImportFile(onParsed, onError) {
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
        const msg = 'Failed to import: ' + err.message;
        if (onError) {
          onError(msg);
        } else {
          // Fallback for callers that don't provide onError yet
          alert(msg);
        }
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
