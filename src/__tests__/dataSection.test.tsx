// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataSection from '../components/settings/DataSection';
import { checkSprintFinishDates } from '../lib/exportForForecaster';
import type { Product, StorageDriver } from '../types';
import { req } from './testHelpers';

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => `uuid-${++uuidCounter}`,
});

beforeEach(() => { uuidCounter = 0; });
afterEach(() => { cleanup(); });

function makeProduct(id: string, name: string, overrides: Partial<Product> = {}): Product {
  return {
    id, name, description: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    schemaVersion: 2, sizeMapping: [], releases: [], sprints: [], themes: [],
    _originRef: 'original-workspace-ref',
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
    savePreferences: vi.fn().mockResolvedValue(undefined),
    getWorkspaceId: vi.fn().mockReturnValue('ws-1'),
    onProductChange: vi.fn().mockReturnValue(() => {}),
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

function renderDataSection(product: Product, driver: StorageDriver) {
  const updateProduct = vi.fn();
  render(<DataSection product={product} driver={driver} updateProduct={updateProduct} />);
  return { updateProduct };
}

// Helper: trigger the hidden file input directly. The "Import Project from JSON"
// button calls fileInputRef.current?.click(), which opens the OS picker (no-op
// in jsdom). Uploading directly to the input fires handleFileChange without it.
async function pickFile(content: string, fileName = 'test.json') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([content], fileName, { type: 'application/json' });
  await userEvent.upload(input, file);
}

describe('DataSection — bundle rejection', () => {
  it('shows homepage-guidance error when a bundled export is picked', async () => {
    const product = makeProduct('p1', 'My Project');
    renderDataSection(product, makeDriver());

    const bundle = JSON.stringify([
      { ...product, schemaVersion: 2 },
      { ...makeProduct('p2', 'Other'), schemaVersion: 2 },
    ]);
    await pickFile(bundle);

    await waitFor(() => {
      expect(screen.getByText(/multiple projects/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/project list homepage/i)).toBeInTheDocument();
  });
});

describe('DataSection — single product replace', () => {
  it('preserves createdAt and _originRef from the current product in the updateProduct call', async () => {
    const existing = makeProduct('p1', 'My Project', {
      createdAt: '2024-01-01T00:00:00.000Z',
      _originRef: 'workspace-abc',
    });
    const driver = makeDriver();
    const { updateProduct } = renderDataSection(existing, driver);

    const imported = makeProduct('p1', 'My Project', {
      createdAt: '2099-01-01T00:00:00.000Z',
      _originRef: 'attacker-workspace',
      schemaVersion: 2,
    });
    await pickFile(JSON.stringify(imported));

    const confirmBtn = await screen.findByRole('button', { name: /replace all data/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => expect(driver.replaceProduct).toHaveBeenCalled());
    await waitFor(() => expect(updateProduct).toHaveBeenCalled());

    const calls = (updateProduct as ReturnType<typeof vi.fn>).mock.calls;
    const updatedWith = calls[0]?.[0] as Product | undefined;
    expect(updatedWith).toBeDefined();
    expect(updatedWith!.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(updatedWith!._originRef).toBe('workspace-abc');
  });

  it('shows error and closes dialog when replaceProduct throws', async () => {
    const product = makeProduct('p1', 'My Project');
    const driver = makeDriver({
      replaceProduct: vi.fn().mockRejectedValue(new Error('Storage full')),
    });
    renderDataSection(product, driver);

    await pickFile(JSON.stringify({ ...product, schemaVersion: 2 }));

    const confirmBtn = await screen.findByRole('button', { name: /replace all data/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/Import failed/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /replace all data/i })).not.toBeInTheDocument();
    });
  });
});

describe('DataSection — Forecaster buttons refuse a sprint with no finish date', () => {
  const undated = () => makeProduct('p1', 'My Project', {
    sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: null }],
  });

  it('Export for SPERT Forecaster shows the sprint in the cannot-export banner', async () => {
    renderDataSection(undated(), makeDriver());
    await userEvent.click(screen.getByRole('button', { name: 'Export for SPERT Forecaster' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This project cannot be exported to SPERT Forecaster yet:');
    expect(alert).toHaveTextContent('"Sprint 1" has no finish date');
  });

  it('Send to SPERT Forecaster shows the sprint and never opens Forecaster', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    try {
      renderDataSection(undated(), makeDriver());
      await userEvent.click(screen.getByRole('button', { name: 'Send to SPERT Forecaster' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('The project was not imported:');
      expect(alert).toHaveTextContent('"Sprint 1" has no finish date');
      expect(open).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
    }
  });
});

describe('DataSection — Download Template', () => {
  it('gives the example sprint a finish date, so the template can go to Forecaster', async () => {
    // jsdom has no object URLs. Swapped in and put back by hand, not with `vi.stubGlobal`,
    // whose `unstubAllGlobals` would also undo this file's `crypto` stub.
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:template');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      renderDataSection(makeProduct('p1', 'My Project'), makeDriver());
      await userEvent.click(screen.getByRole('button', { name: 'Download Template' }));

      expect(click).toHaveBeenCalledTimes(1);
      const blob = req(createObjectURL.mock.calls[0]?.[0], 'template blob');
      const template = JSON.parse(await blob.text()) as Product;
      expect(template.sprints[0]?.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(checkSprintFinishDates(template)).toEqual([]);
    } finally {
      click.mockRestore();
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    }
  });
});
