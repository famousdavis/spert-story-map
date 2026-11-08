// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * The project-list toolbar (v0.53.31): one order, one set of words and icons
 * across the SPERT® Suite, matching GanttApp's `ProjectsToolbar`.
 *
 * Runs the real page on the real local driver. The icon paths are restated
 * here on purpose: they are GanttApp's, and a change to the component's copy
 * must fail this file rather than pass because it reads the same constant.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { createSampleProduct } from '../lib/sampleData';
import ProductList from '../pages/ProductList';

const GANTT_ICON_PATHS = {
  export: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  import: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  sample: 'M9 3h6M10 3v6.5L4.6 18.8A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3M7.2 15h9.6',
  plus: 'M12 5v14M5 12h14',
};

/** Visible label, the start of its accessible name, and its icon, left to right. */
const EXPECTED = [
  { label: 'Export All', name: 'Export all projects as JSON', icon: GANTT_ICON_PATHS.export },
  { label: 'Import', name: 'Import projects from JSON', icon: GANTT_ICON_PATHS.import },
  { label: 'Load Sample', name: 'Load Sample', icon: GANTT_ICON_PATHS.sample },
  { label: 'New Project', name: 'New Project', icon: GANTT_ICON_PATHS.plus },
];

const driver = createLocalStorageDriver();

function seedProject() {
  const p = createSampleProduct();
  localStorage.setItem(`rp:local:product_${p.id}`, JSON.stringify(p));
  localStorage.setItem('rp:local:products_index', JSON.stringify([{ id: p.id, name: p.name }]));
  return p;
}

/** The toolbar's buttons: the button siblings of the `Projects` heading's row. */
function toolbarButtons(): HTMLButtonElement[] {
  const heading = screen.getByRole('heading', { level: 2, name: 'Projects' });
  const row = heading.parentElement!;
  return within(row).getAllByRole('button') as HTMLButtonElement[];
}

const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

beforeEach(() => {
  localStorage.clear();
  storage.value = { driver, mode: 'local', storageReady: true };
  // jsdom has no matchMedia, and `useDarkMode` reads it.
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('project list toolbar', () => {
  it('shows Export All · Import · Load Sample · New Project, in that order, beside a Projects heading', async () => {
    render(<MemoryRouter><ProductList /></MemoryRouter>);
    await screen.findByText('No projects yet');
    const buttons = toolbarButtons();
    expect(buttons.map(b => b.textContent)).toEqual(EXPECTED.map(e => e.label));
  });

  it('gives each button an accessible name that begins with its visible label', async () => {
    render(<MemoryRouter><ProductList /></MemoryRouter>);
    await screen.findByText('No projects yet');
    for (const [i, button] of toolbarButtons().entries()) {
      const want = EXPECTED[i]!;
      const name = button.getAttribute('aria-label') ?? button.textContent ?? '';
      expect(name).toBe(want.name);
      expect(name.toLowerCase().startsWith(want.label.toLowerCase())).toBe(true);
    }
  });

  it('puts GanttApp\'s icon, 18 px and hidden from assistive tech, before each label', async () => {
    render(<MemoryRouter><ProductList /></MemoryRouter>);
    await screen.findByText('No projects yet');
    for (const [i, button] of toolbarButtons().entries()) {
      const svgs = button.querySelectorAll('svg');
      expect(svgs).toHaveLength(1);
      const svg = svgs[0]!;
      expect(button.firstChild).toBe(svg);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('width')).toBe('18');
      expect(svg.getAttribute('height')).toBe('18');
      const path = svg.querySelector('path')!;
      expect(path.getAttribute('d')).toBe(EXPECTED[i]!.icon);
      expect(path.getAttribute('stroke')).toBe('currentColor');
      expect(path.getAttribute('stroke-width')).toBe('2.25');
    }
  });

  it('keeps Export All in place but disabled with no projects; the rest stay enabled', async () => {
    render(<MemoryRouter><ProductList /></MemoryRouter>);
    await screen.findByText('No projects yet');
    expect(toolbarButtons().map(b => b.disabled)).toEqual([true, false, false, false]);
  });

  it('enables Export All once there is a project, with the order unchanged', async () => {
    const p = seedProject();
    render(<MemoryRouter><ProductList /></MemoryRouter>);
    await screen.findByText(p.name);
    const buttons = toolbarButtons();
    expect(buttons.map(b => b.textContent)).toEqual(EXPECTED.map(e => e.label));
    expect(buttons.map(b => b.disabled)).toEqual([false, false, false, false]);
  });

  it('sits above the import area, the local-data warning and the list', async () => {
    const p = seedProject();
    render(<MemoryRouter><ProductList /></MemoryRouter>);
    await screen.findByText(p.name);
    const heading = screen.getByRole('heading', { level: 2, name: 'Projects' });
    const fileInput = document.querySelector('input[type="file"]')!;
    const warning = await screen.findByText(/Your data exists only in this browser/);
    expect(follows(heading, fileInput)).toBe(true);
    expect(follows(heading, warning)).toBe(true);
    expect(follows(heading, screen.getByText(p.name))).toBe(true);
  });

  it('keeps Import disabled, with its note, while cloud projects load; every button still renders', async () => {
    const pending = { ...driver, loadProductIndex: () => new Promise<never>(() => {}) };
    storage.value = { driver: pending, mode: 'cloud', storageReady: true };
    render(<MemoryRouter><ProductList /></MemoryRouter>);
    await screen.findByText('Loading projects...');
    const buttons = toolbarButtons();
    expect(buttons.map(b => b.textContent)).toEqual(EXPECTED.map(e => e.label));
    expect(buttons.map(b => b.disabled)).toEqual([true, true, false, false]);
    expect(screen.getByText(/Import will be available once your workspace loads/)).toBeTruthy();
  });

  it('keeps Import disabled while an import applies', async () => {
    const created = new Promise<void>(() => {});
    const blocked = { ...driver, createProduct: () => created };
    storage.value = { driver: blocked, mode: 'local', storageReady: true };
    render(<MemoryRouter><ProductList /></MemoryRouter>);
    await screen.findByText('No projects yet');
    const file = new File([JSON.stringify(createSampleProduct())], 'p.json', { type: 'application/json' });
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, file);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm Import' }));
    await waitFor(() => expect(toolbarButtons()[1]!.disabled).toBe(true));
    expect(toolbarButtons()[1]!.textContent).toBe('Import');
  });
});
