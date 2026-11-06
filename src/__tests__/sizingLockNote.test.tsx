// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { computeSizingLayout } from '../components/sizing/useSizingLayout';
import { sizeLockNote } from '../lib/ribHelpers';
import SizingView from '../pages/SizingView';
import type { ProgressEntry, ReleaseAllocation } from '../types';
import { entry, makeProduct, makeRib } from './fixtures/progressIntegrity';

/**
 * ⚠️ A rib locked by an earlier sprint can read 0%, and the card's badge then says
 * "0% complete" about a card that will not move. Naming the sprint is what explains it.
 */

const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });

afterEach(cleanup);

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

const cellFor = (history: ProgressEntry[], allocations: ReleaseAllocation[] = [on('R1')]) => {
  const layout = computeSizingLayout(makeProduct([makeRib('r', allocations, history)]));
  return layout.cells.find(cell => cell.id === 'r');
};

describe('the cell carries the locking sprint', () => {
  it('names the latest sprint above 0 when the latest reads 0', () => {
    const cell = cellFor([entry('S1', 'R1', 10), entry('S2', 'R1', 20), entry('S3', 'R1', 0)]);
    expect(cell?.percentComplete).toBe(0);
    expect(cell?.locked).toBe(true);
    expect(cell?.lockedSprintName).toBe('S2');
  });

  it('names nothing on a rib that is not locked', () => {
    const cell = cellFor([entry('S1', 'R2', 30)]);
    expect(cell?.locked).toBe(false);
    expect(cell?.lockedSprintName).toBeNull();
  });

  it('does not throw on a hand-edited product with no sprint list', () => {
    const product = makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R1', 10)])]);
    delete (product as Partial<typeof product>).sprints;
    expect(computeSizingLayout(product).cells.find(cell => cell.id === 'r')?.lockedSprintName).toBeNull();
  });

  it('ignores a later record on a release the rib left', () => {
    expect(cellFor([entry('S1', 'R1', 10), entry('S3', 'R2', 90)])?.lockedSprintName).toBe('S1');
  });
});

describe('sizeLockNote', () => {
  it('names the sprint', () => {
    expect(sizeLockNote('Sprint 4')).toBe('Size locked: progress recorded in Sprint 4');
  });

  it('still reads as a sentence with no sprint to name', () => {
    expect(sizeLockNote(null)).toBe('Size locked: progress recorded');
  });
});

describe('what a user sees', () => {
  function mount(history: ProgressEntry[]) {
    const product = makeProduct([makeRib('r', [on('R1')], history)]);
    const context = { product, updateProduct: () => {}, undo: () => {}, redo: () => {} };
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route path="*" element={<SizingView />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  const LOCKED = [entry('S1', 'R1', 10), entry('S2', 'R1', 20), entry('S3', 'R1', 0)];

  it('the badge on a locked card names it', () => {
    mount(LOCKED);
    const badge = document.querySelector('[data-rib-id="r"] span[title$="complete. Size locked: progress recorded in S2"]');
    expect(badge?.getAttribute('title')).toBe('0% complete. Size locked: progress recorded in S2');
  });

  it('the edit dialog\'s lock note names it', () => {
    mount(LOCKED);
    fireEvent.click(document.querySelector('[data-rib-id="r"]') as HTMLElement);
    expect(screen.getByTitle('Size locked: progress recorded in S2')).toBeTruthy();
  });

  it('a card that is not locked has neither', () => {
    mount([]);
    expect(document.querySelector('[data-rib-id="r"] span[title*="Size locked"]')).toBeNull();
  });
});
