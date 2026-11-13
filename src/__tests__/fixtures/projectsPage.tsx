// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Shared fixtures for the Projects dashboard tests (v0.55.0): projects built in memory and
// written straight into localStorage, so the real local driver reads them; the page rendered
// with the routes it needs. Each test file still declares its own `vi.mock`s (they are hoisted
// per file), and hands their mutable state in here.

import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProductList from '../../pages/ProductList';
import ProductLayout from '../../components/layout/ProductLayout';
import StructureView from '../../pages/StructureView';
import { createNewProduct, flushPendingSaves } from '../../lib/storage';
import type { MemberRole, Product, RibItem, Size } from '../../types';

export interface ProjectSpec {
  id: string;
  name: string;
  description?: string;
  /** Ribs, each sized M (20 points) and allocated 100% to the first release (one is added if none). */
  items?: number;
  /** Of `items`, how many have no size. */
  unsizedItems?: number;
  releases?: number;
  sprints?: number;
  /** Ribs (beyond `items`) holding progress on a release they are no longer allocated to. */
  stranded?: number;
  owner?: string;
  members?: Record<string, MemberRole>;
}

function rib(id: string, size: Size, releaseId: string | null): RibItem {
  return {
    id, name: `Rib ${id}`, description: '', order: 1, size, category: 'core', notes: '',
    releaseAllocations: releaseId ? [{ releaseId, percentage: 100 }] : [],
    progressHistory: [],
  };
}

/** A project with exactly the figures a tile's lines read. */
export function makeProject(spec: ProjectSpec): Product {
  const base = createNewProduct(spec.name, spec.description ?? '', 'ws-test');
  const needsRelease = (spec.items ?? 0) > 0 || (spec.stranded ?? 0) > 0;
  const releaseCount = Math.max(spec.releases ?? 0, needsRelease ? (spec.stranded ? 2 : 1) : 0);
  const sprintCount = Math.max(spec.sprints ?? 0, spec.stranded ? 1 : 0);
  const releases = Array.from({ length: releaseCount }, (_, i) => ({
    id: `${spec.id}-R${i + 1}`, name: `Release ${i + 1}`, order: i + 1, description: '', targetDate: null,
  }));
  const sprints = Array.from({ length: sprintCount }, (_, i) => ({
    id: `${spec.id}-S${i + 1}`, name: `Sprint ${i + 1}`, order: i + 1, endDate: null,
  }));
  const r1 = releases[0]?.id ?? null;
  const ribs: RibItem[] = Array.from({ length: spec.items ?? 0 }, (_, i) =>
    rib(`${spec.id}-r${i}`, i < (spec.unsizedItems ?? 0) ? null : 'M', r1));
  for (let i = 0; i < (spec.stranded ?? 0); i++) {
    const r = rib(`${spec.id}-x${i}`, 'M', r1);
    r.progressHistory = [{ sprintId: sprints[0]!.id, releaseId: releases[1]!.id, percentComplete: 50 }];
    ribs.push(r);
  }
  const product: Product = {
    ...base,
    id: spec.id,
    releases,
    sprints,
    themes: ribs.length === 0 ? [] : [{
      id: `${spec.id}-t`, name: 'Theme', order: 1, description: '',
      backboneItems: [{ id: `${spec.id}-b`, name: 'Backbone', order: 1, description: '', ribItems: ribs }],
    }],
  };
  if (spec.owner !== undefined) product._owner = spec.owner;
  if (spec.members !== undefined) product._members = spec.members;
  return product;
}

/** Write projects where the real local driver reads them, in this order, with an optional saved order. */
export function seedLocal(products: Product[], projectOrder?: string[]) {
  for (const p of products) localStorage.setItem(`rp:local:product_${p.id}`, JSON.stringify(p));
  localStorage.setItem('rp:local:products_index', JSON.stringify(products.map(p => ({ id: p.id, name: p.name }))));
  if (projectOrder) localStorage.setItem('rp:local:preferences', JSON.stringify({ projectOrder }));
}

/** The stored project, as the local driver wrote it. */
export function stored(id: string): Product | null {
  flushPendingSaves();
  const raw = localStorage.getItem(`rp:local:product_${id}`);
  return raw ? (JSON.parse(raw) as Product) : null;
}

/** The persisted project order. */
export function storedOrder(): string[] | undefined {
  flushPendingSaves();
  const raw = localStorage.getItem('rp:local:preferences');
  return raw ? (JSON.parse(raw) as { projectOrder?: string[] }).projectOrder : undefined;
}

/** The Projects page, with Structure behind it: a stub, or the real page. */
export function renderPage(structure: 'stub' | 'real' = 'stub') {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<ProductList />} />
        <Route path="/product/:productId" element={<ProductLayout />}>
          <Route path="structure" element={structure === 'stub' ? <p>Structure page</p> : <StructureView />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** The tiles, in document order. */
export function tiles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-tile="true"]'));
}

/** The project names, in tile order. */
export function tileNames(): string[] {
  return tiles().map(t => t.querySelector('h3')?.textContent ?? '');
}

/** A tile's lines: its `p` elements' text. */
export function tileLines(tile: HTMLElement): string[] {
  return Array.from(tile.querySelectorAll('p')).map(p => p.textContent ?? '');
}

/** The ids `aria-describedby` names, resolved to their text. */
export function describedText(el: Element): string {
  return (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/).filter(Boolean)
    .map(id => document.getElementById(id)?.textContent ?? `<missing ${id}>`)
    .join(' | ');
}

/** jsdom implements neither: `useDarkMode` reads one, the new tile is scrolled into view with the other. */
export function installPageEnv(vi: { stubGlobal: (name: string, value: unknown) => void }) {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function scrollIntoView() {};
}
