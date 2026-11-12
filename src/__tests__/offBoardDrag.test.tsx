// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { ReactElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import StoryMapView from '../pages/StoryMapView';
import SizingView from '../pages/SizingView';
import { computeLayout } from '../components/storymap/useMapLayout';
import { computeSizingLayout } from '../components/sizing/useSizingLayout';
import type { Product } from '../types';
import { mountHosted } from './fixtures/productHost';
import type { HostedProduct } from './fixtures/productHost';
import { makeProduct, makeRib, ribOf } from './fixtures/progressIntegrity';
import { req } from './testHelpers';

/**
 * A drag on the Map or Sizing canvas hears its moves and its end only through the map
 * container. Before v0.53.35 a drag let go anywhere else stayed armed, and the next
 * press-release on the canvas committed it: on the Map the card moved release, on
 * Sizing it took a size and a card-order slot. `MapCanvas` now cancels such a drag, so
 * both tabs are driven here through the real page, the real drag hook and the real canvas.
 *
 * "Outside" is the canvas's own Fit button: inside the page, outside the container, as
 * the legend and the zoom controls are.
 */

interface Point { x: number; y: number }

interface Tab {
  name: string;
  View: () => ReactElement;
  product: Product;
  /** A point on card `r`, and one where the drag takes it, in map units. */
  path: (product: Product) => { from: Point; to: Point };
  /** Where card `r` is: its release on the Map, its size on Sizing. */
  where: (product: Product) => string;
  start: string;
  end: string;
}

const TABS: Tab[] = [
  {
    name: 'Map',
    View: StoryMapView,
    product: makeProduct([makeRib('r', [{ releaseId: 'R1', percentage: 100 }], [])]),
    path: product => {
      const layout = computeLayout(product);
      const cell = req(layout.cells.find(c => c.id === 'r'), 'card');
      const lane = req(layout.releaseLanes.find(l => l.releaseId === 'R2'), 'lane R2');
      return { from: { x: cell.x + 4, y: cell.y + 4 }, to: { x: cell.x + 10, y: lane.y + 10 } };
    },
    where: product => ribOf(product, 'r').releaseAllocations.map(a => a.releaseId).join(','),
    start: 'R1',
    end: 'R2',
  },
  {
    name: 'Sizing',
    View: SizingView,
    product: makeProduct([makeRib('r', [], [], 'L')]),
    path: product => {
      const layout = computeSizingLayout(product);
      const cell = req(layout.cells.find(c => c.id === 'r'), 'card');
      const column = req(layout.sizeColumns.find(c => c.label === 'M'), 'column M');
      return { from: { x: cell.x + 4, y: cell.y + 4 }, to: { x: column.x + 10, y: layout.sizeColumnsY + 20 } };
    },
    where: product => ribOf(product, 'r').size ?? 'unsized',
    start: 'L',
    end: 'M',
  },
];
const [MAP] = TABS;

// jsdom has no pointer capture, and a press on empty canvas starts a pan that asks for
// it. Stubbed for each test and taken away after, so no other file inherits the stub.
const CAPTURE = ['setPointerCapture', 'releasePointerCapture'] as const;
let savedCapture: (PropertyDescriptor | undefined)[] = [];
beforeEach(() => {
  savedCapture = CAPTURE.map(k => Object.getOwnPropertyDescriptor(Element.prototype, k));
  for (const k of CAPTURE) Object.defineProperty(Element.prototype, k, { value: () => {}, configurable: true, writable: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const [i, k] of CAPTURE.entries()) {
    const saved = savedCapture[i];
    if (saved) Object.defineProperty(Element.prototype, k, saved);
    else delete (Element.prototype as unknown as Record<string, unknown>)[k];
  }
});

// Sizing measures its container. jsdom has no ResizeObserver.
const realResizeObserver = globalThis.ResizeObserver;
beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterAll(() => { globalThis.ResizeObserver = realResizeObserver; });

const map = () => req(document.querySelector<HTMLElement>('[data-map-container]'), 'map container');
const card = () => req(document.querySelector<HTMLElement>('[data-rib-id="r"]'), 'card r');
const outside = () => screen.getByTitle('Fit to screen (0)');
/** The badge a live drag shows ("Moving → Release R2", "Moving → M"). */
const dragShown = () => screen.queryByText(/^Moving →/) !== null;

/** The canvas's scale. jsdom has no size to fit to, so both views settle on their minimum. */
const zoom = () => {
  const stage = req(map().firstElementChild as HTMLElement | null, 'stage');
  return Number(req(/scale\(([\d.]+)\)/.exec(stage.style.transform)?.[1], 'scale'));
};
const at = (p: Point) => ({ clientX: p.x * zoom(), clientY: p.y * zoom(), button: 0, pointerId: 1 });

/** Mount the tab, press card `r` and move it past the 8 px threshold. */
function startDrag(tab: Tab): { hosted: HostedProduct; to: Point } {
  const hosted = mountHosted(tab.View, tab.product);
  const { from, to } = tab.path(hosted.product);
  fireEvent.pointerDown(card(), at(from));
  fireEvent.pointerMove(map(), at(to));
  expect(Math.hypot(at(to).clientX - at(from).clientX, at(to).clientY - at(from).clientY)).toBeGreaterThan(8);
  expect(dragShown()).toBe(true);
  return { hosted, to };
}

/** A plain press-release on the canvas: the gesture that used to commit a stray drag. */
function clickCanvas(p: Point) {
  fireEvent.pointerDown(map(), at(p));
  fireEvent.pointerUp(map(), at(p));
}

describe.each(TABS)('the $name tab', tab => {
  it('cancels a drag let go outside the map, so the next click on the canvas writes nothing', () => {
    const { hosted, to } = startDrag(tab);

    fireEvent.pointerUp(outside(), at(to));
    const afterRelease = { writes: hosted.writes, dragShown: dragShown() };
    clickCanvas(to);

    expect({ afterRelease, afterClick: { writes: hosted.writes, card: tab.where(hosted.product) } }).toStrictEqual({
      afterRelease: { writes: 0, dragShown: false },
      afterClick: { writes: 0, card: tab.start },
    });
  });

  it('cancels a drag on pointercancel, though that lands on the pressed card inside the map', () => {
    const { hosted, to } = startDrag(tab);
    expect(map().contains(card())).toBe(true);

    fireEvent.pointerCancel(card(), at(to));
    const afterCancel = { writes: hosted.writes, dragShown: dragShown() };
    clickCanvas(to);

    expect({ afterCancel, afterClick: { writes: hosted.writes, card: tab.where(hosted.product) } }).toStrictEqual({
      afterCancel: { writes: 0, dragShown: false },
      afterClick: { writes: 0, card: tab.start },
    });
  });

  it('still commits a drag let go on the map, exactly once', () => {
    const { hosted, to } = startDrag(tab);

    fireEvent.pointerUp(map(), at(to));
    const afterDrop = { writes: hosted.writes, card: tab.where(hosted.product) };
    clickCanvas(to);

    expect({ afterDrop, afterClick: hosted.writes }).toStrictEqual({
      afterDrop: { writes: 1, card: tab.end },
      afterClick: 1,
    });
  });
});

describe('the window listeners the cancel needs', () => {
  /** pointerup / pointercancel listeners added to `window` and not yet removed. */
  function held(add: MockInstance, remove: MockInstance): number {
    const pointer = (calls: unknown[][]) => calls.filter(([type]) => type === 'pointerup' || type === 'pointercancel');
    const removed = pointer(remove.mock.calls);
    return pointer(add.mock.calls)
      .filter(([type, fn]) => !removed.some(([t, f]) => t === type && f === fn))
      .length;
  }

  it('are held only while a drag is armed, and let go on a drop, an outside release, a cancel and an unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const ends: Record<string, (to: Point) => void> = {
      'a drop on the map': to => fireEvent.pointerUp(map(), at(to)),
      'a release outside': to => fireEvent.pointerUp(outside(), at(to)),
      'a pointercancel': to => fireEvent.pointerCancel(card(), at(to)),
      'an unmount': () => cleanup(),
    };

    const seen: Record<string, [number, number]> = {};
    for (const [name, end] of Object.entries(ends)) {
      const { to } = startDrag(req(MAP, 'map tab'));
      const whileArmed = held(add, remove);
      end(to);
      seen[name] = [whileArmed, held(add, remove)];
      cleanup();
    }

    expect(seen).toStrictEqual({
      'a drop on the map': [2, 0],
      'a release outside': [2, 0],
      'a pointercancel': [2, 0],
      'an unmount': [2, 0],
    });
  });
});
