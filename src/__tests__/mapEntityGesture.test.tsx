// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/react';
import {
  advance, at, card, grip, installMapTestEnv, mapContainer, mountMap, nameEl, panel, panelName,
  ribPanelOpen, setupUser,
} from './fixtures/mapEntityHarness';

/**
 * Opening a theme or backbone panel from its name on the Map tab: a single click opens
 * it 200 ms later, a double click renames instead. One pending open at a time, owned by
 * `useMapSelection`. Each test is driven so that one mechanism alone stands between the
 * user and the failure: `fireEvent.click` where a `pointerdown` would cancel the pending
 * open by a second route, `userEvent` where the press itself is the subject.
 */

installMapTestEnv();

describe('a single click on a name', () => {
  it.each([
    ['theme', 'theme:t1', 'Theme One'],
    ['backbone', 'backbone:t1:b1', 'Backbone A'],
  ])('opens the %s panel at 200 ms, not before', async (_kind, key, heading) => {
    const user = setupUser();
    mountMap();
    await user.click(nameEl(key));
    advance(199);
    const at199 = panelName();
    advance(1);
    expect({ at199, at200: panelName() }).toStrictEqual({ at199: null, at200: heading });
  });
});

describe('a double click on a name', () => {
  it.each([
    ['theme', 'theme:t1', 'themeName'],
    ['backbone', 'backbone:t1:b1', 'backboneName'],
  ])('starts the %s rename and opens no panel', async (_kind, key, inputName) => {
    const user = setupUser();
    mountMap();
    await user.dblClick(nameEl(key));
    advance(500);
    const renaming = nameEl(key).querySelector(`input[name="${inputName}"]`) !== null;
    expect({ renaming, panel: panelName() }).toStrictEqual({ renaming: true, panel: null });
  });
});

describe('what arms the pending open', () => {
  it('a press that travels 20 px before its release arms nothing', () => {
    mountMap();
    const name = nameEl('backbone:t1:b1');
    fireEvent.pointerDown(name, { clientX: 100, clientY: 50, button: 0, pointerId: 1 });
    fireEvent.pointerMove(name, { clientX: 120, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(name, { clientX: 120, clientY: 50, button: 0, pointerId: 1 });
    fireEvent.click(name, { clientX: 120, clientY: 50, button: 0 });
    advance(300);
    expect(panelName()).toBeNull();
  });

  it('a second click on the same name while pending is ignored: the first click times the open', () => {
    mountMap();
    fireEvent.click(nameEl('theme:t1'));
    advance(150);
    fireEvent.click(nameEl('theme:t1'));
    advance(50);
    expect(panelName()).toBe('Theme One');
  });

  it('a click on another name replaces the pending open: the last name wins', () => {
    mountMap();
    fireEvent.click(nameEl('backbone:t1:b1'));
    advance(100);
    fireEvent.click(nameEl('backbone:t1:b2'));
    advance(100);
    const whenTheFirstWouldHaveOpened = panelName();
    advance(100);
    expect({ whenTheFirstWouldHaveOpened, final: panelName() }).toStrictEqual({
      whenTheFirstWouldHaveOpened: null, final: 'Backbone B',
    });
  });
});

describe('what cancels or blocks the pending open', () => {
  it('another selection: a rib card clicked at 100 ms keeps the rib panel', () => {
    mountMap();
    fireEvent.click(nameEl('backbone:t1:b1'));
    advance(100);
    fireEvent.click(card('r1'));
    advance(200);
    expect({ rib: ribPanelOpen(), entity: panelName() }).toStrictEqual({ rib: true, entity: null });
  });

  it('a press in the map: panning the canvas at 100 ms opens nothing', () => {
    mountMap();
    fireEvent.click(nameEl('theme:t1'));
    advance(100);
    const canvas = mapContainer();
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: 400, button: 0, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 440, clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 440, clientY: 400, button: 0, pointerId: 1 });
    advance(200);
    expect(panelName()).toBeNull();
  });

  it('a press inside the open panel keeps that panel, though another name was clicked', () => {
    mountMap();
    fireEvent.click(nameEl('backbone:t1:b1'));
    advance(200);
    fireEvent.click(nameEl('backbone:t1:b2'));
    advance(100);
    fireEvent.pointerDown(panel() as HTMLElement, { button: 0, pointerId: 1 });
    advance(200);
    expect(panelName()).toBe('Backbone A');
  });

  it('a drag armed before the click and still held: the open does nothing', () => {
    mountMap();
    fireEvent.pointerDown(grip('backbone:t1:b2'), at(10, 60, 1));
    fireEvent.click(nameEl('backbone:t1:b1'));
    advance(300);
    expect(panelName()).toBeNull();
  });

  it('a drag armed before the click but let go before it fires: the open reads the drag live, and opens', () => {
    mountMap();
    fireEvent.pointerDown(grip('backbone:t1:b2'), at(10, 60, 1));
    fireEvent.click(nameEl('backbone:t1:b1'));
    advance(100);
    fireEvent.pointerUp(mapContainer(), at(10, 60, 1));
    advance(100);
    expect(panelName()).toBe('Backbone A');
  });
});
