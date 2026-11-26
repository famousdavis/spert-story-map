// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * N2 (FRAME26, v0.57.0): the frame's navigation row, on every kind of route.
 *
 * William's decision (2026-11-26, contract §2): "Products" is the first item on every screen, and inside a product its
 * seven tabs follow it, Structure · Releases · Map · Sizing · Progress · Insights · Product Settings, then
 * Settings · About · Help Center. The product tab is the current page; "Products" is then a plain link back. At most
 * one item is current; none on a screen no item leads to (the changelog, a 404). Settings opens the app's Settings
 * dialog and is never current (D9). The tabs are text only (D3). The row sticks inside a product (X3).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppNav from '../components/layout/AppNav';
import { req } from './testHelpers';

afterEach(cleanup);

const TABS = ['Structure', 'Releases', 'Map', 'Sizing', 'Progress', 'Insights', 'Product Settings'];
const HELP = 'Help Center (opens in a new tab)';

function renderAt(path: string, onOpenSettings = () => {}) {
  render(<MemoryRouter initialEntries={[path]}><AppNav onOpenSettings={onOpenSettings} /></MemoryRouter>);
  const nav = req(document.querySelector<HTMLElement>('[data-sf="nav"]'), 'nav');
  const work = req(nav.querySelector<HTMLElement>('[data-sf="nav-work"]'), 'work zone');
  const app = req(nav.querySelector<HTMLElement>('[data-sf="nav-app"]'), 'app zone');
  const names = (zone: HTMLElement) => Array.from(zone.children).map(e => e.textContent?.replace(/\s+/g, ' ').trim());
  const current = Array.from(nav.querySelectorAll('[aria-current]'));
  return { nav, work, app, names, current };
}

describe('the navigation row (contract §3 and §2, 2026-11-26)', () => {
  it('on Products: Products is the one work item and the current page', () => {
    const { work, app, names, current } = renderAt('/');
    expect(names(work)).toEqual(['Products']);
    expect(names(app)).toEqual(['Settings', 'About', 'Help Center ↗ (opens in a new tab)']);
    expect(current.map(e => [e.textContent, e.getAttribute('aria-current')])).toEqual([['Products', 'page']]);
  });

  it('on About: About is the current page', () => {
    const { current } = renderAt('/about');
    expect(current.map(e => e.textContent)).toEqual(['About']);
  });

  it.each(['/changelog', '/no-such-page', '/product/p1/no-such-tab'])('on %s: no item is current, and no product tabs', path => {
    const { work, names, current } = renderAt(path);
    expect(current).toEqual([]);
    expect(names(work)).toEqual(['Products']);
  });

  it.each([
    ['structure', 'Structure'], ['releases', 'Releases'], ['storymap', 'Map'], ['sizing', 'Sizing'],
    ['progress', 'Progress'], ['insights', 'Insights'], ['settings', 'Product Settings'],
  ])('inside a product on %s: Products, then the seven tabs; the tab "%s" is the one current page', (path, label) => {
    const { work, names, current } = renderAt(`/product/p1/${path}`);
    expect(names(work)).toEqual(['Products', ...TABS]);
    expect(current.map(e => [e.textContent, e.getAttribute('aria-current')])).toEqual([[label, 'page']]);
    const links = Array.from(work.querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(links).toEqual(['/', ...['structure', 'releases', 'storymap', 'sizing', 'progress', 'insights', 'settings'].map(t => `/product/p1/${t}`)]);
  });

  it('a product\'s index route marks Structure, where it redirects', () => {
    expect(renderAt('/product/p1').current.map(e => e.textContent)).toEqual(['Structure']);
  });

  it('reads routes as React Router does, without regard to case', () => {
    expect(renderAt('/About').current.map(e => e.textContent)).toEqual(['About']);
    cleanup();
    expect(renderAt('/PRODUCT/p1/StoryMap').current.map(e => e.textContent)).toEqual(['Map']);
  });

  it('every item is a plain `.sf-tab` (the stylesheet draws the current one), and no name carries a glyph', () => {
    const { work, app } = renderAt('/product/p1/structure');
    for (const el of [...Array.from(work.children), ...Array.from(app.children).slice(0, 2)]) {
      expect(el.getAttribute('class'), el.textContent ?? '').toBe('sf-tab');
      expect(el.textContent, 'text only (D3)').toMatch(/^[A-Za-z ]+$/);
      if (el.getAttribute('aria-current') !== null) expect(el.getAttribute('aria-current')).toBe('page');
    }
  });

  it('Settings is a button that opens the app\'s Settings dialog, never current (D9)', () => {
    const open = vi.fn();
    const { app } = renderAt('/', open);
    const settings = within(app).getByRole('button', { name: 'Settings' });
    expect(settings.getAttribute('aria-current')).toBeNull();
    fireEvent.click(settings);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('Help Center is the last element, never current, and leaves the app in a new tab', () => {
    const { app } = renderAt('/product/p1/insights');
    const help = within(app).getByRole('link', { name: HELP });
    expect(app.lastElementChild).toBe(help);
    expect(help.getAttribute('aria-current')).toBeNull();
    expect(help.getAttribute('target')).toBe('_blank');
  });

  it('sticks inside a product only (X3)', () => {
    for (const [path, sticky] of [['/', false], ['/about', false], ['/changelog', false], ['/product/p1/structure', true], ['/product/p1/storymap', true], ['/nope', false]] as const) {
      const { nav } = renderAt(path);
      expect(nav.className.split(/\s+/).includes('sf-nav--sticky'), path).toBe(sticky);
      expect(nav.className.split(/\s+/)).toContain('sf-nav');
      cleanup();
    }
  });

  it('the Products item takes the person to the top of the page, as "← Products" did', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    renderAt('/product/p1/structure');
    fireEvent.click(screen.getByRole('link', { name: 'Products' }));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    vi.unstubAllGlobals();
  });
});
