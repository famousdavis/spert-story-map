// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoryMapView from '../../pages/StoryMapView';
import { computeLayout } from '../../components/storymap/useMapLayout';
import type { Backbone, Product, RibItem, Theme } from '../../types';
import { mountHosted } from './productHost';
import type { HostedProduct } from './productHost';
import { req } from '../testHelpers';

/**
 * The real `StoryMapView` on `mountHosted`, for the theme and backbone panel tests.
 *
 * Timers are fake, because a name click opens its panel 200 ms later. `userEvent` with
 * fake timers hangs unless it is told how to advance them, and Testing Library looks
 * for a `jest` global to do the same, so both are wired here. jsdom has no pointer
 * capture, which a press on empty canvas asks for, so it is stubbed and restored.
 */
export function installMapTestEnv(): void {
  const capture = ['setPointerCapture', 'releasePointerCapture'] as const;
  let saved: (PropertyDescriptor | undefined)[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>).jest = { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) };
    saved = capture.map(k => Object.getOwnPropertyDescriptor(Element.prototype, k));
    for (const k of capture) Object.defineProperty(Element.prototype, k, { value: () => {}, configurable: true, writable: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).jest;
    for (const [i, k] of capture.entries()) {
      const prior = saved[i];
      if (prior) Object.defineProperty(Element.prototype, k, prior);
      else delete (Element.prototype as unknown as Record<string, unknown>)[k];
    }
  });
}

export const setupUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
export const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function rib(id: string, releaseId: string | null, cardColor?: string): RibItem {
  return {
    id, name: `Rib ${id}`, description: '', order: 1, size: 'M', category: 'core', notes: '',
    releaseAllocations: releaseId ? [{ releaseId, percentage: 100 }] : [], progressHistory: [],
    ...(cardColor ? { cardColor } : {}),
  };
}

/** t1 holds A (b1, one rib on R1) and B (b2); t2 holds C (b3). */
export function mapProduct(): Product {
  return {
    id: 'p', name: 'P', description: '', createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 2,
    sizeMapping: [{ label: 'M', points: 5 }],
    releases: [{ id: 'R1', name: 'Release One', order: 1 }, { id: 'R2', name: 'Release Two', order: 2 }],
    sprints: [],
    releaseCardOrder: {},
    themes: [
      { id: 't1', name: 'Theme One', description: 'Theme one text', order: 1, backboneItems: [
        { id: 'b1', name: 'Backbone A', description: 'A text', order: 1, ribItems: [rib('r1', 'R1', 'rose')] },
        { id: 'b2', name: 'Backbone B', description: 'B text', order: 2, ribItems: [] },
      ] },
      { id: 't2', name: 'Theme Two', order: 2, backboneItems: [
        { id: 'b3', name: 'Backbone C', description: '', order: 1, ribItems: [] },
      ] },
    ],
  };
}

export const mountMap = (product: Product = mapProduct()): HostedProduct => mountHosted(StoryMapView, product);

export function themeIn(product: Product, themeId: string): Theme {
  return req(product.themes.find(t => t.id === themeId), `theme ${themeId}`);
}
export function backboneIn(product: Product, themeId: string, backboneId: string): Backbone {
  return req(themeIn(product, themeId).backboneItems.find(b => b.id === backboneId), `backbone ${backboneId} in ${themeId}`);
}

// ─── Finders ─────────────────────────────────────────────────────────

/** A theme (`theme:t1`) or backbone (`backbone:t1:b1`) name on the map: the wrapper that owns the click. */
export const nameEl = (key: string) => req(document.querySelector<HTMLElement>(`[data-map-name="${key}"]`), `name ${key}`);
export const grip = (key: string) => req(nameEl(key).parentElement?.querySelector<HTMLElement>('[title^="Drag to"]'), `grip of ${key}`);
export const panel = () => document.querySelector<HTMLElement>('[data-map-entity-panel]');
/** The open theme or backbone panel's heading, or null when none is open. */
export const panelName = () => panel()?.querySelector('h3')?.textContent ?? null;
export const descriptionField = () => req(panel()?.querySelector('textarea') ?? null, 'description field');
export const ribPanelOpen = () => screen.queryByText('Release Allocations') !== null;
export const releasePanelOpen = () => screen.queryByText('Scope') !== null;
export const card = (id: string) => req(document.querySelector<HTMLElement>(`[data-rib-id="${id}"]`), `card ${id}`);
export const releaseLabel = (id: string) => req(document.querySelector<HTMLElement>(`span[data-release-id="${id}"]`), `label ${id}`);
export const mapContainer = () => req(document.querySelector<HTMLElement>('[data-map-container]'), 'map container');

/** The canvas's scale. jsdom has no size to fit to, so the map settles on its minimum. */
const zoom = () => {
  const stage = req(mapContainer().firstElementChild as HTMLElement | null, 'stage');
  return Number(req(/scale\(([\d.]+)\)/.exec(stage.style.transform)?.[1], 'scale'));
};
/** A point in map units, as pointer-event coordinates. */
export const at = (x: number, y: number, pointerId = 1) => ({ clientX: x * zoom(), clientY: y * zoom(), button: 0, pointerId });

/** Where rib `r1` sits, and a point in lane R2 of the same column, in map units. */
export function ribPath(product: Product, ribId = 'r1'): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const layout = computeLayout(product);
  const cell = req(layout.cells.find(c => c.id === ribId), `cell ${ribId}`);
  const lane = req(layout.releaseLanes.find(l => l.releaseId === 'R2'), 'lane R2');
  return { from: { x: cell.x + 4, y: cell.y + 4 }, to: { x: cell.x + 10, y: lane.y + 10 } };
}

/** Where rib `r1` is allocated. */
export function ribReleases(product: Product): string {
  return backboneIn(product, 't1', 'b1').ribItems.map(r => r.releaseAllocations.map(a => a.releaseId).join(',')).join('|');
}

/** Escape, delivered where a real key goes: the focused element. */
export const pressEscape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
