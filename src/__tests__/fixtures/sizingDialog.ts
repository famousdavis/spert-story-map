// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { fireEvent, screen } from '@testing-library/react';
import type { Product, RibItem } from '../../types';
import { req } from '../testHelpers';

/**
 * Drive the Sizing tab's Edit Rib Item dialog on the rib with id `r`, as the
 * `sizingDialog*` tests mount it. Shared by the size and the other-fields tests.
 */

/** Click card `r` on the board, which opens its dialog. */
export function openDialog() {
  fireEvent.click(req(document.querySelector<HTMLElement>('[data-rib-id="r"]'), 'card r'));
  screen.getByRole('heading', { name: 'Edit Rib Item' });
}

/** Set the dialog's input or textarea named `name` (`ribName`, `ribDescription`, `ribNotes`) to `value`. */
export function type(name: string, value: string) {
  const field = req(document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`), `${name} field`);
  fireEvent.change(field, { target: { value } });
}

/**
 * Open the dialog's size picker (its button shows `current`) and choose `option`: a size
 * label, whose row reads "M20 pts", or `null` for "Clear size".
 */
export function pick(current: string, option: string | null) {
  fireEvent.click(screen.getByRole('button', { name: current }));
  const row = option === null ? /^Clear size$/ : new RegExp(`^${option}\\s*\\d+ pts$`);
  fireEvent.click(screen.getByRole('button', { name: row }));
}

export const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

/** An updater for `hosted.replace`: change rib `r` as a drag, a collaborator or Connect AI would. */
export const changeRib = (change: (rib: RibItem) => RibItem) => (prev: Product): Product => ({
  ...prev,
  themes: prev.themes.map(t => ({
    ...t,
    backboneItems: t.backboneItems.map(b => ({
      ...b,
      ribItems: b.ribItems.map(r => (r.id === 'r' ? change(r) : r)),
    })),
  })),
});
