// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
// v0.55.9 (BRIEF_product-rename-v3 D4, D5, D8, D12): the product wording through the real pages:
// R31's definition on the welcome panel and under New Product's name field, the ways home, About,
// and the Progress and Insights figures that now say "Overall".
import type React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import { resetLocalCaution } from '../lib/localCaution';
import { createSampleProduct } from '../lib/sampleData';
import AboutView from '../pages/AboutView';
import ChangelogView from '../pages/ChangelogView';
import InsightsView from '../pages/InsightsView';
import ProgressTrackingView from '../pages/ProgressTrackingView';
import type { Product } from '../types';
import { req } from './testHelpers';
import { describedText, installPageEnv, makeProject, renderPage, seedLocal } from './fixtures/projectsPage';

// R31's words, written out here rather than imported: a typo in the shared constant must fail.
const R31 = 'A product can be an application, a service, an internal capability or any other initiative.';

const driver = createLocalStorageDriver();
const squash = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  storage.value = { driver, mode: 'local', storageReady: true };
  installPageEnv(vi);
});

afterEach(() => {
  cleanup();
  flushPendingSaves();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('R31: what a product is (D12)', () => {
  it('the welcome panel says it in a paragraph of its own, right after the intro', async () => {
    seedLocal([]);
    renderPage();
    const panel = req((await screen.findByRole('heading', { name: 'Welcome to SPERT® Story Map' })).parentElement, 'panel');
    const texts = [...panel.querySelectorAll('p')].map(p => squash(p.textContent));
    expect(texts.indexOf(R31)).toBe(1);
    expect(texts[0]).toMatch(/^Plan releases on a story map/);
  });

  it('New Product says it under the name field, and the field is described by it', async () => {
    seedLocal([]);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'New Product' }));
    const dialog = screen.getByRole('dialog', { name: 'New Product' });
    const input = within(dialog).getByLabelText('Product Name');
    expect(describedText(input)).toBe(R31);
    expect(input.closest('div')?.textContent).toContain(R31);
    // Form names are machine-read and keep their names (D14), which also keeps
    // projectsDashboard.test.tsx's negative pin on this attribute meaningful.
    expect(input).toHaveAttribute('name', 'projectName');
  });

  it('Edit Product does not say it', async () => {
    seedLocal([makeProject({ id: 'p1', name: 'Alpha' })]);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Alpha' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Product' });
    const input = within(dialog).getByLabelText('Product Name');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).toHaveAttribute('name', 'projectName');
    expect(dialog.textContent).not.toContain(R31);
  });
});

describe('the way home (D4)', () => {
  it('About: "← Back to Products"; its purpose is product work; the suite keeps its own word (D8, D9)', () => {
    render(<MemoryRouter><AboutView /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '← Back to Products' })).toHaveAttribute('href', '/');
    const text = squash(document.body.textContent);
    expect(text).toContain('a three-level hierarchy (Theme → Backbone → Rib Item) for organizing product work, with features for:');
    expect(text).toContain('SPERT Story Map is part of the SPERT® suite of project management tools.');
  });

  it('the changelog page: "← Back to Products", as before (B1)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<MemoryRouter><ChangelogView /></MemoryRouter>);
    expect(screen.getByRole('link', { name: '← Back to Products' })).toHaveAttribute('href', '/');
  });
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

describe('the planned work\'s completion says "Overall" (D5, R41)', () => {
  it('the Progress tab header', () => {
    mount(ProgressTrackingView, createSampleProduct());
    expect(squash(document.body.textContent)).toMatch(/Progress Tracking ?Overall: \d+% complete/);
  });

  it('the Insights card', () => {
    mount(InsightsView, createSampleProduct());
    expect(screen.getByRole('heading', { name: 'Overall Progress' })).toBeInTheDocument();
  });
});
