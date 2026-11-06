// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import ReleasePlanningView from '../pages/ReleasePlanningView';
import SettingsView from '../pages/SettingsView';
import StoryMapView from '../pages/StoryMapView';
import { RELEASE_RECORDS_LINE } from '../lib/settingsMutations';
import type { Product, ProgressEntry } from '../types';
import { entry, makeProduct, makeRib, ribOf } from './fixtures/progressIntegrity';

/**
 * Every surface that deletes a release, as a user reaches it. `deleteReleaseFromProduct`
 * drops comments as well, unlike pattern #6, so a confirm that stays quiet about records
 * is the only warning there is not.
 */

vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ driver: null, mode: 'local', storageReady: true }) }));
vi.mock('../components/settings/SharingSection', () => ({ default: () => null }));

afterEach(cleanup);

beforeAll(() => {
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

let current: Product;

function Host({ View, initial }: { View: () => React.ReactElement; initial: Product }) {
  const [product, setProduct] = useState(initial);
  current = product;
  const context = {
    product,
    updateProduct: (updater: unknown) => setProduct(updater as (prev: Product) => Product),
    undo: () => {},
    redo: () => {},
  };
  return (
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="*" element={<View />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const mount = (View: () => React.ReactElement, product: Product) => render(<Host View={View} initial={product} />);
const on = (releaseId: string, percentage = 100) => ({ releaseId, percentage });

/** One rib on R1, holding `history`. R2 is the release under test unless a test says otherwise. */
const holding = (history: ProgressEntry[]) => makeProduct([makeRib('r', [on('R1')], history)]);
const releaseIds = () => current.releases.map(r => r.id);
const dialog = () => (screen.queryByRole('button', { name: 'Cancel' })?.closest('.fixed') ?? null) as HTMLElement | null;
const dialogText = () => dialog()?.textContent ?? '';
const confirm = (label: string) => fireEvent.click(within(dialog() as HTMLElement).getByRole('button', { name: label }));

describe('Settings', () => {
  const deleteR2 = () => {
    const row = screen.getByDisplayValue('Release R2').closest('.bg-gray-50') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
  };

  it('deletes a release holding nothing without asking', () => {
    mount(SettingsView, holding([]));
    deleteR2();
    expect(dialog()).toBeNull();
    expect(releaseIds()).not.toContain('R2');
  });

  it.each<[string, ProgressEntry[]]>([
    ['an inert record', [entry('S1', 'R2', 30)]],
    ['a typed 0', [entry('S1', 'R2', 0)]],
    ['only a comment', [entry('S1', 'R2', null, 'a note')]],
    ['a record for an unknown sprint', [entry('GONE', 'R2', 30)]],
  ])('asks before deleting a release holding %s, and says records go', (_, history) => {
    mount(SettingsView, holding(history));
    deleteR2();
    expect(dialogText()).toContain(`${RELEASE_RECORDS_LINE} Continue?`);
    expect(releaseIds()).toContain('R2');
    confirm('Delete');
    expect(releaseIds()).not.toContain('R2');
    expect(ribOf(current, 'r').progressHistory).toEqual([]);
  });

  it('does not ask for an empty null entry, which holds nothing', () => {
    mount(SettingsView, holding([entry('S1', 'R2', null)]));
    deleteR2();
    expect(dialog()).toBeNull();
  });

  it('with allocations and no records, asks without the line', () => {
    mount(SettingsView, makeProduct([makeRib('r', [on('R2')], [])]));
    deleteR2();
    expect(dialogText()).toContain('This release has rib items allocated to it. Deleting it will remove those allocations. Continue?');
    expect(dialogText()).not.toContain(RELEASE_RECORDS_LINE);
  });

  it('with allocations and records, says both', () => {
    mount(SettingsView, makeProduct([makeRib('r', [on('R2')], [entry('S1', 'R2', 30)])]));
    deleteR2();
    expect(dialogText()).toContain(`Deleting it will remove those allocations. ${RELEASE_RECORDS_LINE} Continue?`);
  });
});

describe('Map', () => {
  /** The lane's left ×: it follows the label block, whose chevron names the release. */
  const laneDelete = (releaseName: string) => {
    let el = screen.getAllByRole('button', { name: `Collapse ${releaseName}` })[0]?.parentElement as Element | null;
    while (el && el.textContent !== '×') el = el.nextElementSibling;
    return el as HTMLElement;
  };
  const viaLane = async () => { fireEvent.click(laneDelete('Release R2')); };
  /** A label click waits 200ms, in case it is a double click, then opens the panel. */
  const viaPanel = async () => {
    fireEvent.click(document.querySelector('[data-release-id="R2"]') as HTMLElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Release' }));
  };

  it.each([['the lane', viaLane], ['the detail panel', viaPanel]])('from %s: says records go when the release holds them', async (_, open) => {
    mount(StoryMapView, holding([entry('S1', 'R2', null, 'a note')]));
    await open();
    expect(dialogText()).toContain(`Delete "Release R2"? ${RELEASE_RECORDS_LINE}`);
    expect(releaseIds()).toContain('R2');
    confirm('Delete');
    expect(releaseIds()).not.toContain('R2');
    expect(ribOf(current, 'r').progressHistory).toEqual([]);
  });

  it('has lost its unconditional wording: a release holding nothing has no line', async () => {
    mount(StoryMapView, holding([]));
    await viaLane();
    expect(dialogText()).toContain('Delete "Release R2"?');
    expect(dialogText()).not.toContain(RELEASE_RECORDS_LINE);
    expect(dialogText()).not.toContain('progress history');
  });

  it('keeps × shut on a release with allocations', () => {
    mount(StoryMapView, holding([]));
    fireEvent.click(laneDelete('Release R1'));
    expect(dialog()).toBeNull();
  });
});

describe('Release Planning', () => {
  /** The first Delete inside a column, found through its heading. */
  const deleteR2 = () => {
    const heading = screen.getByText('Release R2');
    const column = heading.parentElement as HTMLElement;
    fireEvent.click(within(column).getByRole('button', { name: 'Delete' }));
  };

  it('says records go when the release holds them', () => {
    mount(ReleasePlanningView, holding([entry('S1', 'R2', 30)]));
    deleteR2();
    expect(dialogText()).toContain(`This release will be permanently removed. ${RELEASE_RECORDS_LINE}`);
  });

  it('adds nothing when it holds none', () => {
    mount(ReleasePlanningView, holding([]));
    deleteR2();
    expect(dialogText()).toContain('This release will be permanently removed.');
    expect(dialogText()).not.toContain(RELEASE_RECORDS_LINE);
  });

  describe('a filter hiding a release\'s ribs', () => {
    const nonCoreOnR2 = () => makeProduct([{ ...makeRib('r', [on('R2')], [entry('S1', 'R2', 30)]), category: 'non-core' }]);

    it('Delete stays shut with every rib showing', () => {
      mount(ReleasePlanningView, nonCoreOnR2());
      deleteR2();
      expect(dialog()).toBeNull();
    });

    it('Delete stays shut when the filter hides the allocated rib', () => {
      mount(ReleasePlanningView, nonCoreOnR2());
      fireEvent.click(screen.getByRole('button', { name: 'Core' }));
      expect(screen.queryByText('r')).toBeNull();
      deleteR2();
      expect(dialog()).toBeNull();
      expect(releaseIds()).toContain('R2');
      expect(ribOf(current, 'r').releaseAllocations).toEqual([on('R2')]);
    });

    it('a release with nothing on it still deletes, whatever the filter', () => {
      mount(ReleasePlanningView, holding([]));
      fireEvent.click(screen.getByRole('button', { name: 'Core' }));
      deleteR2();
      confirm('Delete');
      expect(releaseIds()).not.toContain('R2');
    });
  });
});
