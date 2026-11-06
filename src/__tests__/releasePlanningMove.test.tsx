// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { useCallback, useState, type ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import AllocationModal from '../components/releases/AllocationModal';
import ReleasePlanningView from '../pages/ReleasePlanningView';
import type { Product, ProductUpdater, ReleaseAllocation, RibItem } from '../types';
import { entry, makeProduct, makeRib, ribOf } from './fixtures/progressIntegrity';
import { req } from './testHelpers';

afterEach(cleanup);

const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });

// ─── The dialog's line ──────────────────────────────────────────────

function openDialog(rib: RibItem) {
  const onSave = vi.fn<(allocations: ReleaseAllocation[]) => void>();
  render(<AllocationModal rib={rib} product={makeProduct([rib])} onSave={onSave} onClose={() => {}} />);
  return onSave;
}

/** Modal has no dialog role, so find it as the smallest element holding its title and its Save button. */
function dialogRoot(): HTMLElement {
  let element: HTMLElement | null = screen.getByText('Save Allocation');
  while (element && !within(element).queryByText(/^Allocate:/)) element = element.parentElement;
  return req(element, 'dialog');
}

function replaceRow(remove: string, add: string) {
  const dialog = within(dialogRoot());
  // Remove first: the dialog fills a new row with 100 minus the total.
  const row = req(dialog.getByText(`Release ${remove}`).parentElement, 'row');
  fireEvent.click(within(row).getByText('Remove'));
  fireEvent.click(dialog.getByRole('button', { name: `Release ${add}` }));
}

describe('AllocationModal says what Save would do', () => {
  it('says progress moves when the rib brings positive records', () => {
    openDialog(makeRib('r', [on('X')], [entry('S1', 'X', 10)]));
    expect(screen.queryByText(/Progress moves/)).toBeNull();
    replaceRow('X', 'Y');
    expect(screen.getByText('Progress moves to Release Y.')).toBeTruthy();
  });

  it('says old progress counts again when the rib has nothing recorded', () => {
    openDialog(makeRib('r', [on('X')], [entry('S1', 'Y', 30)]));
    replaceRow('X', 'Y');
    expect(screen.getByText('Release Y has earlier progress, which will count again.')).toBeTruthy();
    expect(screen.queryByText(/Progress moves/)).toBeNull();
  });

  it('says neither when a typed 0 keeps the old records out', () => {
    openDialog(makeRib('r', [on('X')], [entry('S1', 'X', 0), entry('S1', 'Y', 30)]));
    replaceRow('X', 'Y');
    expect(screen.queryByText(/Progress moves/)).toBeNull();
    expect(screen.queryByText(/count again/)).toBeNull();
  });

  it('follows the draft: a row typed down to 0 is not a move', () => {
    openDialog(makeRib('r', [on('X')], [entry('S1', 'X', 10)]));
    replaceRow('X', 'Y');
    expect(screen.getByText('Progress moves to Release Y.')).toBeTruthy();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } });
    expect(screen.queryByText(/Progress moves/)).toBeNull();
  });

  it('says nothing when a release is only added', () => {
    openDialog(makeRib('r', [on('X', 60)], [entry('S1', 'X', 10)]));
    fireEvent.click(screen.getByRole('button', { name: 'Release Y' }));
    expect(screen.queryByText(/Progress moves/)).toBeNull();
  });
});

// ─── The real view, the real hook, the real dialog ──────────────────

function Board({ initial, onChange }: { initial: Product; onChange: (p: Product) => void }) {
  const [product, setProduct] = useState(initial);
  const updateProduct = useCallback((updater: ProductUpdater) => {
    setProduct(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      onChange(next);
      return next;
    });
  }, [onChange]);
  const context = { product, updateProduct, undo: () => {}, redo: () => {} };
  const outlet: ReactNode = <Outlet context={context} />;
  return (
    <MemoryRouter>
      <Routes>
        <Route element={outlet}>
          <Route index element={<ReleasePlanningView />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function renderBoard(ribs: RibItem[]) {
  const seen = { latest: makeProduct(ribs) };
  render(<Board initial={seen.latest} onChange={p => { seen.latest = p; }} />);
  return seen;
}

function card(name: string): HTMLElement {
  return req(screen.getAllByText(name)[0]?.closest<HTMLElement>('[draggable="true"]'), `card ${name}`);
}

function dragCardOnto(name: string, targetName: string) {
  fireEvent.dragStart(card(name), { dataTransfer: { effectAllowed: '' } });
  fireEvent.drop(card(targetName));
}

describe('Release Planning, through the board', () => {
  const moved = () => makeRib('moved', [on('X')], [entry('S1', 'X', 10, 'kept'), entry('S1', 'Y', 5)]);
  const anchor = () => makeRib('anchor', [on('Y')], []);

  it('a card dragged to another release carries the rib\'s progress', () => {
    const seen = renderBoard([moved(), anchor()]);
    dragCardOnto('moved', 'anchor');
    const rib = ribOf(seen.latest, 'moved');
    expect(rib.releaseAllocations.map(a => a.releaseId)).toEqual(['Y']);
    expect(rib.progressHistory).toEqual([entry('S1', 'Y', 10, 'kept'), entry('S1', 'X', 5)]);
    expect(seen.latest.releaseCardOrder?.Y).toEqual(['anchor', 'moved']);
  });

  it('a dialog Save that moves the rib carries its progress and keeps what was typed', () => {
    const seen = renderBoard([moved(), anchor()]);
    fireEvent.click(card('moved'));
    replaceRow('X', 'Z');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '70' } });
    fireEvent.click(screen.getByText('Save Allocation'));
    const rib = ribOf(seen.latest, 'moved');
    expect(rib.releaseAllocations).toEqual([{ releaseId: 'Z', percentage: 70, memo: '' }]);
    expect(rib.progressHistory).toEqual([entry('S1', 'Z', 10, 'kept'), entry('S1', 'Y', 5)]);
  });

  it('Unassign All keeps the records where they are', () => {
    const start = moved();
    const seen = renderBoard([start, anchor()]);
    fireEvent.click(card('moved'));
    fireEvent.click(screen.getByText('Unassign All'));
    const rib = ribOf(seen.latest, 'moved');
    expect(rib.releaseAllocations).toEqual([]);
    expect(rib.progressHistory).toBe(start.progressHistory);
  });
});
