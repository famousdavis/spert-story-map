// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import StoryMapView from '../pages/StoryMapView';
import {
  ADD_BUTTON_RESERVED, CELL_GAP, CELL_HEIGHT, CELL_PAD, MIN_LANE_HEIGHT,
  computeLayout, gapButtonAt, gapButtonFor,
} from '../components/storymap/useMapLayout';
import type { MapLayout } from '../components/storymap/useMapLayout';
import { importProductFromJSON } from '../lib/importExport';
import { UNKNOWN_RELEASE_LABEL, getStrandedRows } from '../lib/reconciliation';
import type { Product, ReleaseAllocation, RibItem } from '../types';
import { mountHosted } from './fixtures/productHost';
import type { HostedProduct } from './fixtures/productHost';
import { entry, makeProduct, makeRib, ribOf } from './fixtures/progressIntegrity';
import { req } from './testHelpers';

/**
 * A rib can hold an allocation to a release the project does not hold. The figures
 * have reported that as "Unknown release" since v0.53.18; these tests hold the Map
 * to the same thing: the rib has a card, in a lane of that name, and the card can be
 * moved out of it through the real drag handlers.
 *
 * The first describe pins how a project gets here, because the validator closes the
 * obvious route: it strips such an allocation from any file that holds a release.
 *
 * `GONE` is the release id absent from the fixture's six releases.
 */

afterEach(cleanup);

const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });

const stranded = () => makeRib('stranded', [on('GONE')], []);

/** Two columns: `b` holding `ribs`, and an empty `b2` to drag across to. */
function twoColumns(ribs: RibItem[]): Product {
  const product = makeProduct(ribs);
  const theme = req(product.themes[0], 'theme');
  return {
    ...product,
    themes: [{ ...theme, backboneItems: [...theme.backboneItems, { id: 'b2', name: 'B2', order: 2, ribItems: [] }] }],
  };
}

const cellsOf = (layout: MapLayout, ribId: string) => layout.cells.filter(c => c.id === ribId);

describe('the route into this state', () => {
  const imported = (releases: Product['releases']) =>
    importProductFromJSON(JSON.stringify({ ...makeProduct([makeRib('stranded', [on('GONE')], [entry('S1', 'GONE', 30)])]), releases }));

  it('is a file holding no releases: its allocations are kept, and the rib reaches the lane', () => {
    const product = imported([]);
    expect(ribOf(product, 'stranded').releaseAllocations).toEqual([on('GONE')]);
    expect(ribOf(product, 'stranded').progressHistory.map(e => e.releaseId)).toEqual(['GONE']);

    const layout = computeLayout(product);
    const lane = req(layout.unknownLane, 'unknown lane');
    expect(req(cellsOf(layout, 'stranded')[0], 'card').y).toBe(lane.y + CELL_PAD);
  });

  it('is not a file holding any release: the allocation is dropped, and the rib is Unassigned', () => {
    const product = imported([{ id: 'R1', name: 'Release 1', order: 1 }]);
    expect(ribOf(product, 'stranded').releaseAllocations).toEqual([]);

    const layout = computeLayout(product);
    expect(layout.unknownLane).toBeNull();
    expect(cellsOf(layout, 'stranded')[0]?.releaseId).toBeNull();
  });
});

describe('computeLayout: a rib allocated to a release the project does not hold', () => {
  it('has a card', () => {
    expect(cellsOf(computeLayout(makeProduct([stranded()])), 'stranded')).toHaveLength(1);
  });

  it('is placed in a lane of its own, between the releases and Unassigned', () => {
    const layout = computeLayout(makeProduct([stranded()]));
    const lane = req(layout.unknownLane, 'unknown lane');
    const lastRelease = req(layout.releaseLanes[layout.releaseLanes.length - 1], 'last release');
    const unassigned = req(layout.unassignedLane, 'unassigned lane');

    expect(lane.y).toBe(lastRelease.y + lastRelease.height);
    expect(unassigned.y).toBe(lane.y + lane.height);
    expect(layout.totalHeight).toBe(unassigned.y + unassigned.height);

    const cell = req(cellsOf(layout, 'stranded')[0], 'card');
    expect(cell.y).toBe(lane.y + CELL_PAD);
  });

  it('keeps the allocation it holds, so a drag moves the right one', () => {
    const cell = req(cellsOf(computeLayout(makeProduct([stranded()])), 'stranded')[0], 'card');
    expect(cell.releaseId).toBe('GONE');
    expect(cell.allocation?.releaseId).toBe('GONE');
  });

  it('is not listed as Unassigned: the figures count it as allocated', () => {
    const layout = computeLayout(makeProduct([stranded()]));
    expect(layout.unassignedRibCounts).toEqual({});
    expect(req(layout.unassignedLane, 'unassigned lane').height).toBe(MIN_LANE_HEIGHT);
  });

  it('takes a card per allocation, as a split rib does everywhere else on the map', () => {
    const split = makeRib('split', [on('R1', 50), on('GONE', 50)], []);
    const cells = cellsOf(computeLayout(makeProduct([split])), 'split');
    expect(cells.map(c => c.releaseId).sort()).toEqual(['GONE', 'R1']);
    expect(cells.every(c => c.isPartial)).toBe(true);
  });

  it('puts every unknown release in the one lane, stacked by column', () => {
    const product = makeProduct([makeRib('a', [on('GONE')], []), makeRib('b', [on('OTHER')], [])]);
    const layout = computeLayout(product);
    const lane = req(layout.unknownLane, 'unknown lane');
    const ys = layout.cells.map(c => c.y).sort((p, q) => p - q);

    expect(ys).toEqual([lane.y + CELL_PAD, lane.y + CELL_PAD + CELL_HEIGHT + CELL_GAP]);
    expect(lane.height).toBe(2 * (CELL_HEIGHT + CELL_GAP) + CELL_PAD * 2);
  });

  it('does not reserve "+ Rib" room in the lane, and offers no button there', () => {
    const layout = computeLayout(makeProduct([stranded()]));
    const lane = req(layout.unknownLane, 'unknown lane');
    const col = req(layout.columns[0], 'column');

    expect(lane.height).toBe(CELL_HEIGHT + CELL_GAP + CELL_PAD * 2);
    expect(lane.height).toBeLessThan(CELL_HEIGHT + CELL_GAP + CELL_PAD * 2 + ADD_BUTTON_RESERVED);
    for (let y = lane.y; y < lane.y + lane.height; y++) {
      expect(gapButtonAt(layout, col.x + 20, y)).toBeNull();
    }
    // Positive control: the same scan does find the Unassigned lane's button.
    const gap = req(gapButtonFor(layout, null, col), 'unassigned gap button');
    expect(gapButtonAt(layout, col.x + 20, gap.y + 1)).toEqual(gap);
  });

  it('draws no lane when every allocation has a release', () => {
    const layout = computeLayout(makeProduct([makeRib('r', [on('R1')], [])]));
    expect(layout.unknownLane).toBeNull();
    expect(layout.cells).toHaveLength(1);
  });
});

describe('the Map tab: moving a card out of the lane', () => {
  let hosted: HostedProduct;

  const mount = (product: Product) => { hosted = mountHosted(StoryMapView, product); };
  const map = () => req(document.querySelector<HTMLElement>('[data-map-container]'), 'map');
  const card = (id: string, releaseId: string) =>
    req(document.querySelector<HTMLElement>(`[data-rib-id="${id}"][data-release-id="${releaseId}"]`), `card ${id}`);

  /** The canvas's current scale. jsdom has no size to fit to, so the view settles on its minimum. */
  const zoom = () => {
    const scale = /scale\(([\d.]+)\)/.exec(req(map().firstElementChild as HTMLElement | null, 'stage').style.transform)?.[1];
    return Number(req(scale, 'scale'));
  };
  const client = (x: number, y: number) => ({ clientX: x * zoom(), clientY: y * zoom(), button: 0 });

  /** Press on a card, move through each logical point, and let go, as the pointer handlers receive it. */
  function drag(ribId: string, releaseId: string, ...points: { x: number; y: number }[]) {
    const cell = req(computeLayout(hosted.product).cells.find(c => c.id === ribId && c.releaseId === releaseId), 'cell');
    fireEvent.pointerDown(card(ribId, releaseId), client(cell.x + 4, cell.y + 4));
    for (const p of points) fireEvent.pointerMove(map(), client(p.x, p.y));
    const last = req(points[points.length - 1], 'a drag has an end');
    fireEvent.pointerUp(map(), client(last.x, last.y));
  }

  const laneOf = (releaseId: string) => {
    const lane = req(computeLayout(hosted.product).releaseLanes.find(l => l.releaseId === releaseId), releaseId);
    return lane.y + 10;
  };
  const unknownY = () => req(computeLayout(hosted.product).unknownLane, 'unknown lane').y + 10;
  const unassignedY = () => req(computeLayout(hosted.product).unassignedLane, 'unassigned lane').y + 10;
  const columnX = (index: number) => req(computeLayout(hosted.product).columns[index], 'column').x + 10;

  it('shows the card under the label the other tabs use', () => {
    mount(makeProduct([stranded()]));
    expect(screen.getByText('stranded')).toBeTruthy();
    expect(screen.getAllByText(UNKNOWN_RELEASE_LABEL)).toHaveLength(2);
  });

  it('names the release the same way in the card\'s panel', () => {
    mount(makeProduct([stranded()]));
    fireEvent.click(card('stranded', 'GONE'));
    expect(screen.getAllByText(UNKNOWN_RELEASE_LABEL)).toHaveLength(3);
  });

  it('shows no such lane on a project with nothing unknown', () => {
    mount(makeProduct([makeRib('r', [on('R1')], [])]));
    expect(screen.queryByText(UNKNOWN_RELEASE_LABEL)).toBeNull();
  });

  it('moves the card to a release, with its allocation and its progress', () => {
    mount(makeProduct([makeRib('stranded', [{ ...on('GONE', 60), memo: 'kept' }], [entry('S1', 'GONE', 30)])]));

    drag('stranded', 'GONE', { x: columnX(0), y: laneOf('R2') });

    const rib = ribOf(hosted.product, 'stranded');
    expect(rib.releaseAllocations).toEqual([{ releaseId: 'R2', percentage: 60, memo: 'kept' }]);
    expect(rib.progressHistory.map(e => e.releaseId)).toEqual(['R2']);
    expect(hosted.writes).toBe(1);
    expect(card('stranded', 'R2')).toBeTruthy();
    expect(screen.queryByText(UNKNOWN_RELEASE_LABEL)).toBeNull();
  });

  it('moves the card to Unassigned: the record stays, counts nowhere, and no list shows it', () => {
    mount(makeProduct([makeRib('stranded', [on('GONE')], [entry('S1', 'GONE', 30)])]));

    drag('stranded', 'GONE', { x: columnX(0), y: unassignedY() });

    const rib = ribOf(hosted.product, 'stranded');
    expect(rib.releaseAllocations).toEqual([]);
    expect(rib.progressHistory.map(e => e.releaseId)).toEqual(['GONE']);
    // Needs Attention lists only records on a release that exists (`strandedSeries`).
    expect(getStrandedRows(hosted.product)).toEqual([]);
    expect(screen.queryByText(UNKNOWN_RELEASE_LABEL)).toBeNull();
  });

  it('moves one share of a split rib and leaves the other', () => {
    mount(makeProduct([makeRib('split', [on('R1', 50), on('GONE', 50)], [])]));

    drag('split', 'GONE', { x: columnX(0), y: laneOf('R3') });

    expect(ribOf(hosted.product, 'split').releaseAllocations.map(a => a.releaseId).sort()).toEqual(['R1', 'R3']);
  });

  it('moves the card across columns and keeps it in the lane', () => {
    mount(twoColumns([stranded()]));

    drag('stranded', 'GONE', { x: columnX(1), y: unknownY() });

    const moved = req(hosted.product.themes[0]?.backboneItems[1]?.ribItems[0], 'rib in b2');
    expect(moved.id).toBe('stranded');
    expect(moved.releaseAllocations).toEqual([on('GONE')]);
    expect(card('stranded', 'GONE').dataset.backboneId).toBe('b2');
  });

  it('writes nothing when a card is dropped back in its own lane', () => {
    mount(makeProduct([stranded()]));

    drag('stranded', 'GONE', { x: columnX(0) + 40, y: unknownY() + 30 });

    expect(hosted.writes).toBe(0);
  });

  it('refuses a card from a release: nothing can be allocated to an unknown release', () => {
    mount(makeProduct([stranded(), makeRib('r', [on('R1')], [])]));

    drag('r', 'R1', { x: columnX(0), y: unknownY() });

    expect(hosted.writes).toBe(0);
    expect(ribOf(hosted.product, 'r').releaseAllocations).toEqual([on('R1')]);
  });
});
