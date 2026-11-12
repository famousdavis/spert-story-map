// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import type { Product } from '../types';
import {
  advance, at, backboneIn, card, descriptionField, installMapTestEnv, mapContainer, mapProduct, mountMap,
  nameEl, panel, panelName, pressEscape, releaseLabel, releasePanelOpen, ribPath, ribReleases, setupUser,
} from './fixtures/mapEntityHarness';
import { req } from './testHelpers';

/**
 * The description editor in the theme and backbone panel. Three things keep typed text
 * where it belongs, and each test is driven so that exactly one of them stands between
 * the user and the failure:
 * - commit on unmount: switching panels by a release label or a rib card removes the
 *   focused field, and React fires no blur for that;
 * - the capture-phase blur: a press on a rib card prevents default, so nothing blurs the
 *   field, and Escape would land in the textarea, where the map's keys never look;
 * - the key: a switch remounts the editor, so text typed for one backbone never shows
 *   in, or is written to, another.
 * Plus D7's resolver: a backbone that moved theme, or shares its id with another, is
 * still the one the panel was opened for.
 */

installMapTestEnv();

const descOf = (p: Product, themeId: string, backboneId: string) => backboneIn(p, themeId, backboneId).description;

function open(key: string) {
  fireEvent.click(nameEl(key));
  advance(200);
}

/** Focus the description and change it, with no pointer involved. */
function typeInto(text: string) {
  const field = descriptionField();
  act(() => field.focus());
  fireEvent.change(field, { target: { value: text } });
  return field;
}

function withBackboneDescription(p: Product, themeId: string, backboneId: string, description: string): Product {
  return { ...p, themes: p.themes.map(t => t.id !== themeId ? t : {
    ...t, backboneItems: t.backboneItems.map(b => b.id === backboneId ? { ...b, description } : b),
  }) };
}

function moveBackbone(p: Product, backboneId: string, fromThemeId: string, toThemeId: string): Product {
  const moved = backboneIn(p, fromThemeId, backboneId);
  return { ...p, themes: p.themes.map(t => {
    if (t.id === fromThemeId) return { ...t, backboneItems: t.backboneItems.filter(b => b.id !== backboneId) };
    if (t.id === toThemeId) return { ...t, backboneItems: [...t.backboneItems, moved] };
    return t;
  }) };
}

describe('the description reaches the backbone it was typed for', () => {
  it('commit on unmount alone: a release label clicked with no press switches panels and keeps the text', () => {
    const hosted = mountMap();
    open('backbone:t1:b1');
    typeInto('A typed');

    fireEvent.click(releaseLabel('R1'));
    advance(200);

    expect({ release: releasePanelOpen(), entity: panelName(), a: descOf(hosted.product, 't1', 'b1'), writes: hosted.writes })
      .toStrictEqual({ release: true, entity: null, a: 'A typed', writes: 1 });
  });

  it('capture blur alone: Escape during a card drag cancels it, because the press committed and blurred the text first', () => {
    const hosted = mountMap();
    open('backbone:t1:b1');
    typeInto('A typed');
    const { from, to } = ribPath(hosted.product);

    fireEvent.pointerDown(card('r1'), at(from.x, from.y));
    fireEvent.pointerMove(mapContainer(), at(to.x, to.y));
    pressEscape();
    fireEvent.pointerUp(mapContainer(), at(to.x, to.y));

    expect({ rib: ribReleases(hosted.product), entity: panelName(), a: descOf(hosted.product, 't1', 'b1') })
      .toStrictEqual({ rib: 'R1', entity: 'Backbone A', a: 'A typed' });
  });

  it('keyed editor alone: text typed into A after clicking B stays with A; B opens on its own text', async () => {
    const user = setupUser();
    const hosted = mountMap();
    open('backbone:t1:b1');
    const field = descriptionField();
    await user.clear(field);
    await user.type(field, 'X');

    await user.click(nameEl('backbone:t1:b2'));
    act(() => field.focus());
    await user.keyboard('Y');
    advance(200);

    expect({ entity: panelName(), shown: descriptionField().value, a: descOf(hosted.product, 't1', 'b1'), b: descOf(hosted.product, 't1', 'b2') })
      .toStrictEqual({ entity: 'Backbone B', shown: 'B text', a: 'XY', b: 'B text' });
  });

  it('a change that arrived while the field sat focused and untouched stands when the panel switches away', () => {
    const hosted = mountMap();
    open('backbone:t1:b1');
    act(() => descriptionField().focus());

    hosted.replace(p => withBackboneDescription(p, 't1', 'b1', 'Remote text'));
    fireEvent.click(releaseLabel('R1'));
    advance(200);

    expect({ release: releasePanelOpen(), a: descOf(hosted.product, 't1', 'b1'), writes: hosted.writes })
      .toStrictEqual({ release: true, a: 'Remote text', writes: 0 });
  });
});

describe('addressing a backbone (D7)', () => {
  it('a backbone moved to another theme while its panel is open still takes the text and the rename', async () => {
    const user = setupUser();
    const hosted = mountMap();
    open('backbone:t1:b1');
    const field = typeInto('Moved text');

    hosted.replace(p => moveBackbone(p, 'b1', 't1', 't2'));
    act(() => field.blur());
    expect({ text: descOf(hosted.product, 't2', 'b1'), entity: panelName() })
      .toStrictEqual({ text: 'Moved text', entity: 'Backbone A' });

    await user.click(req(panel()?.querySelector('h3') ?? null, 'panel heading'));
    const input = req(panel()?.querySelector<HTMLInputElement>('input[name="backboneName"]') ?? null, 'rename input');
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');

    expect({ name: backboneIn(hosted.product, 't2', 'b1').name, entity: panelName() })
      .toStrictEqual({ name: 'Renamed', entity: 'Renamed' });
  });

  it('two themes holding the same backbone id: switching from one to the other writes only the second', () => {
    const product = mapProduct();
    const twin = { id: 'b1', name: 'Backbone A2', description: 'A2 text', order: 2, ribItems: [] };
    const dup: Product = { ...product, themes: product.themes.map(t => t.id === 't2' ? { ...t, backboneItems: [...t.backboneItems, twin] } : t) };
    const hosted = mountMap(dup);

    open('backbone:t1:b1');
    open('backbone:t2:b1');
    const shown = descriptionField().value;
    const field = typeInto('T2 only');
    act(() => field.blur());

    expect({ shown, t1: descOf(hosted.product, 't1', 'b1'), t2: descOf(hosted.product, 't2', 'b1') })
      .toStrictEqual({ shown: 'A2 text', t1: 'A text', t2: 'T2 only' });
  });

  it('the open backbone deleted from outside: the panel closes, nothing is written, and it stays closed if the backbone comes back', () => {
    const hosted = mountMap();
    open('backbone:t1:b1');
    typeInto('Unsaved');
    const original = backboneIn(hosted.product, 't1', 'b1');

    hosted.replace(p => ({ ...p, themes: p.themes.map(t => t.id === 't1' ? { ...t, backboneItems: t.backboneItems.filter(b => b.id !== 'b1') } : t) }));
    const afterDelete = { entity: panelName(), writes: hosted.writes };
    hosted.replace(p => ({ ...p, themes: p.themes.map(t => t.id === 't1' ? { ...t, backboneItems: [original, ...t.backboneItems] } : t) }));

    expect({ afterDelete, afterRestore: { entity: panelName(), writes: hosted.writes } }).toStrictEqual({
      afterDelete: { entity: null, writes: 0 },
      afterRestore: { entity: null, writes: 0 },
    });
  });
});

describe('Escape with a description being typed', () => {
  it('Escape typed in the textarea neither closes the panel nor drops the text', () => {
    const hosted = mountMap();
    open('backbone:t1:b1');
    const field = typeInto('Kept');
    pressEscape();
    const entity = panelName();
    act(() => field.blur());
    expect({ entity, a: descOf(hosted.product, 't1', 'b1') }).toStrictEqual({ entity: 'Backbone A', a: 'Kept' });
  });
});
