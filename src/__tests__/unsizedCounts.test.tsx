// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * Every count of unsized items, through the real page that shows it, for a rib left
 * on a size that is no longer in the project's size list (removed or renamed in
 * T-Shirt Size Mapping). Such a rib counts 0 points, so it counts as unsized.
 *
 * ⚠️ The orphan is built in memory or written straight into localStorage, never
 * imported: `validateProduct` clears a label its size list does not hold to `''`,
 * which counted as unsized before this change too, so an imported fixture passes
 * either way and proves nothing.
 */

import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import InsightsView from '../pages/InsightsView';
import StructureView from '../pages/StructureView';
import ProductList from '../pages/ProductList';
import { createLocalStorageDriver } from '../lib/storageDriver';
import { resetLocalCaution } from '../lib/localCaution';
import { mountHosted } from './fixtures/productHost';
import { advance, installMapTestEnv, mapProduct, mountMap, nameEl } from './fixtures/mapEntityHarness';
import { req } from './testHelpers';
import type { Product, RibItem, Size } from '../types';

function rib(id: string, size: Size): RibItem {
  return {
    id, name: `Rib ${id}`, description: '', order: 1, size, category: 'core', notes: '',
    releaseAllocations: [{ releaseId: 'R1', percentage: 100 }], progressHistory: [],
  };
}

/**
 * The size list holds L (8 points) and XS (0 points). Backbone A: r1 on M, which is no
 * longer in it. Backbone B: r2 on L, r3 with no size, and r4 on XS. So 2 unsized in Theme
 * One, 1 per backbone. r4 is sized at 0 points: it is what tells counting by the size row
 * from counting by points, which would make it 3.
 */
function orphanProduct(): Product {
  const base = mapProduct();
  return {
    ...base,
    sizeMapping: [{ label: 'L', points: 8 }, { label: 'XS', points: 0 }],
    themes: base.themes.map(t => t.id !== 't1' ? t : {
      ...t,
      backboneItems: t.backboneItems.map(b =>
        b.id === 'b1'
          ? { ...b, ribItems: [rib('r1', 'M')] }
          : { ...b, ribItems: [rib('r2', 'L'), rib('r3', null), rib('r4', 'XS')] }),
    }),
  };
}

const unsizedTexts = () => (document.body.textContent ?? '').match(/\d+ unsized\b/g);

describe('pages', () => {
  afterEach(cleanup);
  beforeAll(() => {
    // jsdom has neither, and useDarkMode and Recharts need both.
    window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  });

  it('Insights: Needs Attention counts and names the rib on a removed size', () => {
    mountHosted(InsightsView, orphanProduct());
    const title = screen.getByText(/unsized items$/);
    const names = [...req(title.nextElementSibling, 'unsized list').querySelectorAll('li')].map(li => li.textContent);
    expect({ title: title.textContent, names }).toStrictEqual({
      title: '2 unsized items',
      names: ['Rib r1 (Backbone A): “M” is not in your size list', 'Rib r3 (Backbone B)'],
    });
  });

  it('Structure: the header, the theme row and each backbone row count it', () => {
    mountHosted(StructureView, orphanProduct());
    // Document order: page header, Theme One, Backbone A, Backbone B. Theme Two has no ribs.
    expect(unsizedTexts()).toStrictEqual(['2 unsized', '2 unsized', '1 unsized', '1 unsized']);
  });
});

describe('the Map: theme and backbone panels', () => {
  installMapTestEnv();
  afterEach(cleanup);

  const unsizedRow = (key: string) => {
    fireEvent.click(nameEl(key));
    advance(200);
    return req(screen.getByText('Unsized').nextElementSibling, `Unsized row of ${key}`).textContent;
  };

  it('the theme panel counts it', () => {
    mountMap(orphanProduct());
    expect(unsizedRow('theme:t1')).toBe('2');
  });

  it('the backbone panel counts it', () => {
    mountMap(orphanProduct());
    expect(unsizedRow('backbone:t1:b1')).toBe('1');
  });
});

describe('the project list', () => {
  const driver = createLocalStorageDriver();
  beforeEach(() => {
    localStorage.clear();
    resetLocalCaution();
    storage.value = { driver, mode: 'local', storageReady: true };
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

  it("the project's tile counts it, read from storage by the real local driver", async () => {
    const product = orphanProduct();
    localStorage.setItem(`rp:local:product_${product.id}`, JSON.stringify(product));
    localStorage.setItem('rp:local:products_index', JSON.stringify([{ id: product.id, name: product.name }]));
    render(<MemoryRouter><ProductList /></MemoryRouter>);
    await screen.findByText(product.name);
    const tile = req(document.querySelector('[data-tile="true"]'), 'the tile');
    const lines = [...tile.querySelectorAll('p')].map(p => p.textContent);
    // 8 pts proves the stored list was read as written (only r2, on L, adds points).
    expect(lines[0]).toMatch(/^4 items · 8 pts · /);
    // r4 is sized at 0 points: a count by points would say 3.
    expect(lines[lines.length - 1]).toBe('⚠ 2 items unsized');
  });
});
