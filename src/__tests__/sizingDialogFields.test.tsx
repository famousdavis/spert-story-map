// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import SizingView from '../pages/SizingView';
import type { RibItem } from '../types';
import { mountHosted } from './fixtures/productHost';
import type { HostedProduct } from './fixtures/productHost';
import { makeProduct, makeRib, ribOf } from './fixtures/progressIntegrity';
import { changeRib, openDialog, pick, save, type } from './fixtures/sizingDialog';

/**
 * B3 (v0.55.7). The Sizing tab's edit dialog holds the values it opened with. Since
 * v0.55.3 it has sent `size` only when the person changed it there, but it still sent
 * the name, description, category, notes and card color on every Save, so a value that
 * changed while the dialog was open (a drag, a collaborator, Connect AI) was written
 * back over with the opened one. Each field is now sent only when it was changed in
 * the dialog.
 *
 * Driven through the real `SizingView`, the real dialog and the real `updateRib`.
 * `hosted.replace` is the change that arrives from outside while the dialog is open.
 */

afterEach(cleanup);

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

function mount(rib: Partial<RibItem> = {}): HostedProduct {
  return mountHosted(SizingView, makeProduct([{ ...makeRib('r', [], [], 'L'), ...rib }]));
}

interface FieldCase {
  field: 'name' | 'description' | 'category' | 'notes' | 'cardColor';
  /** A newer value, set from outside while the dialog is open. */
  newer: string;
  /** Change the field in the dialog, to `mine`. */
  edit: () => void;
  mine: string;
}

const FIELDS: FieldCase[] = [
  { field: 'name', newer: 'newer name', edit: () => type('ribName', 'my name'), mine: 'my name' },
  { field: 'description', newer: 'newer description', edit: () => type('ribDescription', 'my description'), mine: 'my description' },
  { field: 'category', newer: 'non-core', edit: () => fireEvent.click(screen.getByRole('button', { name: 'Non-core' })), mine: 'non-core' },
  { field: 'notes', newer: 'newer notes', edit: () => type('ribNotes', 'my notes'), mine: 'my notes' },
  { field: 'cardColor', newer: 'rose', edit: () => fireEvent.click(screen.getByRole('button', { name: 'Set color to Sky' })), mine: 'sky' },
];

describe.each(FIELDS)('$field', ({ field, newer, edit, mine }) => {
  it('changed while the dialog is open survives a Save that changed the size', () => {
    const hosted = mount();
    openDialog();
    hosted.replace(changeRib(r => ({ ...r, [field]: newer })));
    pick('L', 'M');
    save();

    const rib = ribOf(hosted.product, 'r');
    expect(rib[field]).toBe(newer);
    expect(rib.size).toBe('M');
  });

  it('changed in the dialog is saved', () => {
    const hosted = mount();
    openDialog();
    edit();
    save();

    expect(ribOf(hosted.product, 'r')[field]).toBe(mine);
  });
});

describe('a card color cleared in the dialog', () => {
  it('is cleared, even when another color arrived while the dialog was open', () => {
    const hosted = mount({ cardColor: 'sky' });
    openDialog();
    hosted.replace(changeRib(r => ({ ...r, cardColor: 'rose' })));
    fireEvent.click(screen.getByRole('button', { name: 'Clear color' }));
    save();

    expect(ribOf(hosted.product, 'r').cardColor).toBeUndefined();
  });
});

describe('a name', () => {
  it('changed in the dialog is saved without the spaces around it', () => {
    const hosted = mount();
    openDialog();
    type('ribName', '  my name  ');
    save();

    expect(ribOf(hosted.product, 'r').name).toBe('my name');
  });

  it('stored with spaces around it, and not changed in the dialog, is not written back', () => {
    const hosted = mount({ name: '  r  ' });
    openDialog();
    hosted.replace(changeRib(r => ({ ...r, name: 'newer name' })));
    pick('L', 'M');
    save();

    expect(ribOf(hosted.product, 'r').name).toBe('newer name');
  });
});
