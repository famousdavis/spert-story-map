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

describe('AllocationModal warns before progress stops counting', () => {
  const STOPS = (name: string) => `${name} has progress recorded. It will stop counting (see Needs Attention).`;

  const removeRow = (name: string) => {
    const row = req(within(dialogRoot()).getByText(name).parentElement, 'row');
    fireEvent.click(within(row).getByText('Remove'));
  };

  it('names a removed release holding a record, before Save', () => {
    openDialog(makeRib('r', [on('X', 50), on('Y', 50)], [entry('S1', 'X', 20)]));
    expect(screen.getAllByText(STOPS('Release X'))).toHaveLength(1);
    removeRow('Release X');
    const line = screen.getByText(STOPS('Release X'));
    expect(line.closest('button')).toBeNull();
    // The Save list carries it now, not the line beside Unassign All.
    expect(line.parentElement?.textContent).toContain('Total');
  });

  it('says a removed release holding only a comment has notes, not progress', () => {
    openDialog(makeRib('r', [on('X', 50), on('Y', 50)], [entry('S1', 'X', null, 'note')]));
    removeRow('Release X');
    expect(screen.getByText('Release X has notes, which stay on the rib.')).toBeTruthy();
    expect(screen.queryByText(STOPS('Release X'))).toBeNull();
  });

  it('says the same beside Unassign All', () => {
    openDialog(makeRib('r', [on('X')], [entry('S1', 'X', null, 'note')]));
    const line = screen.getByText('Release X has notes, which stay on the rib.');
    expect(req(line.parentElement?.parentElement, 'slot').textContent).toContain('Unassign All');
    expect(screen.queryByText(STOPS('Release X'))).toBeNull();
  });

  it('warns beside Unassign All whenever the rib has recorded progress, because it commits at once', () => {
    openDialog(makeRib('r', [on('X')], [entry('S1', 'X', 20)]));
    const line = screen.getByText(STOPS('Release X'));
    expect(req(line.parentElement?.parentElement, 'slot').textContent).toContain('Unassign All');
  });

  it('says nothing for a rib with no recorded progress', () => {
    openDialog(makeRib('r', [on('X', 50), on('Y', 50)], []));
    removeRow('Release X');
    expect(screen.queryByText(/will stop counting/)).toBeNull();
    expect(screen.queryByText(/will count\./)).toBeNull();
  });

  it('names a kept release whose records exceed its new percentage', () => {
    openDialog(makeRib('r', [on('X')], [entry('S1', 'X', 80)]));
    expect(screen.queryByText(/will count\./)).toBeNull();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } });
    expect(screen.getByText('Release X has 80% recorded; only 50% will count.')).toBeTruthy();
  });

  it('names a move\'s target when the carried records exceed its percentage', () => {
    openDialog(makeRib('r', [on('X')], [entry('S1', 'X', 80)]));
    replaceRow('X', 'Y');
    expect(screen.getByText('Progress moves to Release Y.')).toBeTruthy();
    expect(screen.queryByText(/will count\./)).toBeNull();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } });
    expect(screen.getByText('Release Y has 80% recorded; only 50% will count.')).toBeTruthy();
  });

  it('does not say a moved release stops counting', () => {
    openDialog(makeRib('r', [on('X')], [entry('S1', 'X', 80)]));
    replaceRow('X', 'Y');
    const saveLine = screen.getAllByText(STOPS('Release X'));
    // Only the Unassign All line, which is about the rib as stored.
    expect(saveLine).toHaveLength(1);
    expect(req(saveLine[0]?.parentElement?.parentElement, 'slot').textContent).toContain('Unassign All');
  });
});

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
