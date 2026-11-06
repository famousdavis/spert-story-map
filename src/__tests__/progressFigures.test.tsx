// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import InsightsView from '../pages/InsightsView';
import ProgressTrackingView from '../pages/ProgressTrackingView';
import { getProjectTotals, getProgressOverTime } from '../lib/calculations';
import type { Product, ReleaseAllocation, RibItem } from '../types';
import { entry, makeProduct, makeRib, walkthrough } from './fixtures/progressIntegrity';

/**
 * The figures as a user reads them. ⚠️ Measured in the pre-flight: "the header
 * bypasses the rule", "a sprint-blind group header" and "a sprint-blind Done" are
 * each caught ONLY here, because the library functions are right and the view just
 * stops calling them correctly. Do not move these down to the helpers.
 */

const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });

afterEach(cleanup);

beforeAll(() => {
  // jsdom has neither, and useDarkMode and Recharts need both.
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

function mount(View: () => React.ReactElement, product: Product) {
  const context = { product, updateProduct: () => {}, undo: () => {}, redo: () => {} };
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="*" element={<View />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const text = () => document.body.textContent ?? '';

function selectSprint(id: string) {
  fireEvent.change(document.querySelector('select[name="selectedSprint"]') as HTMLSelectElement, { target: { value: id } });
}

/** A stat on the summary card: its value is the sibling of its label. */
function stat(label: string): string {
  return screen.getAllByText(label).map(el => el.parentElement?.textContent ?? '').join('|');
}

/** Each table row's "done/allocated" points cell, as numbers. */
function rowPoints(): [number, number][] {
  return [...document.querySelectorAll('tbody tr')]
    .map(tr => tr.querySelectorAll('td')[2]?.textContent ?? '')
    .filter(cell => cell.includes('/'))
    .map(cell => cell.split('/').map(Number) as [number, number]);
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('Progress tab, §9 row 8 (U > 0, O > 0, V > 0)', () => {
  it('(d) as of S2: the header reads the rule, on all rib points', () => {
    mount(ProgressTrackingView, walkthrough(8));
    expect(stat('Completed')).toContain('34 / 120 pts');
    expect(stat('Remaining')).toContain('86 pts');
    expect(stat('Sprint pts')).toContain('+24');
    expect(stat('Items updated')).toContain('3 / 3');
  });

  it('(d) as of S1: the header follows the selected sprint', () => {
    mount(ProgressTrackingView, walkthrough(8));
    selectSprint('S1');
    expect(stat('Completed')).toContain('10 / 120 pts');
    expect(stat('Remaining')).toContain('110 pts');
    expect(stat('Items updated')).toContain('2 / 3');
  });

  it('group headers show allocated points and follow the selected sprint', () => {
    mount(ProgressTrackingView, walkthrough(8));
    expect(text()).toContain('2 items · 40 pts · 55% done');
    expect(text()).toContain('2 items · 46 pts · 35% done');
    selectSprint('S1');
    expect(text()).toContain('2 items · 40 pts · 15% done');
    expect(text()).toContain('2 items · 46 pts · 9% done');
  });

  it('Done and points follow the selected sprint', () => {
    mount(ProgressTrackingView, walkthrough(8));
    const row = (name: string) => within(screen.getAllByText(name)[0]?.closest('tr') as HTMLElement);
    expect(row('b').getByText('10%', { selector: 'span.font-medium' })).toBeTruthy();
    expect(rowPoints()).toEqual([[4, 20], [18, 20], [10, 40], [6, 6]]);
    selectSprint('S1');
    expect(rowPoints()).toEqual([[0, 20], [6, 20], [4, 40], [0, 6]]);
    expect(row('b').getByText('0%', { selector: 'span.font-medium' })).toBeTruthy();
  });

  it('the footer shows what the groups leave out, and −V done', () => {
    mount(ProgressTrackingView, walkthrough(8));
    expect(screen.getByText('Unallocated').parentElement?.textContent).toBe('Unallocated40 pts');
    expect(screen.getByText('Over-allocated').parentElement?.textContent).toBe('Over-allocated-6 pts · -4 done');
    expect(screen.queryByText('Total', { selector: 'span.font-semibold' })).toBeNull();
    selectSprint('S1');
    expect(screen.getByText('Over-allocated').parentElement?.textContent).toBe('Over-allocated-6 pts · 0 done');
  });

  it.each(['S1', 'S2'])('(d) as of %s: Σ rows, the footer and the header add up', sprintId => {
    const product = walkthrough(8);
    mount(ProgressTrackingView, product);
    selectSprint(sprintId);
    const t = getProjectTotals(product, sprintId);
    const rows = rowPoints();
    expect(sum(rows.map(r => r[1])) + t.unallocated.total - t.overAllocated.total).toBeCloseTo(t.total);
    expect(sum(rows.map(r => r[0])) - t.overCount).toBeCloseTo(t.completed);
  });
});

describe('Progress tab, other shapes', () => {
  it('a row 4 project: U > 0 and nothing over: the footer has one line', () => {
    mount(ProgressTrackingView, walkthrough(4));
    expect(screen.getByText('Unallocated').parentElement?.textContent).toBe('Unallocated40 pts');
    expect(screen.queryByText('Over-allocated')).toBeNull();
  });

  it('backbone grouping: whole ribs, weighted by points, and an Unassigned line instead', () => {
    mount(ProgressTrackingView, walkthrough(8));
    fireEvent.click(screen.getByRole('button', { name: 'Backbone' }));
    // a 25% of 40, b 10% of 40, c 100% of 20, over 100 points.
    expect(text()).toContain('3 items · 100 pts · 34% done');
    expect(screen.getByText('Unassigned ribs').parentElement?.textContent).toBe('Unassigned ribs1 items · 20 pts');
    expect(screen.queryByText('Unallocated')).toBeNull();
    expect(rowPoints()).toEqual([[10, 40], [4, 40], [20, 20]]);
    selectSprint('S1');
    expect(text()).toContain('3 items · 100 pts · 10% done');
    expect(rowPoints()).toEqual([[4, 40], [0, 40], [6, 20]]);
  });

  it('theme grouping uses the same footer', () => {
    mount(ProgressTrackingView, walkthrough(8));
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    expect(screen.getByText('Unassigned ribs')).toBeTruthy();
  });

  it('no footer when the groups already add up', () => {
    mount(ProgressTrackingView, makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R1', 10)])]));
    expect(screen.queryByText('Unallocated')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Backbone' }));
    expect(screen.queryByText('Unassigned ribs')).toBeNull();
  });

  it('an unknown release is its own group, and adds up without a second line', () => {
    mount(ProgressTrackingView, makeProduct([makeRib('r', [on('GONE')], [entry('S1', 'GONE', 30)]), makeRib('s', [on('R1')], [], 'M')]));
    expect(screen.getByText('Unknown release')).toBeTruthy();
    expect(screen.getAllByText('Unknown release')).toHaveLength(1);
    expect(sum(rowPoints().map(r => r[1]))).toBe(60);
  });

  it('a duplicate allocation row draws one row', () => {
    mount(ProgressTrackingView, makeProduct([makeRib('r', [on('R1', 50), on('R1', 50)], [entry('S1', 'R1', 40)])]));
    expect(rowPoints()).toEqual([[16, 20]]);
  });

  it('the default sprint is the last in sprint order, not array order', () => {
    const product = walkthrough(8);
    mount(ProgressTrackingView, { ...product, sprints: [...product.sprints].reverse() });
    expect((document.querySelector('select[name="selectedSprint"]') as HTMLSelectElement).value).toBe('S2');
  });

  it('Δ walks back over a skipped sprint, and blanks when the sprint cell is blank', () => {
    const product = makeProduct([
      makeRib('moved', [on('R1')], [entry('S1', 'R1', 30), entry('S3', 'R1', 40)]),
      makeRib('quiet', [on('R1')], [entry('S1', 'R1', 30)]),
    ]);
    mount(ProgressTrackingView, product);
    selectSprint('S3');
    expect(screen.getByText('moved').closest('tr')?.textContent).toContain('+10%');
    expect(screen.getByText('quiet').closest('tr')?.textContent).not.toMatch(/[+-]\d/);
  });
});

describe('Insights, §9 row 8', () => {
  function tableRow(label: string): string[] {
    const cell = within(document.querySelector('table') as HTMLElement).getByText(label);
    return [...(cell.closest('tr') as HTMLElement).querySelectorAll('td')].map(td => td.textContent ?? '');
  }

  it('shows one decimal, the reconciling rows, and Remaining −(O − V)', () => {
    mount(InsightsView, walkthrough(8));
    expect(tableRow('Release R2')).toEqual(['Release R2', '40', '40', '0', '55%', '18']);
    expect(tableRow('Release R3')).toEqual(['Release R3', '46', '46', '0', '34.8%', '30']);
    expect(tableRow('Unallocated')).toEqual(['Unallocated', '40', '40', '0', '', '40']);
    expect(tableRow('Over-allocated')).toEqual(['Over-allocated', '-6', '-6', '-0', '', '-2'].map(v => v === '-0' ? '0' : v));
    expect(tableRow('Total')).toEqual(['Total', '120', '120', '0', '28.3%', '86']);
    expect(screen.getByText('28.3%', { selector: 'div.text-xl' })).toBeTruthy();
  });

  it('(d) the Total row is the Progress header and the burn-up\'s last point', () => {
    const product = walkthrough(8);
    mount(InsightsView, product);
    const [, points, , , , remaining] = tableRow('Total');
    const last = getProgressOverTime(product)[1];
    expect(Number(points)).toBe(last?.totalPoints);
    expect(Number(points) - Number(remaining)).toBe(last?.completedPoints);
  });

  it('leaves out rows with nothing to say', () => {
    mount(InsightsView, makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R1', 10)])]));
    expect(within(document.querySelector('table') as HTMLElement).queryByText('Unallocated')).toBeNull();
    expect(within(document.querySelector('table') as HTMLElement).queryByText('Over-allocated')).toBeNull();
    expect(tableRow('Total')).toEqual(['Total', '40', '40', '0', '10%', '36']);
  });

  it('names an unknown release in a row of its own', () => {
    mount(InsightsView, makeProduct([makeRib('r', [on('GONE')], [entry('S1', 'GONE', 30)])]));
    expect(tableRow('Unknown release')).toEqual(['Unknown release', '40', '40', '0', '30%', '28']);
  });
});

describe('Needs Attention', () => {
  const stranded = (id: string): RibItem => makeRib(id, [on('R2')], [entry('S1', 'R1', 10)]);

  it('names the rib, the release, the sprints and what would count', () => {
    mount(InsightsView, walkthrough(4));
    expect(text()).toContain('Progress not counting: 1');
    expect(text()).toContain('c (B): Release R2, S1. Would count 30%.');
  });

  it('shows the panel for a project with no other attention item', () => {
    mount(InsightsView, makeProduct([stranded('only')]));
    expect(screen.getByText('Needs Attention')).toBeTruthy();
    expect(text()).toContain('Progress not counting: 1');
  });

  it('shows no panel with nothing to say', () => {
    mount(InsightsView, makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R1', 10)])]));
    expect(screen.queryByText('Needs Attention')).toBeNull();
  });

  it('renders every row, past the ten the other sections stop at', () => {
    const ribs = Array.from({ length: 14 }, (_, i) => stranded(`rib${i}`));
    mount(InsightsView, makeProduct(ribs));
    for (const rib of ribs) expect(text()).toContain(`${rib.id} (B): Release R1, S1.`);
    expect(text()).not.toContain('more');
  });

  it('shows what would count when a series ends lower', () => {
    mount(InsightsView, makeProduct([makeRib('r', [on('R2')], [entry('S1', 'R1', 10), entry('S2', 'R1', 0)])]));
    expect(text()).toContain('r (B): Release R1, S1. Would count 0%.');
  });

  it('reads a duplicate allocation row as one allocation in the incomplete list', () => {
    mount(InsightsView, makeProduct([makeRib('r', [on('R1', 50), on('R1', 50)], [])]));
    expect(text()).toContain('r — 50%');
  });
});
