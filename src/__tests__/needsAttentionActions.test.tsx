// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import InsightsView from '../pages/InsightsView';
import ProgressTrackingView from '../pages/ProgressTrackingView';
import { UNDO_HINT } from '../lib/constants';
import { isRibLocked } from '../lib/ribHelpers';
import type { Product, ProgressEntry, ReleaseAllocation } from '../types';
import { entry, makeProduct, makeRib, ribOf } from './fixtures/progressIntegrity';

/**
 * Needs Attention as a user meets it: the real page, the real writers, a host that
 * holds the product as `ProductLayout` does. `writes` counts `updateProduct` calls,
 * so "nothing happens until the confirm" and "one action, one call" are both seen.
 */

const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });

afterEach(cleanup);

beforeAll(() => {
  // jsdom has neither, and useDarkMode and Recharts need both.
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

let current: Product;
let writes = 0;

function Host({ initial }: { initial: Product }) {
  const [product, setProduct] = useState(initial);
  current = product;
  const updateProduct = (updater: unknown) => {
    writes++;
    setProduct(updater as (prev: Product) => Product);
  };
  const context = { product, updateProduct, undo: () => {}, redo: () => {} };
  return (
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="*" element={<InsightsView />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function mount(history: ProgressEntry[], allocations: ReleaseAllocation[] = [on('R1')]) {
  writes = 0;
  render(<Host initial={makeProduct([makeRib('r', allocations, history)])} />);
}

const bringButtons = () => screen.queryAllByRole('button', { name: /^Bring here: / });
const removeButtons = () => screen.queryAllByRole('button', { name: /^Remove: / });
const dialog = () => within(screen.getByRole('button', { name: 'Cancel' }).closest('.fixed') as HTMLElement);
const dialogText = () => (screen.getByRole('button', { name: 'Cancel' }).closest('.fixed') as HTMLElement).textContent ?? '';
const history = () => ribOf(current, 'r').progressHistory.map(e => [e.sprintId, e.releaseId, e.percentComplete]);
const text = () => document.body.textContent ?? '';

describe('which rows offer Bring here', () => {
  it('a rib on one release: both actions', () => {
    mount([entry('S1', 'R2', 30)]);
    expect(bringButtons()).toHaveLength(1);
    expect(removeButtons()).toHaveLength(1);
  });

  it.each<[string, ProgressEntry[], ReleaseAllocation[]]>([
    ['a parked rib', [entry('S1', 'R2', 30)], []],
    ['a split rib', [entry('S1', 'R2', 30)], [on('R1', 50), on('R3', 50)]],
    ['a 0% allocation', [entry('S1', 'R2', 30)], [on('R1', 0)]],
    ['an allocation to a release that is gone', [entry('S1', 'R2', 30)], [on('GONE')]],
    ['a duplicate on the current release', [entry('S1', 'R1', 10), entry('S1', 'R1', 30)], [on('R1')]],
  ])('%s: Remove only', (_, entries, allocations) => {
    mount(entries, allocations);
    expect(removeButtons()).toHaveLength(1);
    expect(bringButtons()).toHaveLength(0);
  });

  it('shows the actions on every row, past ten', () => {
    writes = 0;
    const ribs = Array.from({ length: 14 }, (_, i) => makeRib(`rib${i}`, [on('R2')], [entry('S1', 'R1', 10)]));
    render(<Host initial={makeProduct(ribs)} />);
    expect(bringButtons()).toHaveLength(14);
    expect(removeButtons()).toHaveLength(14);
  });
});

describe('a duplicate row', () => {
  it('says what it is, and does not show the figure of the entry that counts', () => {
    mount([entry('S1', 'R1', 10), entry('S1', 'R1', 30)]);
    expect(text()).toContain('r (B): Release R1, S1. A duplicate of an entry that counts.');
    expect(text()).not.toContain('Would count');
  });

  it('a row on a release the rib has left still shows what would count', () => {
    mount([entry('S1', 'R2', 30)]);
    expect(text()).toContain('r (B): Release R2, S1. Would count 30%.');
    expect(text()).not.toContain('A duplicate of an entry that counts.');
  });

  it('the section\'s sentence covers both kinds', () => {
    mount([entry('S1', 'R1', 10), entry('S1', 'R1', 30), entry('S1', 'R2', 5)]);
    expect(text()).toContain('Progress not counting: 2');
    expect(text()).toContain('Recorded, but in no total: on a release the rib has left, or a duplicate of an entry that counts.');
    expect(text()).not.toContain('no longer on');
  });

  it('Remove\'s confirm says the entry that counts stays, and it does', () => {
    mount([entry('S1', 'R1', 10), entry('S1', 'R1', 30)]);
    fireEvent.click(removeButtons()[0] as HTMLElement);
    expect(dialogText()).toContain('The entry that counts stays');
    fireEvent.click(dialog().getByRole('button', { name: 'Remove' }));
    expect(history()).toEqual([['S1', 'R1', 10]]);
    expect(isRibLocked(ribOf(current, 'r'), current.sprints)).toBe(true);
    expect(screen.queryByText('Needs Attention')).toBeNull();
  });
});

describe('Bring here is guarded by a confirm that states the result', () => {
  const REPORTED = [entry('S1', 'R3', 1), entry('S1', 'R2', 10)];

  it('writes nothing until it is confirmed', () => {
    mount(REPORTED, [on('R3')]);
    fireEvent.click(bringButtons()[0] as HTMLElement);
    expect(writes).toBe(0);
    expect(history()).toEqual([['S1', 'R3', 1], ['S1', 'R2', 10]]);
  });

  it('says what the rib will read, that past sprints change, and where undo is', () => {
    mount(REPORTED, [on('R3')]);
    fireEvent.click(bringButtons()[0] as HTMLElement);
    expect(dialogText()).toContain(
      `Release R2's progress moves to Release R3. The rib will read 11%. Past sprints are recalculated, so a Forecaster re-send can change. ${UNDO_HINT}`,
    );
  });

  it('adds what the release counts only when the allocation is smaller', () => {
    mount([entry('S1', 'R1', 40), entry('S1', 'R2', 30)], [on('R1', 60)]);
    fireEvent.click(bringButtons()[0] as HTMLElement);
    expect(dialogText()).toContain('The rib will read 70%. Release R1 counts 60%. Past sprints');
    cleanup();
    mount(REPORTED, [on('R3')]);
    fireEvent.click(bringButtons()[0] as HTMLElement);
    expect(dialogText()).not.toContain('counts 11%');
  });

  it('is not styled as a danger, and is labelled for what it does', () => {
    mount(REPORTED, [on('R3')]);
    fireEvent.click(bringButtons()[0] as HTMLElement);
    const confirm = dialog().getByRole('button', { name: 'Bring here' });
    expect(confirm.className).toContain('bg-blue-600');
    expect(confirm.className).not.toContain('bg-red-600');
  });

  it('one confirm is one write, and the row leaves the list', () => {
    mount(REPORTED, [on('R3')]);
    fireEvent.click(bringButtons()[0] as HTMLElement);
    fireEvent.click(dialog().getByRole('button', { name: 'Bring here' }));
    expect(writes).toBe(1);
    expect(history()).toEqual([['S1', 'R3', 11]]);
    expect(screen.queryByText('Needs Attention')).toBeNull();
  });

  it('Cancel writes nothing, and the row stays', () => {
    mount(REPORTED, [on('R3')]);
    fireEvent.click(bringButtons()[0] as HTMLElement);
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }));
    expect(writes).toBe(0);
    expect(history()).toEqual([['S1', 'R3', 1], ['S1', 'R2', 10]]);
    expect(bringButtons()).toHaveLength(1);
  });
});

describe('Remove is guarded by a confirm', () => {
  it('writes nothing until it is confirmed, and says notes stay and where undo is', () => {
    mount([entry('S1', 'R2', 30)]);
    fireEvent.click(removeButtons()[0] as HTMLElement);
    expect(writes).toBe(0);
    expect(dialogText()).toContain(`Remove the progress on "r" recorded for Release R2 (S1)? Notes stay. ${UNDO_HINT}`);
  });

  it('is styled as a danger', () => {
    mount([entry('S1', 'R2', 30)]);
    fireEvent.click(removeButtons()[0] as HTMLElement);
    expect(dialog().getByRole('button', { name: 'Remove' }).className).toContain('bg-red-600');
  });

  it('one confirm is one write, and it reaches a parked rib', () => {
    mount([entry('S1', 'R2', 30)], []);
    fireEvent.click(removeButtons()[0] as HTMLElement);
    fireEvent.click(dialog().getByRole('button', { name: 'Remove' }));
    expect(writes).toBe(1);
    expect(history()).toEqual([]);
    expect(text()).not.toContain('Progress not counting');
  });

  it('Cancel writes nothing', () => {
    mount([entry('S1', 'R2', 30)]);
    fireEvent.click(removeButtons()[0] as HTMLElement);
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }));
    expect(writes).toBe(0);
    expect(history()).toEqual([['S1', 'R2', 30]]);
  });
});

describe('Clear progress, from the Progress row', () => {
  function ProgressHost({ initial }: { initial: Product }) {
    const [product, setProduct] = useState(initial);
    current = product;
    const updateProduct = (updater: unknown) => {
      writes++;
      setProduct(updater as (prev: Product) => Product);
    };
    const context = { product, updateProduct, undo: () => {}, redo: () => {} };
    return (
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route path="*" element={<ProgressTrackingView />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  function openRow(entries: ProgressEntry[], allocations: ReleaseAllocation[] = [on('R1')]) {
    writes = 0;
    render(<ProgressHost initial={makeProduct([makeRib('r', allocations, entries)])} />);
    fireEvent.click(document.querySelector('tbody tr td') as HTMLElement);
  }

  const clearButton = () => screen.queryByRole('button', { name: 'Clear progress' });

  it('is behind a confirm that says it covers everything, that notes stay, and where undo is', () => {
    openRow([entry('S1', 'R1', 30)]);
    fireEvent.click(clearButton() as HTMLElement);
    expect(writes).toBe(0);
    expect(dialogText()).toContain(
      `Clear all progress on "r"? This covers every release and every sprint, including records that are not counting. Notes stay, and the rib unlocks. ${UNDO_HINT}`,
    );
  });

  it('one confirm is one write: inert records go, a note stays, and the rib unlocks', () => {
    openRow([entry('S1', 'R1', 30), entry('S1', 'R2', 40, 'note')]);
    expect(isRibLocked(ribOf(current, 'r'), current.sprints)).toBe(true);
    fireEvent.click(clearButton() as HTMLElement);
    fireEvent.click(dialog().getByRole('button', { name: 'Clear progress' }));
    expect(writes).toBe(1);
    expect(ribOf(current, 'r').progressHistory).toEqual([expect.objectContaining({ sprintId: 'S1', releaseId: 'R2', percentComplete: null, comment: 'note' })]);
    expect(isRibLocked(ribOf(current, 'r'), current.sprints)).toBe(false);
  });

  it('Cancel writes nothing', () => {
    openRow([entry('S1', 'R1', 30)]);
    fireEvent.click(clearButton() as HTMLElement);
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }));
    expect(writes).toBe(0);
    expect(history()).toEqual([['S1', 'R1', 30]]);
  });

  it('is on a read-only row too', () => {
    writes = 0;
    render(<ProgressHost initial={makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R1', 30)])])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Backbone' }));
    fireEvent.click(document.querySelector('tbody tr td') as HTMLElement);
    expect(clearButton()).toBeTruthy();
  });

  it('is not offered with nothing to clear', () => {
    openRow([entry('S1', 'R1', null, 'only a note')]);
    expect(clearButton()).toBeNull();
  });
});
