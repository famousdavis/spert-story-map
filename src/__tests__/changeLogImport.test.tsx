// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
// R73 v0.56.2, R-2: an import never refuses a file for the length of its changelog. Both surfaces, on
// the real local driver: the Products page (add, replace, copy) and a product's Data section (replace).
// At 498 and 499, add and replace keep everything at v0.56.1 too: those rows are controls.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataSection from '../components/settings/DataSection';
import { applyImport, parseImportFile } from '../lib/import-utils';
import { createLocalStorageDriver } from '../lib/storageDriver';
import { CHANGELOG_MAX_ENTRIES } from '../lib/constants';
import type { ChangeLogEntry, ImportDecision, Product, StorageDriver } from '../types';
import { ALL_KEPT, T0, fileProduct, originKept } from './fixtures/changeLogFiles';

const CAP = CHANGELOG_MAX_ENTRIES;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** The real local driver, recording what each write was handed. */
function recordingDriver() {
  const driver = createLocalStorageDriver();
  const handed: Product[] = [];
  const create = driver.createProduct.bind(driver);
  const replace = driver.replaceProduct.bind(driver);
  driver.createProduct = async (p, o) => { handed.push(structuredClone(p)); return create(p, o); };
  driver.replaceProduct = async p => { handed.push(structuredClone(p)); return replace(p); };
  return { driver, handed };
}

const newImports = (log: readonly ChangeLogEntry[] | undefined) =>
  (log ?? []).filter(e => e.op === 'import' && !String(e.seq).startsWith('f-'));
const hasCopyEntry = (log: readonly ChangeLogEntry[] | undefined) =>
  (log ?? []).some(e => e.op === 'duplicate' && e.entity === 'product');

async function importOnProductsPage(driver: StorageDriver, count: number, action: 'add' | 'replace' | 'copy') {
  if (action !== 'add') await driver.createProduct(fileProduct('p1', 'Existing', 3, 'old'));
  const parsed = parseImportFile(JSON.stringify(fileProduct('p1', 'Existing', count)));
  if (!parsed.ok) return { refused: parsed.error };
  const decisions: ImportDecision[] = action === 'add' ? [] : [{
    importedProductId: 'p1', kind: 'id', originalExistingId: 'p1', action,
  }];
  const outcome = await applyImport(driver, { products: parsed.products, fileName: 'f.json' }, decisions);
  return { refused: null, outcome };
}

const COUNTS = [498, 499, 500, 501, 5_000];

describe('Products page import: add, replace and copy keep origin entries at every length', () => {
  for (const count of COUNTS) {
    for (const action of ['add', 'replace', 'copy'] as const) {
      const control = count < CAP && action !== 'copy' ? ' (control: v0.56.1 passes too)' : '';
      it(`${action} at ${count}${control}`, async () => {
        const { driver, handed } = recordingDriver();
        const { refused } = await importOnProductsPage(driver, count, action);
        expect(refused).toBeNull();
        const written = handed[handed.length - 1]!;
        const log = written._changeLog ?? [];
        expect(log.length).toBeLessThanOrEqual(action === 'copy' ? CAP + 3 : CAP + 1);
        expect(originKept(log)).toEqual(ALL_KEPT);
        expect(newImports(log).length).toBe(action === 'copy' ? 2 : 1);
        if (action === 'copy') expect(hasCopyEntry(log)).toBe(true);
        const stored = await driver.loadProduct(written.id);
        const storedLog = stored?._changeLog ?? [];
        expect(storedLog.length).toBeLessThanOrEqual(CAP);
        expect(originKept(storedLog)).toEqual(ALL_KEPT);
        expect(newImports(storedLog)).toEqual(newImports(log));
        if (action === 'copy') expect(hasCopyEntry(storedLog)).toBe(true);
        // the newest file entry is kept
        expect(storedLog.some(e => e.seq === log.filter(x => String(x.seq).startsWith('f-')).pop()?.seq)).toBe(true);
      });
    }
  }

  it('a bundle holding one long product imports whole', async () => {
    const { driver } = recordingDriver();
    const bundle = [fileProduct('a', 'Short', 10, 'a'), fileProduct('b', 'Long', 5_000, 'b')];
    const parsed = parseImportFile(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const outcome = await applyImport(driver, { products: parsed.products, fileName: 'all.json' }, []);
    expect(outcome.added).toBe(2);
    expect(outcome.errors).toEqual([]);
    const long = await driver.loadProduct('b');
    expect(long?._changeLog?.length).toBeLessThanOrEqual(CAP);
    expect(originKept(long?._changeLog, 'b')).toEqual(ALL_KEPT);
  });
});

describe('Data section import (replace) keeps origin entries at every length', () => {
  async function pickFile(content: string) {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File([content], 'f.json', { type: 'application/json' }));
  }

  for (const count of COUNTS) {
    const control = count < CAP ? ' (control: v0.56.1 passes too)' : '';
    it(`replace at ${count}${control}`, async () => {
      const { driver, handed } = recordingDriver();
      const current = fileProduct('p1', 'Current', 3, 'old');
      await driver.createProduct(current);
      handed.length = 0;
      const updateProduct = vi.fn();
      render(<DataSection product={current} driver={driver} updateProduct={updateProduct} />);
      await pickFile(JSON.stringify(fileProduct('other-id', 'From file', count)));
      await userEvent.click(await screen.findByRole('button', { name: /replace all data/i }));
      await waitFor(() => expect(updateProduct).toHaveBeenCalled());
      const log = handed[0]?._changeLog ?? [];
      expect(log.length).toBeLessThanOrEqual(CAP + 1);
      expect(originKept(log)).toEqual(ALL_KEPT);
      const stored = await driver.loadProduct('p1');
      expect(stored?.name).toBe('From file');
      expect(stored?._changeLog?.length).toBeLessThanOrEqual(CAP);
      expect(originKept(stored?._changeLog)).toEqual(ALL_KEPT);
      expect(newImports(stored?._changeLog)).toHaveLength(1);
    });
  }
});

describe('a file whose origin entries alone fill the cap (rule 4, O53)', () => {
  it('create and 499 product-level imports: the store keeps the import this browser adds', async () => {
    const { driver, handed } = recordingDriver();
    const file = fileProduct('p1', 'Imports', 0);
    file._changeLog = [
      { t: T0, op: 'create', entity: 'product', seq: 'f-create' },
      ...Array.from({ length: 499 }, (_, i): ChangeLogEntry =>
        ({ t: T0 + 1 + i, op: 'import', entity: 'product', source: 'file', seq: `f-imp${i}` })),
    ];
    const parsed = parseImportFile(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const outcome = await applyImport(driver, { products: parsed.products, fileName: 'f.json' }, []);
    expect(outcome.added).toBe(1);
    const log = handed[handed.length - 1]?._changeLog ?? [];
    expect(log).toHaveLength(CAP + 1);
    expect(newImports(log)).toHaveLength(1);
    const storedLog = (await driver.loadProduct('p1'))?._changeLog ?? [];
    expect(storedLog).toHaveLength(CAP);
    expect(storedLog[0]?.seq).toBe('f-create');
    expect(newImports(storedLog)).toEqual(newImports(log));
    expect(storedLog[CAP - 1]).toEqual(newImports(log)[0]);
  });
});
