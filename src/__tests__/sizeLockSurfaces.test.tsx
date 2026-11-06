// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { screen, cleanup, fireEvent } from '@testing-library/react';
import StoryMapView from '../pages/StoryMapView';
import StructureView from '../pages/StructureView';
import type { Product, ProgressEntry, ReleaseAllocation, Size } from '../types';
import { mountHosted } from './fixtures/productHost';
import type { HostedProduct } from './fixtures/productHost';
import { entry, makeProduct, makeRib, ribOf } from './fixtures/progressIntegrity';

/**
 * The size lock on the two surfaces outside Sizing, driven through the real pages,
 * because each page is what hands the rib and its sprints to the surface.
 *
 * ⚠️ THE OWNER RULED (2026-11-06): one lock everywhere, with no exception for a rib
 * that has no size yet. A resize rewrites closed sprints: M to L moved a closed
 * sprint's done points from 1.5 to 2.4 in the Forecaster data, with no warning.
 *
 * Every surface must also keep its picker on a rib that is NOT locked, so a test
 * here cannot pass by the picker having vanished for everyone.
 */

vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ driver: null, mode: 'local', storageReady: true }) }));

afterEach(cleanup);

beforeAll(() => {
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

let hosted: HostedProduct;

const mountStructure = (product: Product) => { hosted = mountHosted(StructureView, product); };

/** The panel opens from a card, as a user opens it. A split rib has a card per share; this takes the first. */
const mountMapPanel = (product: Product) => {
  hosted = mountHosted(StoryMapView, product);
  fireEvent.click(document.querySelector('[data-rib-id="r"]') as HTMLElement);
};

const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });
const rib = (allocations: ReleaseAllocation[], history: ProgressEntry[], size: Size = 'L') =>
  makeProduct([makeRib('r', allocations, history, size)]);

/** Locked by S2: the latest sprint reads 0, so only the sprint's name explains it. */
const LOCKED = [entry('S1', 'R1', 10), entry('S2', 'R1', 20), entry('S3', 'R1', 0)];
const NOTE = 'Size locked: progress recorded in S2';

const picker = (label: string) => screen.queryByRole('button', { name: label });
const pickSize = (from: string, to: RegExp) => {
  fireEvent.click(picker(from) as HTMLElement);
  fireEvent.click(screen.getByRole('button', { name: to }));
};

describe.each([
  ['Structure', mountStructure],
  ['the Map panel', mountMapPanel],
])('%s', (_surface, mount) => {
  it('offers no picker on a locked rib, and names the sprint that locks it', () => {
    mount(rib([on('R1')], LOCKED));
    expect(picker('L')).toBeNull();
    expect(screen.getByTitle(NOTE).textContent).toBe('Llocked');
  });

  it('opens nothing and writes nothing when the locked size is clicked', () => {
    mount(rib([on('R1')], LOCKED));
    fireEvent.click(screen.getByTitle(NOTE));
    expect(screen.queryByRole('button', { name: 'Clear size' })).toBeNull();
    expect(hosted.writes).toBe(0);
    expect(ribOf(hosted.product, 'r').size).toBe('L');
  });

  it('locks a rib with progress but no size yet, by the owner\'s ruling', () => {
    mount(rib([on('R1')], LOCKED, null));
    expect(picker('Size?')).toBeNull();
    expect(screen.getByTitle(NOTE).textContent).toBe('—locked');
  });

  it('locks a split rib from progress on either of its releases', () => {
    mount(rib([on('R1', 60), on('R2', 40)], [entry('S1', 'R2', 10)]));
    expect(picker('L')).toBeNull();
    expect(screen.getByTitle('Size locked: progress recorded in S1')).toBeTruthy();
  });

  it('keeps the picker on a rib with no progress, and a pick still writes', () => {
    mount(rib([on('R1')], []));
    pickSize('L', /^M/);
    expect(ribOf(hosted.product, 'r').size).toBe('M');
    expect(hosted.writes).toBe(1);
  });

  it('keeps the picker on a rib whose only progress is on a release it left', () => {
    mount(rib([on('R1')], [entry('S1', 'R2', 30)]));
    expect(picker('L')).toBeTruthy();
    expect(screen.queryByTitle(/Size locked/)).toBeNull();
  });

  it('keeps the picker on a rib parked in Unassigned, which locks nothing', () => {
    mount(rib([], [entry('S1', 'R1', 30)]));
    pickSize('L', /^M/);
    expect(ribOf(hosted.product, 'r').size).toBe('M');
  });
});
