// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeProductName,
  nextCopyName,
  detectConflicts,
  buildDefaultDecisions,
  applyImport,
} from '../lib/import-utils';
import { importProductFromJSON } from '../lib/importExport';
import type { Product, StorageDriver } from '../types';

// Override randomUUID with a counter for deterministic test IDs. The spread is
// belt-and-suspenders — none of these tests use crypto.subtle or getRandomValues.
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => `uuid-${++uuidCounter}`,
});

beforeEach(() => { uuidCounter = 0; });

function makeProduct(id: string, name: string, overrides: Partial<Product> = {}): Product {
  return {
    id, name, description: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    schemaVersion: 2, sizeMapping: [], releases: [], sprints: [], themes: [],
    ...overrides,
  };
}

function makeDriver(overrides: Partial<StorageDriver> = {}): StorageDriver {
  return {
    mode: 'local',
    loadProductIndex: vi.fn().mockResolvedValue([]),
    loadProduct: vi.fn().mockResolvedValue(null),
    createProduct: vi.fn().mockResolvedValue(undefined),
    saveProduct: vi.fn().mockResolvedValue(undefined),
    saveProductImmediate: vi.fn().mockResolvedValue(undefined),
    replaceProduct: vi.fn().mockResolvedValue(undefined),
    deleteProduct: vi.fn().mockResolvedValue(undefined),
    loadPreferences: vi.fn().mockResolvedValue({}),
    writePreferences: vi.fn().mockResolvedValue(undefined),
    getWorkspaceId: vi.fn().mockReturnValue('ws-1'),
    onProductChange: vi.fn().mockReturnValue(() => {}),
    onProductSaved: vi.fn().mockReturnValue(() => {}),
    onSaveError: vi.fn(),
    flushPendingSaves: vi.fn(),
    cancelPendingSaves: vi.fn(),
    tearDownListeners: vi.fn(),
    listPendingInvites: vi.fn().mockResolvedValue([]),
    removeCollaborator: vi.fn().mockResolvedValue(undefined),
    revokeInvite: vi.fn().mockResolvedValue(undefined),
    resendInvite: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeParsedImport(products: Product[]) {
  return { products, fileName: 'test.json' };
}

describe('normalizeProductName', () => {
  it('trims and lowercases', () => {
    expect(normalizeProductName('  My Project  ')).toBe('my project');
  });
  it('collapses internal whitespace', () => {
    expect(normalizeProductName('My   Project')).toBe('my project');
  });
});

describe('nextCopyName', () => {
  it('returns baseName (Copy) when not occupied', () => {
    expect(nextCopyName('Alpha', [])).toBe('Alpha (Copy)');
  });
  it('increments when (Copy) is taken', () => {
    expect(nextCopyName('Alpha', ['Alpha (Copy)'])).toBe('Alpha (Copy 2)');
  });
  it('comparison is case-insensitive', () => {
    expect(nextCopyName('Alpha', ['alpha (copy)'])).toBe('Alpha (Copy 2)');
  });
  it('disambiguates across multiple copies in the same run', () => {
    expect(nextCopyName('Alpha', ['Alpha (Copy)', 'Alpha (Copy 2)'])).toBe('Alpha (Copy 3)');
  });
});

describe('detectConflicts', () => {
  it('returns no conflicts for empty workspace', () => {
    expect(detectConflicts([makeProduct('p1', 'Widget')], [])).toHaveLength(0);
  });
  it('detects ID conflict', () => {
    const conflicts = detectConflicts([makeProduct('p1', 'Widget')], [makeProduct('p1', 'Widget v2')]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe('id');
    expect(conflicts[0]!.originalExistingId).toBe('p1');
  });
  it('detects name conflict', () => {
    const conflicts = detectConflicts([makeProduct('p2', 'Widget')], [makeProduct('p1', 'Widget')]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe('name');
    expect(conflicts[0]!.originalExistingId).toBe('p1');
  });
  it('name conflict is case-insensitive', () => {
    expect(detectConflicts([makeProduct('p2', 'widget')], [makeProduct('p1', 'Widget')])).toHaveLength(1);
  });
  it('ID conflict takes priority over name conflict', () => {
    const conflicts = detectConflicts([makeProduct('p1', 'Widget')], [makeProduct('p1', 'Widget')]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe('id');
  });
});

describe('buildDefaultDecisions', () => {
  it('defaults ID conflicts to skip', () => {
    const c = { type: 'id' as const, incomingProduct: makeProduct('p1', 'W'), existingProduct: makeProduct('p1', 'W'), originalExistingId: 'p1' };
    expect(buildDefaultDecisions([c])[0]!.action).toBe('skip');
  });
  it('defaults name conflicts to copy', () => {
    const c = { type: 'name' as const, incomingProduct: makeProduct('p2', 'W'), existingProduct: makeProduct('p1', 'W'), originalExistingId: 'p1' };
    expect(buildDefaultDecisions([c])[0]!.action).toBe('copy');
  });
});

describe('applyImport', () => {
  it('adds a conflict-free product', async () => {
    const driver = makeDriver();
    const outcome = await applyImport(driver, makeParsedImport([makeProduct('p1', 'Widget')]), []);
    expect(outcome.added).toBe(1);
    expect(driver.createProduct).toHaveBeenCalledTimes(1);
  });

  it('passes throwOnError: true to createProduct', async () => {
    const driver = makeDriver();
    await applyImport(driver, makeParsedImport([makeProduct('p1', 'Widget')]), []);
    const calls = (driver.createProduct as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]?.[1]).toEqual({ throwOnError: true });
  });

  it('skips when user decision is skip', async () => {
    const driver = makeDriver({ loadProductIndex: vi.fn().mockResolvedValue([makeProduct('p1', 'Widget')]) });
    const decision = { importedProductId: 'p1', kind: 'id' as const, originalExistingId: 'p1', action: 'skip' as const };
    const outcome = await applyImport(driver, makeParsedImport([makeProduct('p1', 'Widget')]), [decision]);
    expect(outcome.skipped).toBe(1);
    expect(driver.createProduct).not.toHaveBeenCalled();
  });

  it('copy path uses duplicateProduct, disambiguates name, and preserves imported _changeLog', async () => {
    const driver = makeDriver();
    const original = makeProduct('orig-id', 'Widget', {
      _changeLog: [{ t: 1700000000, op: 'create', entity: 'product' }],
    });
    const decision = { importedProductId: 'orig-id', kind: 'id' as const, originalExistingId: 'orig-id', action: 'copy' as const };
    const outcome = await applyImport(driver, makeParsedImport([original]), [decision]);
    expect(outcome.copied).toBe(1);
    const calls = (driver.createProduct as ReturnType<typeof vi.fn>).mock.calls;
    const calledWith = calls[0]?.[0] as Product | undefined;
    expect(calledWith).toBeDefined();
    expect(calledWith!.id).not.toBe('orig-id');
    expect(calledWith!.name).toBe('Widget (Copy)');
    const ops = (calledWith!._changeLog ?? []).map(e => e.op);
    expect(ops).toContain('create');     // from original file
    expect(ops).toContain('duplicate');  // from duplicateProduct
    expect(ops).toContain('import');     // appended by applyImport
  });

  // v0.55.1: a copy of a 1000-character name came out at 1007, and that copy's own export
  // then refused to import ("Product name must be a non-empty string (max 1000 chars)").
  it('copy path keeps a 1000-character name within 1000, and the copy imports', async () => {
    const long = 'L'.repeat(1000);
    const driver = makeDriver({ loadProductIndex: vi.fn().mockResolvedValue([makeProduct('p1', long)]) });
    const decision = { importedProductId: 'p2', kind: 'name' as const, originalExistingId: 'p1', action: 'copy' as const };
    const outcome = await applyImport(driver, makeParsedImport([makeProduct('p2', long)]), [decision]);
    expect(outcome.copied).toBe(1);
    const created = (driver.createProduct as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Product;
    expect(created.name).toBe(`${'L'.repeat(993)} (Copy)`);
    expect(() => importProductFromJSON(JSON.stringify(created))).not.toThrow();
  });

  it('copy path keeps numbered copies within 1000 and distinct, in the same run', async () => {
    const long = 'L'.repeat(1000);
    const taken = `${'L'.repeat(993)} (Copy)`;
    const driver = makeDriver({
      loadProductIndex: vi.fn().mockResolvedValue([makeProduct('p1', long), makeProduct('p2', taken)]),
    });
    const copy = (id: string) => ({ importedProductId: id, kind: 'name' as const, originalExistingId: 'p1', action: 'copy' as const });
    const outcome = await applyImport(
      driver, makeParsedImport([makeProduct('p3', long), makeProduct('p4', long)]), [copy('p3'), copy('p4')],
    );
    expect(outcome.copied).toBe(2);
    const names = (driver.createProduct as ReturnType<typeof vi.fn>).mock.calls.map(c => (c[0] as Product).name);
    const occupied = [long, taken].map(normalizeProductName);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(1000);
      expect(occupied).not.toContain(normalizeProductName(name));
    }
    expect(normalizeProductName(names[0]!)).not.toBe(normalizeProductName(names[1]!));
    const created = (driver.createProduct as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as Product);
    for (const product of created) expect(() => importProductFromJSON(JSON.stringify(product))).not.toThrow();
  });

  it('drift-skips a conflict-free add when a collision appears at Layer 2', async () => {
    const driver = makeDriver({ loadProductIndex: vi.fn().mockResolvedValue([makeProduct('p1', 'Widget')]) });
    const outcome = await applyImport(driver, makeParsedImport([makeProduct('p1', 'Widget')]), []);
    expect(outcome.driftSkipped).toHaveLength(1);
    expect(outcome.added).toBe(0);
  });

  it('drift-skips name-conflict replace when a different project now holds the name', async () => {
    const driver = makeDriver({ loadProductIndex: vi.fn().mockResolvedValue([makeProduct('new-id', 'Widget')]) });
    const incoming = makeProduct('p2', 'Widget');
    const decision = { importedProductId: 'p2', kind: 'name' as const, originalExistingId: 'old-id', action: 'replace' as const };
    const outcome = await applyImport(driver, makeParsedImport([incoming]), [decision]);
    expect(outcome.driftSkipped).toHaveLength(1);
    expect(outcome.replaced).toBe(0);
  });

  it('surfaces write errors in outcome.errors without double-counting', async () => {
    // The mock throws regardless of the options arg, simulating throwOnError honored by the driver.
    const driver = makeDriver({
      createProduct: vi.fn().mockImplementation(() => { throw new Error('QuotaExceededError'); }),
    });
    const outcome = await applyImport(driver, makeParsedImport([makeProduct('p1', 'Widget')]), []);
    expect(outcome.added).toBe(0);
    expect(outcome.errors).toHaveLength(1);
    const [firstError] = outcome.errors;
    expect(firstError).toBeDefined();
    expect(firstError!.reason).toContain('QuotaExceeded');
  });

  it('rejects when loadProductIndex throws (applyImport-level error)', async () => {
    const driver = makeDriver({ loadProductIndex: vi.fn().mockRejectedValue(new Error('Network error')) });
    await expect(
      applyImport(driver, makeParsedImport([makeProduct('p1', 'Widget')]), []),
    ).rejects.toThrow('Network error');
  });
});
