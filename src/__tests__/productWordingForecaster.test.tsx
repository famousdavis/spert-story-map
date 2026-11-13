// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
// v0.55.9 (BRIEF_product-rename-v3 D7, D11): Settings → Data's Forecaster sentences, through the real
// DataSection. Story Map's side says "product"; SPERT Forecaster's side says "project" or names it
// (R43). The header over a Send failure must not blame Forecaster, because it also heads Story Map's
// own refusals and a blocked pop-up, where Forecaster never opens.
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The real sender, except where a test gives it one answer: no page test can drive Forecaster's tab.
vi.mock('../lib/sendToForecaster', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/sendToForecaster')>();
  return { ...real, sendToForecaster: vi.fn(real.sendToForecaster) };
});

import DataSection from '../components/settings/DataSection';
import { sendToForecaster } from '../lib/sendToForecaster';
import { describeOutcome } from '../lib/crosslinkProtocol';
import { createLocalStorageDriver } from '../lib/storageDriver';
import { DEFAULT_SIZE_MAPPING } from '../lib/constants';
import type { Product, RibItem } from '../types';
import { req } from './testHelpers';

const HEADER = 'This product has not been imported into SPERT Forecaster:';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.mocked(sendToForecaster).mockClear(); });

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1', name: 'Alpha', description: '', schemaVersion: 2,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    sizeMapping: DEFAULT_SIZE_MAPPING.map(row => ({ ...row })), releases: [], sprints: [], themes: [],
    ...overrides,
  };
}

const rib = (id: string, releaseId: string, order: number): RibItem => ({
  id, name: `Rib ${order}`, description: '', order, size: 'S', category: 'core',
  releaseAllocations: [{ releaseId, percentage: 100 }], progressHistory: [],
});

/** `n` releases, each carrying one sized rib, so each is a Forecaster milestone. */
function withSizedReleases(n: number): Product {
  const ids = Array.from({ length: n }, (_, i) => `rel-${i}`);
  return product({
    releases: ids.map((id, i) => ({ id, name: `Release ${i + 1}`, order: i + 1, description: '', targetDate: null })),
    sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-14' }],
    themes: [{ id: 't1', name: 'Theme', order: 1, backboneItems: [
      { id: 'b1', name: 'Backbone', order: 1, ribItems: ids.map((id, i) => rib(`r${i}`, id, i + 1)) },
    ] }],
  });
}

function show(p: Product) {
  render(<DataSection product={p} driver={createLocalStorageDriver()} updateProduct={vi.fn()} />);
}

const send = () => userEvent.click(screen.getByRole('button', { name: 'Send to SPERT Forecaster' }));

describe('Send to SPERT Forecaster, in the product\'s words (D7)', () => {
  it('the button says it hands this product over (A39)', () => {
    show(product());
    expect(screen.getByRole('button', { name: 'Send to SPERT Forecaster' })).toHaveAttribute('title',
      'Opens SPERT Forecaster in a new tab and hands this product over once. Nothing stays connected afterwards.');
  });

  it('a blocked pop-up: the header says the product was not imported, without blaming Forecaster (A42)', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    show(product());
    await send();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(HEADER);
    expect(alert).toHaveTextContent('SPERT Forecaster could not be opened. Allow pop-ups for this site, then try again.');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('Forecaster refused it: the same header, over Forecaster\'s own reason (A42)', async () => {
    vi.mocked(sendToForecaster).mockResolvedValueOnce(describeOutcome({ kind: 'refused', nackReason: 'The file is too large.' }));
    show(product());
    await send();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(HEADER);
    expect(alert).toHaveTextContent('SPERT Forecaster did not accept the transfer: The file is too large.');
  });

  it('Forecaster opened it for review: there it is a project (A60, R43)', async () => {
    vi.mocked(sendToForecaster).mockResolvedValueOnce(describeOutcome({ kind: 'needs-review' }));
    show(product());
    await send();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(HEADER);
    expect(alert).toHaveTextContent('SPERT Forecaster opened it as a project for review. Switch to that tab to finish the import.');
  });
});

describe('Export for SPERT Forecaster refuses the product, in its words (D7)', () => {
  it('too many releases with points (A41, A67)', async () => {
    show(withSizedReleases(11));
    await userEvent.click(screen.getByRole('button', { name: 'Export for SPERT Forecaster' }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This product cannot be exported to SPERT Forecaster yet:');
    expect(alert).toHaveTextContent('This product has 11 releases carrying story points, and SPERT Forecaster accepts at most 10 milestones. Releases with no points are not counted.');
  });
});

describe('Download Template (D11)', () => {
  it('names its example "Example Product"', async () => {
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:template');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      show(product());
      await userEvent.click(screen.getByRole('button', { name: 'Download Template' }));
      const blob = req(createObjectURL.mock.calls[0]?.[0], 'template blob');
      expect((JSON.parse(await blob.text()) as Product).name).toBe('Example Product');
    } finally {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    }
  });
});
