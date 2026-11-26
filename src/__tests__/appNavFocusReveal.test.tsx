// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * S5 (v0.58.0): at 853 px (150 %, exception X6) the navigation's work zone scrolls, and Chrome does not scroll a
 * partly visible focused item into it: measured on v0.57.0, Insights took Tab focus with its right edge 4.4 px outside
 * the zone (its inset focus ring cut). Now a keyboard-focused item partly outside is scrolled fully in, by the hidden
 * amount rounded up to a whole pixel (Chrome keeps scroll offsets whole: 4.4 moved 4), and only the zone moves. A
 * mouse press (not `:focus-visible`) moves nothing, so a tab never shifts under the pointer. jsdom lays nothing out,
 * so the zone's and the items' boxes are given here; the after-probe measures the real thing at 853 px in Chrome.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppNav from '../components/layout/AppNav';
import { req } from './testHelpers';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ZONE = { left: 20, right: 568 };

function mount() {
  render(<MemoryRouter initialEntries={['/product/p1/structure']}><AppNav onOpenSettings={() => {}} /></MemoryRouter>);
  const zone = req(document.querySelector<HTMLElement>('[data-sf="nav-work"]'), 'the work zone');
  const item = (name: string) => req(Array.from(zone.querySelectorAll<HTMLElement>('a')).find(a => a.textContent === name), name);
  const box = (el: HTMLElement, left: number, right: number) =>
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left, right, top: 56, bottom: 100, width: right - left, height: 44, x: left, y: 56, toJSON: () => ({}) } as DOMRect);
  box(zone, ZONE.left, ZONE.right);
  return { zone, item, box };
}
/** Focus `el` as Tab does: `:focus-visible` matches (jsdom cannot tell keyboard from mouse, so it is stated). */
function tabTo(el: HTMLElement, visible = true) {
  const matches = el.matches.bind(el);
  vi.spyOn(el, 'matches').mockImplementation((sel: string) => (sel === ':focus-visible' ? visible : matches(sel)));
  fireEvent.focus(el);
}

describe('a focused navigation item is scrolled fully into the work zone (S5)', () => {
  it('Insights, 4.4 px past the right edge: the zone scrolls right by 5, the hidden amount rounded up', () => {
    const { zone, item, box } = mount();
    const insights = item('Insights');
    box(insights, 496.6, ZONE.right + 4.4);
    tabTo(insights);
    expect(zone.scrollLeft).toBe(5);
  });

  it('an item cut on the left (Shift+Tab back): the zone scrolls left by the hidden amount, rounded up', () => {
    const { zone, item, box } = mount();
    zone.scrollLeft = 144;
    const products = item('Products');
    box(products, ZONE.left - 30.4, ZONE.left + 50);
    tabTo(products);
    expect(zone.scrollLeft).toBe(113);
  });

  it('an item already whole: nothing moves', () => {
    const { zone, item, box } = mount();
    zone.scrollLeft = 10;
    const map = item('Map');
    box(map, 265, 321);
    tabTo(map);
    expect(zone.scrollLeft).toBe(10);
  });

  it('a mouse press (not :focus-visible): nothing moves, so the tab stays under the pointer', () => {
    const { zone, item, box } = mount();
    const insights = item('Insights');
    box(insights, 496.6, ZONE.right + 4.4);
    tabTo(insights, false);
    expect(zone.scrollLeft).toBe(0);
  });

  it('the app zone (Settings, About) is not part of it', () => {
    mount();
    const appZone = req(document.querySelector('[data-sf="nav-app"]'), 'app zone');
    expect(appZone.closest('[data-sf="nav-work"]')).toBeNull();
  });
});
