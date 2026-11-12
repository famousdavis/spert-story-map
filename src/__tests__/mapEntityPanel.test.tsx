// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { computeLayout, gapButtonFor } from '../components/storymap/useMapLayout';
import { NAME_HINT } from '../components/storymap/mapEntity';
import type { Product } from '../types';
import {
  advance, at, card, installMapTestEnv, mapContainer, mapProduct, mountMap, nameEl, panel, panelName,
  pressEscape, ribPanelOpen, ribPath, ribReleases,
} from './fixtures/mapEntityHarness';
import { req } from './testHelpers';

/**
 * The theme and backbone panel as a whole on the real Map tab: how it closes, how it
 * shares one selection with the rib and release panels and the multi-selection, where
 * it sits in the page, and what the headers show of a description.
 */

installMapTestEnv();

function open(key: string) {
  fireEvent.click(nameEl(key));
  advance(200);
}

const badge = () => screen.queryByText(/selected — press Delete to remove/) !== null;

describe('closing the panel', () => {
  it('Escape closes it', () => {
    mountMap();
    open('theme:t1');
    pressEscape();
    expect(panelName()).toBeNull();
  });

  it('Escape while a card is pressed but has not moved 8 px cancels the press and leaves the panel open', () => {
    const hosted = mountMap();
    open('backbone:t1:b1');
    const { from, to } = ribPath(hosted.product);
    fireEvent.pointerDown(card('r1'), at(from.x, from.y));
    pressEscape();
    fireEvent.pointerMove(mapContainer(), at(to.x, to.y));
    fireEvent.pointerUp(mapContainer(), at(to.x, to.y));
    expect({ rib: ribReleases(hosted.product), entity: panelName(), writes: hosted.writes })
      .toStrictEqual({ rib: 'R1', entity: 'Backbone A', writes: 0 });
  });

  it('Escape during a drag past 8 px cancels the drag and leaves the panel open', () => {
    const hosted = mountMap();
    open('backbone:t1:b1');
    const { from, to } = ribPath(hosted.product);
    fireEvent.pointerDown(card('r1'), at(from.x, from.y));
    fireEvent.pointerMove(mapContainer(), at(to.x, to.y));
    pressEscape();
    fireEvent.pointerUp(mapContainer(), at(to.x, to.y));
    expect({ rib: ribReleases(hosted.product), entity: panelName(), writes: hosted.writes })
      .toStrictEqual({ rib: 'R1', entity: 'Backbone A', writes: 0 });
  });

  it('a press-release on empty canvas closes it', () => {
    mountMap();
    open('theme:t1');
    fireEvent.pointerDown(mapContainer(), { clientX: 400, clientY: 400, button: 0, pointerId: 1 });
    fireEvent.pointerUp(mapContainer(), { clientX: 400, clientY: 400, button: 0, pointerId: 1 });
    expect(panelName()).toBeNull();
  });
});

describe('one selection for every panel', () => {
  it('+ Rib with a backbone panel open shows only the new rib panel', () => {
    const hosted = mountMap();
    open('backbone:t1:b2');
    const layout = computeLayout(hosted.product);
    const col = req(layout.columns.find(c => c.backboneId === 'b2'), 'column b2');
    const gap = req(gapButtonFor(layout, req(layout.releaseLanes.find(l => l.releaseId === 'R1'), 'lane R1'), col), 'gap');
    const content = req(mapContainer().firstElementChild?.firstElementChild as HTMLElement | null, 'map content');
    fireEvent.pointerMove(content, { clientX: gap.x + 2, clientY: gap.y + 2 });
    fireEvent.click(screen.getByText('+ Rib'));
    expect({ rib: ribPanelOpen(), entity: panelName() }).toStrictEqual({ rib: true, entity: null });
  });

  it('a shift-click on a card closes the panel and starts a multi-selection', () => {
    mountMap();
    open('backbone:t1:b1');
    fireEvent.click(card('r1'), { shiftKey: true });
    expect({ entity: panelName(), badge: badge() }).toStrictEqual({ entity: null, badge: true });
  });

  it('opening a theme panel clears the multi-selection', () => {
    mountMap();
    fireEvent.click(card('r1'), { shiftKey: true });
    const before = badge();
    open('theme:t1');
    expect({ before, entity: panelName(), after: badge() }).toStrictEqual({ before: true, entity: 'Theme One', after: false });
  });
});

describe('where the panel sits', () => {
  it('beside the map area, which holds the legend and the zoom controls; the root stays positioned; × closes it', () => {
    mountMap();
    open('theme:t1');
    const area = req(document.querySelector<HTMLElement>('[data-map-area]'), 'map area');
    const entity = req(panel(), 'panel');
    const placement = {
      legendInArea: area.contains(screen.getByText('Legend')),
      zoomInArea: area.contains(screen.getByTitle('Fit to screen (0)')),
      panelIsSibling: entity.parentElement === area.parentElement && !area.contains(entity),
      rootRelative: req(area.parentElement, 'root').classList.contains('relative'),
    };
    fireEvent.click(screen.getByRole('button', { name: 'Close theme details' }));
    expect({ placement, afterClose: panelName() }).toStrictEqual({
      placement: { legendInArea: true, zoomInArea: true, panelIsSibling: true, rootRelative: true },
      afterClose: null,
    });
  });

  it('shows the backbone summary and a labelled description capped at 2000 characters', () => {
    mountMap();
    open('backbone:t1:b1');
    const field = screen.getByLabelText('Description') as HTMLTextAreaElement;
    const row = (label: string) => req(screen.getByText(label).nextElementSibling, label).textContent;
    expect({
      theme: row('Theme'), items: row('Rib items'), points: row('Points'), done: row('Done'), unsized: row('Unsized'),
      field: { maxLength: field.maxLength, name: field.name, autoComplete: field.getAttribute('autocomplete'), value: field.value },
    }).toStrictEqual({
      theme: 'Theme One', items: '1', points: '5', done: '0%', unsized: '0',
      field: { maxLength: 2000, name: 'backboneDescription', autoComplete: 'off', value: 'A text' },
    });
  });
});

describe('what a header shows of a description', () => {
  it('the hover text and the glyph follow the trimmed description', () => {
    const long = 'x'.repeat(400);
    const base = mapProduct();
    const product: Product = { ...base, themes: base.themes.map(t => t.id === 't1'
      ? { ...t, description: '   ', backboneItems: t.backboneItems.map(b => b.id === 'b1' ? { ...b, description: '  Real text  ' } : { ...b, description: long }) }
      : t) };
    mountMap(product);
    const shown = (key: string) => ({
      title: nameEl(key).title,
      glyph: nameEl(key).querySelector('[aria-label="Has a description"]') !== null,
    });
    expect({ t1: shown('theme:t1'), b1: shown('backbone:t1:b1'), b2: shown('backbone:t1:b2') }).toStrictEqual({
      t1: { title: NAME_HINT, glyph: false },
      b1: { title: `Real text\n\n${NAME_HINT}`, glyph: true },
      b2: { title: `${'x'.repeat(300)}…\n\n${NAME_HINT}`, glyph: true },
    });
  });
});
