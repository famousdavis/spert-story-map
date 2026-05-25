// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, StorageDriver, UserSettings } from '../types';
import { DEFAULT_SIZE_MAPPING, SCHEMA_VERSION } from './constants';
import { getWorkspaceId, migrateToV2, appendChangeLogEntry } from './storage';
import { validateProduct } from './validateProduct';

/**
 * Export a product as a downloadable JSON file.
 *
 * Reads Export Attribution from the storage driver — cloud users get the
 * Firestore-stored prefs, local users get their localStorage prefs. Without
 * this routing, a cloud user's export would be unstamped because the previous
 * sync loadPreferences() only read localStorage. Single-product callers omit
 * cachedPrefs; batch callers (exportAllProducts) hoist one read and pass the
 * prefs through to avoid N Firestore reads.
 */
export async function exportProduct(
  product: Product,
  driver: StorageDriver,
  storageRefOverride?: string,
  cachedPrefs?: UserSettings,
): Promise<void> {
  const prefs = cachedPrefs ?? await driver.loadPreferences();
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
  const safeName = product.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  a.href = url;
  a.download = `spert-story-map-${safeName}-${timestamp}.json`;
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
export function importProductFromJSON(jsonString: string): Product {
  if (typeof jsonString !== 'string' || jsonString.length > MAX_IMPORT_SIZE) {
    throw new Error(`Import file too large (max ${MAX_IMPORT_SIZE / 1024 / 1024} MB)`);
  }

  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON file — please check the file format.');
  }

  // Comprehensive schema validation — checks types, ranges, lengths,
  // strips unknown fields, and clamps numeric values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validated product needs mutation before final return
  let product: any = validateProduct(data);

  // Backfill defaults for optional arrays
  if (!product.sizeMapping) product.sizeMapping = [...DEFAULT_SIZE_MAPPING];
  if (!product.releases) product.releases = [];
  if (!product.sprints) product.sprints = [];

  // Migrate if needed
  if (!product.schemaVersion || product.schemaVersion < SCHEMA_VERSION) {
    product = migrateToV2(product);
  }

  // Preserve _originRef from imported file; backfill if pre-feature
  if (!product._originRef) {
    product._originRef = getWorkspaceId();
  }

  // Append import event to changelog
  product._changeLog = appendChangeLogEntry(product, {
    op: 'import',
    entity: 'product',
    source: 'file',
  });

  // Strip export-time-only fields
  delete product._storageRef;
  delete product._exportedBy;
  delete product._exportedById;

  return product as Product;
}

/**
 * Export all products as individual JSON file downloads.
 * Uses the storage driver to load products (works for both local and cloud).
 *
 * Hoists prefs to one read (passes through to exportProduct via cachedPrefs)
 * so a cloud user with N projects pays for 1 Firestore preferences read, not N.
 *
 * @param {object} driver - Storage driver from useStorage()
 * @param {string} [storageRefOverride] - Optional workspace ID override (cloud mode)
 */
export async function exportAllProducts(driver: StorageDriver, storageRefOverride?: string) {
  const prefs = await driver.loadPreferences();
  const products = await driver.loadProductIndex();
  let exported = 0;

  for (const product of products) {
    // loadProductIndex returns full product data in cloud mode,
    // but only index entries in local mode — load full product if needed
    const full = product.themes
      ? product
      : await driver.loadProduct(product.id);
    if (!full) continue;

    await exportProduct(full, driver, storageRefOverride, prefs);
    exported++;

    // Small delay between downloads so browsers don't block them
    if (exported < products.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return { exported };
}

/**
 * Export all products as a single bundled JSON file.
 * Each product is stamped with _storageRef and export attribution.
 */
export async function exportAllProductsBundled(driver: StorageDriver, storageRefOverride?: string) {
  const prefs = await driver.loadPreferences();
  const products = await driver.loadProductIndex();
  const bundle: Product[] = [];

  for (const product of products) {
    const full = product.themes
      ? product
      : await driver.loadProduct(product.id);
    if (!full) continue;

    bundle.push({
      ...full,
      _storageRef: storageRefOverride || getWorkspaceId(),
      ...(prefs.exportName ? { _exportedBy: prefs.exportName } : {}),
      ...(prefs.exportId ? { _exportedById: prefs.exportId } : {}),
    });
  }

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `spert-story-map-${timestamp}.json`;
  a.click();
  URL.revokeObjectURL(url);

  return { exported: bundle.length };
}

/**
 * Open a file picker, read + parse the JSON, and call onParsed(product).
 * If parsing/validation fails, calls onError(message) instead of alert().
 */
export function readImportFile(onParsed: (product: Product) => void, onError?: (message: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      const msg = 'Failed to import: File must be a .json file';
      if (onError) { onError(msg); } else { alert(msg); }
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const product = importProductFromJSON(ev.target!.result as string);
        onParsed(product);
      } catch (err) {
        const msg = 'Failed to import: ' + (err as Error).message;
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
