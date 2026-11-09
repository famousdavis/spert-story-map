// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * The two app-wide notices (v0.53.32): the terms notice and the local-storage
 * caution, on every page, directly below the page header.
 *
 * Runs the real pages on the real local driver, through a router, because the
 * caution's dismissal has to survive navigation between pages that each mount
 * it, and a test of the component alone cannot see that.
 * `resetLocalCaution()` stands in for a page load: it clears module memory and
 * nothing else, so a dismissal kept in storage would wrongly survive it.
 */

import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: false }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { createSampleProduct } from '../lib/sampleData';
import { resetLocalCaution } from '../lib/localCaution';
import { flushPendingSaves } from '../lib/storage';
import { FIRST_RUN_SEEN_KEY } from '../lib/tosConstants';
import ProductList from '../pages/ProductList';
import ProductLayout from '../components/layout/ProductLayout';
import AboutView from '../pages/AboutView';
import ChangelogView from '../pages/ChangelogView';
import type { StorageDriver } from '../types';

const TERMS = /SPERT® Suite web apps are free to use/;
const CAUTION = /Your data exists only in this browser/;

const driver = createLocalStorageDriver();
const nav: { current: NavigateFunction | null } = { current: null };

function Nav() {
  const navigate = useNavigate();
  useEffect(() => { nav.current = navigate; }, [navigate]);
  return null;
}

function seedProject() {
  const p = createSampleProduct();
  localStorage.setItem(`rp:local:product_${p.id}`, JSON.stringify(p));
  localStorage.setItem('rp:local:products_index', JSON.stringify([{ id: p.id, name: p.name }]));
  return p;
}

function renderApp(at = '/') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Nav />
      <Routes>
        <Route path="/" element={<ProductList />} />
        <Route path="/about" element={<AboutView />} />
        <Route path="/changelog" element={<ChangelogView />} />
        <Route path="/product/:productId" element={<ProductLayout />}>
          <Route path="structure" element={<p>Structure page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const go = (path: string) => act(() => { void nav.current!(path); });
const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
/** One render pass after the preferences promise has had every chance to resolve. */
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  storage.value = { driver, mode: 'local', storageReady: true };
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('## Version 0.0.1 (2026-01-01)')));
});

afterEach(() => {
  cleanup();
  flushPendingSaves();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('terms notice', () => {
  it('shows on a first visit, and "Got it" dismisses it for good', async () => {
    renderApp();
    const terms = await screen.findByText(TERMS);
    const card = terms.closest('div')!;
    await userEvent.click(card.querySelector('button')!);
    expect(screen.queryByText(TERMS)).toBeNull();
    expect(localStorage.getItem(FIRST_RUN_SEEN_KEY)).toBe('true');
    cleanup();
    resetLocalCaution();
    renderApp();
    await screen.findByText(CAUTION);
    expect(screen.queryByText(TERMS)).toBeNull();
  });

  it('links to the suite Terms of Service and Privacy Policy', async () => {
    renderApp();
    const card = (await screen.findByText(TERMS)).closest('div')!;
    expect(within(card).getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('https://spertsuite.com/TOS.pdf');
    expect(within(card).getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('https://spertsuite.com/PRIVACY.pdf');
  });
});

describe('local-storage caution', () => {
  it('shows in local mode, below the terms notice', async () => {
    renderApp();
    const caution = await screen.findByText(CAUTION);
    expect(follows(screen.getByText(TERMS), caution)).toBe(true);
  });

  it('never shows in cloud mode, and does not read preferences there', async () => {
    const loadPreferences = vi.fn(driver.loadPreferences);
    storage.value = { driver: { ...driver, loadPreferences }, mode: 'cloud', storageReady: true };
    renderApp('/about');
    await screen.findByText(TERMS);
    await settle();
    expect(screen.queryByText(CAUTION)).toBeNull();
    expect(loadPreferences).not.toHaveBeenCalled();
  });

  it('stays hidden until preferences load, so a user who turned it off never sees it flash', async () => {
    const pending: StorageDriver = { ...driver, loadPreferences: () => new Promise(() => {}) };
    storage.value = { driver: pending, mode: 'local', storageReady: true };
    renderApp('/about');
    await screen.findByText(TERMS);
    await settle();
    expect(screen.queryByText(CAUTION)).toBeNull();
  });

  it('does not show when Settings has turned it off', async () => {
    localStorage.setItem('rp:local:preferences', JSON.stringify({ suppressLocalStorageWarning: true }));
    renderApp('/about');
    await screen.findByText(TERMS);
    await settle();
    expect(screen.queryByText(CAUTION)).toBeNull();
  });

  it('"Got it" holds across navigation: list, project, About, Changelog, list', async () => {
    const p = seedProject();
    renderApp();
    const caution = await screen.findByText(CAUTION);
    await userEvent.click(caution.closest('div')!.querySelector('button')!);
    expect(screen.queryByText(CAUTION)).toBeNull();

    go(`/product/${p.id}/structure`);
    await screen.findByText('Structure page');
    go('/about');
    await screen.findByText('About This App');
    go('/changelog');
    await screen.findByText('Changelog');
    go('/');
    await screen.findByText(p.name);
    await settle();
    expect(screen.queryByText(CAUTION)).toBeNull();
  });

  it('comes back on the next page load', async () => {
    renderApp('/about');
    const caution = await screen.findByText(CAUTION);
    await userEvent.click(caution.closest('div')!.querySelector('button')!);
    expect(screen.queryByText(CAUTION)).toBeNull();
    cleanup();
    resetLocalCaution();
    renderApp('/about');
    expect(await screen.findByText(CAUTION)).toBeTruthy();
  });

  it('the Settings switch hides it at once, and turning it back on shows it again', async () => {
    renderApp();
    await screen.findByText(CAUTION);
    await userEvent.click(screen.getAllByTitle('App Settings')[0]!);
    const toggle = await screen.findByRole('switch', { name: 'Warn me on startup when using local storage' });
    expect(toggle.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(toggle.getAttribute('aria-describedby')!)?.textContent)
      .toBe('Shows a caution banner each time the app opens while your data is stored locally in this browser.');

    await userEvent.click(toggle);
    expect(screen.queryByText(CAUTION)).toBeNull();
    await userEvent.click(toggle);
    expect(screen.getByText(CAUTION)).toBeTruthy();
  });
});

describe('wording', () => {
  // A.5.1 of the campaign brief: the suite's exact words, in every app.
  const norm = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

  it('both notices read exactly as the suite words them', async () => {
    renderApp('/about');
    const caution = await screen.findByText(CAUTION);
    expect(norm(screen.getByText(TERMS).closest('p')!.textContent)).toBe(
      'SPERT® Suite web apps are free to use. No account is required to use them. '
      + 'By accessing or using this app, you agree to our Terms of Service and Privacy Policy. '
      + "If you choose to enable optional Cloud Storage, you'll be asked to explicitly confirm your agreement.",
    );
    const p = caution.closest('p')!;
    expect(norm(p.textContent)).toBe(
      'Your data exists only in this browser and can be lost without warning. '
      + 'Export at the end of every session to protect your work.',
    );
    expect(p.querySelector('strong')?.textContent).toBe('Your data exists only in this browser');
  });
});

describe('placement on every page', () => {
  it('a project page shows both notices below its header and above its content', async () => {
    const p = seedProject();
    renderApp(`/product/${p.id}/structure`);
    const content = await screen.findByText('Structure page');
    const caution = await screen.findByText(CAUTION);
    const terms = screen.getByText(TERMS);
    const header = document.querySelector('header')!;
    expect(follows(header, terms)).toBe(true);
    expect(follows(terms, caution)).toBe(true);
    expect(follows(caution, content)).toBe(true);
  });

  it.each([['/about', 'About This App'], ['/changelog', 'Changelog']])(
    '%s shows both, after its back link and before its heading',
    async (path, title) => {
      renderApp(path);
      const caution = await screen.findByText(CAUTION);
      const terms = screen.getByText(TERMS);
      const back = screen.getByRole('link', { name: /← Back/ });
      const heading = screen.getByRole('heading', { level: 1, name: title });
      expect(follows(back, terms)).toBe(true);
      expect(follows(terms, caution)).toBe(true);
      expect(follows(caution, heading)).toBe(true);
    },
  );

  it('each notice is a card with an outlined "Got it" in its own colour', async () => {
    renderApp('/about');
    const caution = await screen.findByText(CAUTION);
    for (const [text, colour] of [[screen.getByText(TERMS), 'blue'], [caution, 'amber']] as const) {
      const card = text.closest('div')!;
      expect(card.className).toContain('rounded-lg');
      expect(card.className).toContain(`border-${colour}-200`);
      expect(text.closest('p')!.className).toContain('text-sm');
      const button = card.querySelector('button')!;
      expect(button.textContent).toBe('Got it');
      expect(button.className).toContain(`border-${colour}-300`);
    }
  });
});
