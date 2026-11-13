// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import SizingView from '../pages/SizingView';
import type { Product, Size } from '../types';
import { mountHosted } from './fixtures/productHost';
import type { HostedProduct } from './fixtures/productHost';
import { makeProduct, makeRib, ribOf } from './fixtures/progressIntegrity';
import { req } from './testHelpers';

/**
 * The Sizing tab's edit dialog holds the size it opened with. Before v0.55.3 it sent
 * that size on every Save, so when the rib's size changed while the dialog was open
 * (a drag on the board, a collaborator, Connect AI), a Save that changed only the name
 * wrote the old size back over the newer one. It now sends a size only when the
 * person changed it in the dialog.
 *
 * Driven through the real `SizingView`, the real dialog and the real `updateRib`.
 * `hosted.replace` is the change that arrives from outside while the dialog is open.
 */

afterEach(cleanup);

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

function mount(size: Size = 'L'): HostedProduct {
  return mountHosted(SizingView, makeProduct([makeRib('r', [], [], size)]));
}

function openDialog() {
  fireEvent.click(req(document.querySelector<HTMLElement>('[data-rib-id="r"]'), 'card r'));
  screen.getByRole('heading', { name: 'Edit Rib Item' });
}

function rename(to: string) {
  const input = req(document.querySelector<HTMLInputElement>('input[name="ribName"]'), 'name field');
  fireEvent.change(input, { target: { value: to } });
}

/**
 * Open the dialog's size picker (its button shows `current`) and choose `option`: a size
 * label, whose row reads "M20 pts", or `null` for "Clear size".
 */
function pick(current: string, option: string | null) {
  fireEvent.click(screen.getByRole('button', { name: current }));
  const row = option === null ? /^Clear size$/ : new RegExp(`^${option}\\s*\\d+ pts$`);
  fireEvent.click(screen.getByRole('button', { name: row }));
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

const setSize = (size: Size) => (prev: Product): Product => ({
  ...prev,
  themes: prev.themes.map(t => ({
    ...t,
    backboneItems: t.backboneItems.map(b => ({
      ...b,
      ribItems: b.ribItems.map(r => (r.id === 'r' ? { ...r, size } : r)),
    })),
  })),
});

describe('a size that changes while the dialog is open', () => {
  it('survives a Save that changed only the name', () => {
    const hosted = mount('L');
    openDialog();
    hosted.replace(setSize('M'));
    rename('renamed');
    save();

    const rib = ribOf(hosted.product, 'r');
    expect(rib.name).toBe('renamed');
    expect(rib.size).toBe('M');
  });

  it('survives a Save that changed nothing', () => {
    const hosted = mount('L');
    openDialog();
    hosted.replace(setSize(null));
    save();

    expect(ribOf(hosted.product, 'r').size).toBeNull();
  });

  it('gives way to a size the person chose in the dialog', () => {
    const hosted = mount('L');
    openDialog();
    hosted.replace(setSize('M'));
    pick('L', null);
    save();

    expect(ribOf(hosted.product, 'r').size).toBeNull();
  });
});

describe('a size chosen in the dialog', () => {
  it('is saved', () => {
    const hosted = mount('L');
    openDialog();
    pick('L', 'M');
    save();

    expect(ribOf(hosted.product, 'r').size).toBe('M');
  });

  it('is saved when the dialog opened on an unsized rib', () => {
    const hosted = mount(null);
    openDialog();
    pick('Size?', 'L');
    save();

    expect(ribOf(hosted.product, 'r').size).toBe('L');
  });

  it('is cleared when the person clears it', () => {
    const hosted = mount('L');
    openDialog();
    pick('L', null);
    save();

    expect(ribOf(hosted.product, 'r').size).toBeNull();
  });
});
