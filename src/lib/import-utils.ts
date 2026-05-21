// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type {
  Product,
  StorageDriver,
  ImportConflict,
  ImportDecision,
  ImportOutcome,
  ParsedImport,
} from '../types';
import { importProductFromJSON, appendChangeLogEntry, duplicateProduct } from './storage';

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

export function normalizeProductName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// ---------------------------------------------------------------------------
// Copy name disambiguation
// ---------------------------------------------------------------------------

export function nextCopyName(baseName: string, existingNames: string[]): string {
  const occupied = new Set(existingNames.map(normalizeProductName));
  const first = `${baseName} (Copy)`;
  if (!occupied.has(normalizeProductName(first))) return first;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${baseName} (Copy ${i})`;
    if (!occupied.has(normalizeProductName(candidate))) return candidate;
  }
  return `${baseName} (Copy ${Date.now()})`;
}

// ---------------------------------------------------------------------------
// File parsing
// ---------------------------------------------------------------------------

const MAX_IMPORT_SIZE = 5 * 1024 * 1024; // 5 MB; private const, not re-exported

/**
 * Parse, validate, and normalize a raw JSON string from an import file.
 *
 * Two formats supported:
 *   • Single product object — from exportProduct()
 *   • Array of product objects — from exportAllProductsBundled()
 *
 * Runs importProductFromJSON (→ validateProduct + migrateToV2) per product.
 */
export function parseImportFile(
  text: string,
): { ok: true; products: Product[] } | { ok: false; error: string } {
  if (text.length > MAX_IMPORT_SIZE) {
    return { ok: false, error: `File too large (max ${MAX_IMPORT_SIZE / 1024 / 1024} MB).` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON file — please check the file format.' };
  }

  // Bundle format: top-level array from exportAllProductsBundled()
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return { ok: false, error: 'Export file contains no projects.' };
    }
    const products: Product[] = [];
    const validationErrors: string[] = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i]; // noUncheckedIndexedAccess: bind before use
      if (item === undefined) continue;
      try {
        products.push(importProductFromJSON(JSON.stringify(item)));
      } catch (err) {
        const label =
          typeof item === 'object' &&
          item !== null &&
          'name' in item &&
          typeof (item as Record<string, unknown>).name === 'string'
            ? `"${(item as { name: string }).name}"`
            : `item ${i + 1}`;
        validationErrors.push(`${label}: ${(err as Error).message}`);
      }
    }
    if (validationErrors.length > 0) {
      return { ok: false, error: `Bundle contains invalid project(s):\n${validationErrors.join('\n')}` };
    }
    return { ok: true, products };
  }

  // Single product object from exportProduct()
  if (raw !== null && typeof raw === 'object') {
    try {
      return { ok: true, products: [importProductFromJSON(text)] };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  return {
    ok: false,
    error: 'Unrecognized file format — expected a product JSON object or a bundled export array.',
  };
}

// ---------------------------------------------------------------------------
// Conflict detection (Layer 1)
// ---------------------------------------------------------------------------

export function detectConflicts(incoming: Product[], existing: Product[]): ImportConflict[] {
  const existingById = new Map(existing.map(p => [p.id, p]));
  const existingByNorm = new Map(existing.map(p => [normalizeProductName(p.name), p]));

  const conflicts: ImportConflict[] = [];
  for (const inc of incoming) {
    const idMatch = existingById.get(inc.id);
    if (idMatch) {
      conflicts.push({ type: 'id', incomingProduct: inc, existingProduct: idMatch, originalExistingId: idMatch.id });
      continue;
    }
    const nameMatch = existingByNorm.get(normalizeProductName(inc.name));
    if (nameMatch) {
      conflicts.push({ type: 'name', incomingProduct: inc, existingProduct: nameMatch, originalExistingId: nameMatch.id });
    }
  }
  return conflicts;
}

/**
 * Build default ImportDecision array from detected conflicts.
 *   ID conflict   → 'skip'  (safe default; prevents accidental overwrite)
 *   Name conflict → 'copy'  (incoming is probably worth adding)
 */
export function buildDefaultDecisions(conflicts: ImportConflict[]): ImportDecision[] {
  return conflicts.map(c => ({
    importedProductId: c.incomingProduct.id,
    kind: c.type,
    originalExistingId: c.originalExistingId,
    action: c.type === 'id' ? 'skip' : 'copy',
  }));
}

// ---------------------------------------------------------------------------
// Apply loop (Layer 2 re-validation + writes)
// ---------------------------------------------------------------------------

/**
 * Apply import decisions after Layer 2 drift re-validation.
 *
 * Write contract:
 *   'add'     → driver.createProduct(prod, { throwOnError: true })
 *   'replace' → driver.replaceProduct() — runTransaction in cloud
 *   'copy'    → duplicateProduct() + driver.createProduct(copy, { throwOnError: true })
 *
 * `throwOnError: true` is critical: without it, the driver's internal try/catch
 * swallows quota/permission errors and outcome.added/copied would lie about success.
 * `replaceProduct` already throws unconditionally in cloud (Phase 2b) and through
 * its localStorage.setItem in local (Phase 2a) — no flag needed there.
 */
export async function applyImport(
  driver: StorageDriver,
  parsed: ParsedImport,
  decisions: ImportDecision[],
): Promise<ImportOutcome> {
  const outcome: ImportOutcome = {
    added: 0, replaced: 0, copied: 0, skipped: 0,
    driftSkipped: [], errors: [],
  };

  const freshProducts = await driver.loadProductIndex();
  const freshById = new Map(freshProducts.map(p => [p.id, p]));
  const freshByNorm = new Map(freshProducts.map(p => [normalizeProductName(p.name), p]));
  const decisionMap = new Map(decisions.map(d => [d.importedProductId, d]));

  const toAdd: Product[] = [];
  const toReplace: Product[] = [];
  const toCopy: Product[] = [];

  for (const prod of parsed.products) {
    const decision = decisionMap.get(prod.id);

    if (!decision) {
      if (freshById.has(prod.id) || freshByNorm.has(normalizeProductName(prod.name))) {
        outcome.driftSkipped.push({ productName: prod.name, reason: 'A conflict appeared in the workspace since the preview was shown.' });
      } else {
        toAdd.push(prod);
      }
      continue;
    }

    if (decision.action === 'skip') { outcome.skipped++; continue; }
    if (decision.action === 'copy') { toCopy.push(prod); continue; }

    // 'replace'
    if (decision.kind === 'id') {
      if (!freshById.has(prod.id)) {
        if (freshByNorm.has(normalizeProductName(prod.name))) {
          outcome.driftSkipped.push({ productName: prod.name, reason: 'Original target was deleted and a name collision appeared since the preview.' });
        } else {
          toAdd.push(prod);
        }
      } else {
        toReplace.push(prod);
      }
    } else {
      const freshNameHolder = freshByNorm.get(normalizeProductName(prod.name));
      if (!freshNameHolder) {
        if (freshById.has(prod.id)) {
          outcome.driftSkipped.push({ productName: prod.name, reason: 'Name target was removed and an ID collision appeared since the preview.' });
        } else {
          toAdd.push(prod);
        }
      } else if (freshNameHolder.id !== decision.originalExistingId) {
        outcome.driftSkipped.push({
          productName: prod.name,
          reason: `A different project ("${freshNameHolder.name}") now holds the conflicting name. Skipped to avoid overwriting unrelated data.`,
        });
      } else {
        toReplace.push({ ...prod, id: freshNameHolder.id });
      }
    }
  }

  for (const prod of toAdd) {
    try {
      await Promise.resolve().then(() => driver.createProduct(prod, { throwOnError: true }));
      outcome.added++;
    } catch (err) {
      outcome.errors.push({ productName: prod.name, reason: (err as Error).message });
    }
  }

  for (const prod of toReplace) {
    try {
      await Promise.resolve().then(() => driver.replaceProduct(prod));
      outcome.replaced++;
    } catch (err) {
      outcome.errors.push({ productName: prod.name, reason: (err as Error).message });
    }
  }

  const runningNames = freshProducts.map(p => p.name);
  for (const prod of toCopy) {
    try {
      const copyName = nextCopyName(prod.name, runningNames);
      runningNames.push(copyName);

      // duplicateProduct regenerates ALL nested IDs but REPLACES _changeLog with
      // a single [{op:'duplicate'}] entry. Splice the original file history back
      // in so the 'copy' path preserves audit provenance, matching the 'add' path.
      // appendChangeLogEntry caps total length at CHANGELOG_MAX_ENTRIES.
      const dup = duplicateProduct(prod, driver.getWorkspaceId());
      const withHistory: Product = {
        ...dup,
        _changeLog: [
          ...(prod._changeLog ?? []),
          ...(dup._changeLog ?? []), // [{op:'duplicate', source: <imported-id>}]
        ],
      };
      const importLog = appendChangeLogEntry(withHistory, { op: 'import', entity: 'product', source: 'file' });
      const namedCopy: Product = { ...withHistory, name: copyName, _changeLog: importLog };

      await Promise.resolve().then(() => driver.createProduct(namedCopy, { throwOnError: true }));
      outcome.copied++;
    } catch (err) {
      outcome.errors.push({ productName: prod.name, reason: (err as Error).message });
    }
  }

  return outcome;
}
