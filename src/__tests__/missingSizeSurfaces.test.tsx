// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * A rib on a size label its size list no longer holds (removed or relabelled in Settings)
 * counts 0 points and every count calls it unsized, so every surface draws it exactly as a
 * rib with no size. The picker's tooltip and Clear item and the locked size still name the
 * label, quoted, so it can be typed back (Excel and Needs Attention have their own files).
 *
 * Driven through the real pages: a test of the component alone cannot see a caller that
 * passes the wrong size list. Each naming site has four rows, an orphan, a valid label, null
 * and '', so a guard that names a rib with no size at all fails here too. Fixture:
 * `fixtures/orphanSizes.ts`.
 */

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { screen, cleanup, fireEvent, within } from '@testing-library/react';

vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ driver: null, mode: 'local', storageReady: true }) }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import StructureView from '../pages/StructureView';
import StoryMapView from '../pages/StoryMapView';
import SizingView from '../pages/SizingView';
import ReleasePlanningView from '../pages/ReleasePlanningView';
import ProgressTrackingView from '../pages/ProgressTrackingView';
import SettingsView from '../pages/SettingsView';
import { getRibItemPoints } from '../lib/calculations';
import { mountHosted } from './fixtures/productHost';
import { ribOf } from './fixtures/progressIntegrity';
import { LOCK_NOTE, orphanProduct } from './fixtures/orphanSizes';
import { req } from './testHelpers';

afterEach(cleanup);

beforeAll(() => {
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

const PICKER_TITLE = '“XL” is no longer in your size list. Pick a size, or add “XL” back in Settings → T-Shirt Size Mapping.';
const LOCKED_SENTENCE = '“XL” is no longer in your size list. Add “XL” back in Settings → T-Shirt Size Mapping to count its points again.';
const EMPTY_PICKER_TITLE = (label: string) => `Your size list is empty. Add “${label}” in Settings → T-Shirt Size Mapping.`;
const EMPTY_LOCKED_SENTENCE = (label: string) => `Your size list is empty. Add “${label}” in Settings → T-Shirt Size Mapping to count its points again.`;

/** What a picker shows: its text, its tooltip, and its menu's items, read by opening it. */
function readPicker(button: HTMLElement) {
  // `dashed` is the "Size?" look: a rib that draws as no size must not keep a size's colour.
  const shown = { text: button.textContent, title: button.getAttribute('title'), dashed: button.className.split(/\s+/).includes('border-dashed') };
  fireEvent.click(button);
  const menu = [...document.body.querySelectorAll<HTMLElement>('.fixed.z-\\[9999\\] button')];
  const read = {
    ...shown,
    items: menu.map(b => b.textContent),
    highlighted: menu.filter(b => b.className.includes('font-semibold')).map(b => b.textContent),
  };
  fireEvent.click(button);
  return read;
}

/** A locked size's chip (the element carrying the lock note) and the visible sentence beside it, if any. */
function readLocked(container: HTMLElement) {
  const chip = req(container.querySelector<HTMLElement>('[title^="Size locked"]'), 'locked size chip');
  const sentence = [...container.querySelectorAll('span')]
    .find(s => s.children.length === 0 && /size list/.test(s.textContent ?? '') && !s.closest('[title]'));
  return { text: chip.textContent, title: chip.getAttribute('title'), sentence: sentence?.textContent ?? null };
}

// ─── Structure: the picker and the compact locked size ──────────────

/** The Size cell of a rib's row on the Structure tab. */
function structureSizeCell(name: string): HTMLElement {
  const row = screen.getAllByText(name).map(el => el.closest<HTMLElement>('[style*="grid-template-columns"]')).find(Boolean);
  return req(req(row, `row ${name}`).children[2] as HTMLElement | undefined, `size cell of ${name}`);
}

const structurePicker = (name: string) => readPicker(req(structureSizeCell(name).querySelector('button'), `picker of ${name}`));

describe('Structure: the size picker', () => {
  it('draws an orphan as no size, names it in the tooltip, highlights no row and names it in the Clear item', () => {
    mountHosted(StructureView, orphanProduct());
    expect(structurePicker('orphan')).toStrictEqual({
      text: 'Size?', title: PICKER_TITLE, dashed: true,
      items: ['L40 pts', 'M20 pts', 'Tiny0 pts', 'Clear “XL” (not in size list)'], highlighted: [],
    });
  });

  it('quotes a label with a stray space, so the space shows, in the tooltip and the Clear item', () => {
    mountHosted(StructureView, orphanProduct());
    const { title, items } = structurePicker('spaced');
    expect({ title, clear: items[items.length - 1] }).toStrictEqual({
      title: '“M ” is no longer in your size list. Pick a size, or add “M ” back in Settings → T-Shirt Size Mapping.',
      clear: 'Clear “M ” (not in size list)',
    });
  });

  it('draws a valid size and a 0-point size as before, with "Clear size"', () => {
    mountHosted(StructureView, orphanProduct());
    expect([structurePicker('valid'), structurePicker('zero')]).toStrictEqual([
      { text: 'L', title: null, dashed: false, items: ['L40 pts', 'M20 pts', 'Tiny0 pts', 'Clear size'], highlighted: ['L40 pts'] },
      { text: 'Tiny', title: null, dashed: false, items: ['L40 pts', 'M20 pts', 'Tiny0 pts', 'Clear size'], highlighted: ['Tiny0 pts'] },
    ]);
  });

  it('names nothing on a rib with no size, null or empty, and offers no Clear item', () => {
    mountHosted(StructureView, orphanProduct());
    const noSize = { text: 'Size?', title: null, dashed: true, items: ['L40 pts', 'M20 pts', 'Tiny0 pts'], highlighted: [] };
    expect([structurePicker('none'), structurePicker('empty')]).toStrictEqual([noSize, noSize]);
  });

  it('with an empty size list, says so, offers only the Clear item, and still names nothing on a rib with no size', () => {
    mountHosted(StructureView, orphanProduct([]));
    expect([structurePicker('orphan'), structurePicker('valid'), structurePicker('none')]).toStrictEqual([
      { text: 'Size?', title: EMPTY_PICKER_TITLE('XL'), dashed: true, items: ['Clear “XL” (not in size list)'], highlighted: [] },
      { text: 'Size?', title: EMPTY_PICKER_TITLE('L'), dashed: true, items: ['Clear “L” (not in size list)'], highlighted: [] },
      { text: 'Size?', title: null, dashed: true, items: [], highlighted: [] },
    ]);
  });

  it('writes nothing until a size is picked or cleared', () => {
    const hosted = mountHosted(StructureView, orphanProduct());
    structurePicker('orphan');
    expect(hosted.writes).toBe(0);
    expect(ribOf(hosted.product, 'orphan').size).toBe('XL');
  });
});

describe('Structure: the compact locked size', () => {
  it('shows an orphan as no size; the tooltip is the lock note and the sentence, which a screen reader also reads', () => {
    mountHosted(StructureView, orphanProduct());
    expect(readLocked(structureSizeCell('lockedorphan'))).toStrictEqual({
      text: `—locked. ${LOCKED_SENTENCE}`, title: `${LOCK_NOTE}. ${LOCKED_SENTENCE}`, sentence: null,
    });
  });

  it('shows a valid, a null and an empty locked size as before', () => {
    mountHosted(StructureView, orphanProduct());
    expect(['lockedvalid', 'lockednone', 'lockedempty'].map(n => readLocked(structureSizeCell(n)))).toStrictEqual([
      { text: 'Llocked', title: LOCK_NOTE, sentence: null },
      { text: '—locked', title: LOCK_NOTE, sentence: null },
      { text: '—locked', title: LOCK_NOTE, sentence: null },
    ]);
  });

  it('with an empty size list, the sentence says the list is empty', () => {
    mountHosted(StructureView, orphanProduct([]));
    expect(readLocked(structureSizeCell('lockedorphan')).title).toBe(`${LOCK_NOTE}. ${EMPTY_LOCKED_SENTENCE('XL')}`);
  });
});

// ─── The Map: the card, and the panel's picker and locked size ──────

const mapCard = (name: string) => req(document.querySelector<HTMLElement>(`[data-rib-id="${name}"]`), `card ${name}`);
/** A card's text without its name: the size badge, points, Core and the actions button. */
const mapCardRest = (name: string) => (mapCard(name).textContent ?? '').replace(name, '');

/** Open a rib's panel from its card, as a user does, and return the panel's Size row. */
function mapPanelSizeRow(name: string): HTMLElement {
  mountHosted(StoryMapView, orphanProduct());
  fireEvent.click(mapCard(name));
  const label = screen.getAllByText('Size').find(el => el.tagName === 'SPAN');
  return req(label?.parentElement ?? null, `panel Size row of ${name}`);
}

describe('the Map card', () => {
  it('shows no size badge on an orphan, exactly as on a rib with no size', () => {
    mountHosted(StoryMapView, orphanProduct());
    expect(mapCardRest('orphan')).toBe('Core⋮');
  });

  it('shows a valid and a 0-point badge, and none for null or empty, as before', () => {
    mountHosted(StoryMapView, orphanProduct());
    expect(['valid', 'zero', 'none', 'empty'].map(mapCardRest)).toStrictEqual(['L40ptsCore⋮', 'TinyCore⋮', 'Core⋮', 'Core⋮']);
  });
});

describe('the Map panel', () => {
  it('its picker draws an orphan as no size and names it', () => {
    const row = mapPanelSizeRow('orphan');
    expect(readPicker(within(row).getByRole('button'))).toStrictEqual({
      text: 'Size?', title: PICKER_TITLE, dashed: true,
      items: ['L40 pts', 'M20 pts', 'Tiny0 pts', 'Clear “XL” (not in size list)'], highlighted: [],
    });
  });

  it.each([
    ['valid', { text: 'L', title: null, dashed: false }],
    ['none', { text: 'Size?', title: null, dashed: true }],
    ['empty', { text: 'Size?', title: null, dashed: true }],
  ])('its picker on %s names nothing', (name, expected) => {
    const { text, title, dashed } = readPicker(within(mapPanelSizeRow(name)).getByRole('button'));
    expect({ text, title, dashed }).toStrictEqual(expected);
  });

  it('its locked size shows an orphan as no size, with the sentence visible and the tooltip the lock note alone', () => {
    expect(readLocked(mapPanelSizeRow('lockedorphan'))).toStrictEqual({ text: '—locked', title: LOCK_NOTE, sentence: LOCKED_SENTENCE });
  });

  it.each([
    ['lockedvalid', 'Llocked'],
    ['lockednone', '—locked'],
    ['lockedempty', '—locked'],
  ])('its locked size on %s shows no sentence', (name, text) => {
    expect(readLocked(mapPanelSizeRow(name))).toStrictEqual({ text, title: LOCK_NOTE, sentence: null });
  });

  it('with an empty size list, its locked size says the list is empty', () => {
    mountHosted(StoryMapView, orphanProduct([]));
    fireEvent.click(mapCard('lockedorphan'));
    expect(screen.getByText(EMPTY_LOCKED_SENTENCE('XL'))).toBeTruthy();
  });
});

// ─── Sizing: the card, and the dialog's picker and locked size ──────

const sizingCardRest = (name: string) =>
  (req(document.querySelector<HTMLElement>(`[data-rib-id="${name}"]`), `card ${name}`).textContent ?? '').replace(name, '');

/** Open a rib's edit dialog from its card, and return the dialog's Size field. */
function sizingDialogSizeField(name: string, product = orphanProduct()) {
  const hosted = mountHosted(SizingView, product);
  fireEvent.click(req(document.querySelector<HTMLElement>(`[data-rib-id="${name}"]`), `card ${name}`));
  screen.getByRole('heading', { name: 'Edit Rib Item' });
  const label = screen.getAllByText('Size').find(el => el.tagName === 'DIV');
  return { hosted, field: req(label?.parentElement ?? null, `dialog Size field of ${name}`) };
}

describe('the Sizing card', () => {
  it('shows no size badge on an orphan in Unsized, exactly as on a rib with no size', () => {
    mountHosted(SizingView, orphanProduct());
    expect(sizingCardRest('orphan')).toBe('⋮BCore');
  });

  it('shows a valid and a 0-point badge, and none for null or empty, as before', () => {
    mountHosted(SizingView, orphanProduct());
    expect(['valid', 'zero', 'none', 'empty'].map(sizingCardRest)).toStrictEqual(['L⋮BCore', 'Tiny⋮BCore', '⋮BCore', '⋮BCore']);
  });
});

describe('the Sizing dialog', () => {
  it('its picker draws an orphan as no size and names it', () => {
    const { field } = sizingDialogSizeField('orphan');
    expect(readPicker(within(field).getByRole('button'))).toStrictEqual({
      text: 'Size?', title: PICKER_TITLE, dashed: true,
      items: ['L40 pts', 'M20 pts', 'Tiny0 pts', 'Clear “XL” (not in size list)'], highlighted: [],
    });
  });

  it.each([
    ['valid', { text: 'L', title: null, dashed: false }],
    ['none', { text: 'Size?', title: null, dashed: true }],
    ['empty', { text: 'Size?', title: null, dashed: true }],
  ])('its picker on %s names nothing', (name, expected) => {
    const { text, title, dashed } = readPicker(within(sizingDialogSizeField(name).field).getByRole('button'));
    expect({ text, title, dashed }).toStrictEqual(expected);
  });

  it('its locked size shows an orphan as no size, with the sentence visible and the tooltip the lock note alone', () => {
    expect(readLocked(sizingDialogSizeField('lockedorphan').field)).toStrictEqual({ text: '—locked', title: LOCK_NOTE, sentence: LOCKED_SENTENCE });
  });

  it.each([
    ['lockedvalid', 'Llocked'],
    ['lockednone', '—locked'],
    ['lockedempty', '—locked'],
  ])('its locked size on %s shows no sentence', (name, text) => {
    expect(readLocked(sizingDialogSizeField(name).field)).toStrictEqual({ text, title: LOCK_NOTE, sentence: null });
  });
});

// ─── Release Planning: the card and the Allocation dialog ───────────

const releaseCard = (name: string) =>
  req(screen.getAllByText(name)[0]?.closest<HTMLElement>('[draggable="true"]'), `card ${name}`);

describe('the Release Planning card', () => {
  it('shows no size badge on an orphan, exactly as on a rib with no size', () => {
    mountHosted(ReleasePlanningView, orphanProduct());
    expect((releaseCard('orphan').textContent ?? '').replace('orphan', '')).toBe('CoreB');
  });

  it('shows a valid and a 0-point badge, and none for null or empty, as before', () => {
    mountHosted(ReleasePlanningView, orphanProduct());
    expect(['valid', 'zero', 'none', 'empty'].map(n => (releaseCard(n).textContent ?? '').replace(n, '')))
      .toStrictEqual(['L40 ptsCoreB', 'TinyCoreB', 'CoreB', 'CoreB']);
  });
});

describe('the Allocation dialog', () => {
  /** The dialog's "Size:" line, opened from the rib's card. */
  function sizeLine(name: string) {
    mountHosted(ReleasePlanningView, orphanProduct());
    fireEvent.click(releaseCard(name));
    screen.getByText(`Allocate: ${name}`);
    return [...document.body.querySelectorAll('span')].filter(s => /^Size:/.test(s.textContent ?? '')).map(s => s.textContent);
  }

  it('shows no Size line for an orphan, exactly as for a rib with no size', () => {
    expect(sizeLine('orphan')).toStrictEqual([]);
  });

  it.each([
    ['valid', ['Size: L']],
    ['zero', ['Size: Tiny']],
    ['none', []],
    ['empty', []],
  ])('shows the Size line on %s as before', (name, expected) => {
    expect(sizeLine(name)).toStrictEqual(expected);
  });
});

// ─── Progress ───────────────────────────────────────────────────────

describe('the Progress row', () => {
  const sizeText = (name: string) =>
    req(screen.getAllByText(name)[0]?.closest('tr')?.children[1], `size cell of ${name}`).textContent;

  it('shows "—" for an orphan, exactly as for a rib with no size', () => {
    mountHosted(ProgressTrackingView, orphanProduct());
    expect(sizeText('orphan')).toBe('—');
  });

  it('shows a valid and a 0-point size, and "—" for null or empty, as before', () => {
    mountHosted(ProgressTrackingView, orphanProduct());
    expect(['valid', 'zero', 'none', 'empty'].map(sizeText)).toStrictEqual(['L', 'Tiny', '—', '—']);
  });
});

// ─── Nothing stored changes ─────────────────────────────────────────

describe('the stored size', () => {
  it('survives an untouched Save and a rename-only Save in the Sizing dialog', () => {
    const { hosted } = sizingDialogSizeField('orphan');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const untouched = ribOf(hosted.product, 'orphan').size;
    fireEvent.click(req(document.querySelector<HTMLElement>('[data-rib-id="orphan"]'), 'card orphan'));
    fireEvent.change(req(document.querySelector<HTMLInputElement>('input[name="ribName"]'), 'name field'), { target: { value: 'renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect({ untouched, renamed: ribOf(hosted.product, 'orphan') }).toMatchObject({ untouched: 'XL', renamed: { name: 'renamed', size: 'XL' } });
  });

  it('counts again once the row is added back in Settings, and is drawn as a size again', () => {
    const settings = mountHosted(SettingsView, orphanProduct());
    fireEvent.click(screen.getByText('+ Add Size'));
    const added = [...document.querySelectorAll('input')].filter(i => i.value === 'New');
    expect(added).toHaveLength(1);
    const labelInput = req(added[0], 'new size label');
    fireEvent.change(labelInput, { target: { value: 'XL' } });
    fireEvent.blur(labelInput);
    const points = req(labelInput.closest('div')?.querySelector<HTMLInputElement>('input[type="number"]'), 'new size points');
    fireEvent.change(points, { target: { value: '13' } });
    fireEvent.blur(points);
    const restored = settings.product;
    expect(getRibItemPoints(ribOf(restored, 'orphan'), restored.sizeMapping)).toBe(13);

    cleanup();
    mountHosted(StructureView, restored);
    expect(structurePicker('orphan')).toMatchObject({ text: 'XL', title: null, dashed: false });
  });
});

// ─── Where the locked size's sentence sits ──────────────────────────

/**
 * jsdom draws nothing, so this reads the classes that place it. In the Map panel the label
 * and the value sit at opposite ends of a row: without a gap the label ran into the
 * sentence ("Size“XL” is no longer…"), and left-aligned the chip sat apart from every other
 * value. The Sizing dialog's field is a left-aligned block and stays so.
 */
describe('the locked sentence\'s layout', () => {
  const stackOf = (container: HTMLElement) =>
    req(container.querySelector('[title^="Size locked"]')?.parentElement ?? null, 'chip and sentence').className.split(/\s+/);

  it('in the Map panel, keeps a gap after the label and right-aligns the chip and sentence', () => {
    const row = mapPanelSizeRow('lockedorphan');
    const stack = stackOf(row);
    expect({ gap: row.className.split(/\s+/).includes('gap-3'), end: stack.includes('items-end'), right: stack.includes('text-right') })
      .toStrictEqual({ gap: true, end: true, right: true });
  });

  it('in the Sizing dialog, keeps them on the left', () => {
    const stack = stackOf(sizingDialogSizeField('lockedorphan').field);
    expect({ start: stack.includes('items-start'), right: stack.includes('text-right') }).toStrictEqual({ start: true, right: false });
  });
});

// ─── A stray space in the locked size's sentence ────────────────────

describe('the locked size quotes a label with a stray space', () => {
  const SPACED_SENTENCE = '“M ” is no longer in your size list. Add “M ” back in Settings → T-Shirt Size Mapping to count its points again.';

  it('in Structure\'s tooltip', () => {
    mountHosted(StructureView, orphanProduct());
    expect(readLocked(structureSizeCell('lockedspaced')).title).toBe(`${LOCK_NOTE}. ${SPACED_SENTENCE}`);
  });

  it('in the Map panel\'s sentence', () => {
    expect(readLocked(mapPanelSizeRow('lockedspaced')).sentence).toBe(SPACED_SENTENCE);
  });
});
