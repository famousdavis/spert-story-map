// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * Needs Attention's unsized list names a size its size list no longer holds, quoted,
 * beside the rib and its backbone. A rib with no size, null or '', is listed as before.
 * The list's order and its cut at ten items are unchanged, so not every missing label
 * need appear here: each is also named by its rib's size picker or locked size.
 *
 * Through the real Insights page, over the project built in memory in
 * `fixtures/orphanSizes.ts` (never imported: see there).
 */

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { screen, cleanup } from '@testing-library/react';

vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ driver: null, mode: 'local', storageReady: true }) }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import InsightsView from '../pages/InsightsView';
import { mountHosted } from './fixtures/productHost';
import { orphanProduct } from './fixtures/orphanSizes';
import { makeProduct, makeRib } from './fixtures/progressIntegrity';
import { req } from './testHelpers';
import type { Product, Size } from '../types';

afterEach(cleanup);

beforeAll(() => {
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

/** The unsized section's lines, keyed by rib name. Ribs not listed are absent. */
function unsizedLines(product: Product): Record<string, string> {
  mountHosted(InsightsView, product);
  const title = screen.getByText(/unsized items$/);
  const lines = [...req(title.nextElementSibling, 'unsized list').querySelectorAll('li')].map(li => li.textContent ?? '');
  return Object.fromEntries(lines.map(line => [line.split(' ')[0], line]));
}

/** Only the four cases, so the list stays under its cut at ten. */
const four = (sizeMapping?: Product['sizeMapping']): Product => {
  const product = orphanProduct(sizeMapping);
  return {
    ...product,
    themes: product.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({ ...b, ribItems: b.ribItems.filter(r => ['orphan', 'valid', 'none', 'empty', 'spaced', 'zero'].includes(r.name)) })),
    })),
  };
};

describe('Needs Attention: unsized items', () => {
  it('names an orphan\'s missing label after the rib and its backbone', () => {
    expect(unsizedLines(four()).orphan).toBe('orphan (B): “XL” is not in your size list');
  });

  it('quotes a label with a stray space', () => {
    expect(unsizedLines(four()).spaced).toBe('spaced (B): “M ” is not in your size list');
  });

  it('lists a rib with no size, null or empty, as before, and does not list a valid or a 0-point size', () => {
    const lines = unsizedLines(four());
    expect({ none: lines.none, empty: lines.empty, valid: lines.valid, zero: lines.zero })
      .toStrictEqual({ none: 'none (B)', empty: 'empty (B)', valid: undefined, zero: undefined });
  });

  it('with an empty size list, names every sized rib\'s label, and still not a rib with no size', () => {
    const lines = unsizedLines(four([]));
    expect({ valid: lines.valid, none: lines.none }).toStrictEqual({ valid: 'valid (B): “L” is not in your size list', none: 'none (B)' });
  });
});

describe('Needs Attention: the unsized list\'s order and its cut', () => {
  it('keeps tree order and shows ten, so an orphan after the tenth item is under "...and N more"', () => {
    // r02 and r11 are on XL, which the list (L, M) does not hold; the rest have no size.
    const sizes: Record<string, Size> = { r02: 'XL', r11: 'XL' };
    const ids = Array.from({ length: 12 }, (_, i) => `r${String(i + 1).padStart(2, '0')}`);
    mountHosted(InsightsView, makeProduct(ids.map(id => makeRib(id, [{ releaseId: 'R1', percentage: 100 }], [], sizes[id] ?? null))));
    const title = screen.getByText(/unsized items$/);
    const lines = [...req(title.nextElementSibling, 'unsized list').querySelectorAll('li')].map(li => li.textContent);
    expect({ title: title.textContent, lines }).toStrictEqual({
      title: '12 unsized items',
      lines: [
        'r01 (B)', 'r02 (B): “XL” is not in your size list', 'r03 (B)', 'r04 (B)', 'r05 (B)',
        'r06 (B)', 'r07 (B)', 'r08 (B)', 'r09 (B)', 'r10 (B)', '...and 2 more',
      ],
    });
  });
});
