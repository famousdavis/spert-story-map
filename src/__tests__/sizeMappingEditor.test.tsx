// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * Settings → T-Shirt Size Mapping, driven through the real SettingsView (v0.55.8). A rib
 * holds its size as a label, so an edit that leaves items on a label no row has drops
 * them to 0 points and rewrites the closed sprints' recorded points.
 *
 * Fixtures are built in memory, never imported: import clears a label its list does not
 * hold (CLAUDE.md #74). Rows are found by `name` and position, which the editor before
 * v0.55.8 also had, so a test that fails there fails on behaviour, not on a selector.
 * Tests marked "control" pass on that editor by design.
 */

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ driver: null, mode: 'local', storageReady: true }) }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import SettingsView from '../pages/SettingsView';
import { getRibItemPoints, getTotalProjectPoints, isRibUnsized } from '../lib/calculations';
import { buildForecasterExport } from '../lib/exportForForecaster';
import { importProductFromJSON } from '../lib/importExport';
import { UNDO_HINT } from '../lib/constants';
import { mountHosted } from './fixtures/productHost';
import { entry, makeProduct, makeRib, ribOf } from './fixtures/progressIntegrity';
import { req } from './testHelpers';
import type { Product, RibItem, Size, SizeMapping } from '../types';

afterEach(cleanup);
beforeAll(() => {
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

// ─── Fixtures ───────────────────────────────────────────────────────

const ON = [{ releaseId: 'R1', percentage: 100 }];
/** Locked: a positive record in S1 on the release it sits on. */
const locked = (id: string, size: string) => makeRib(id, ON, [entry('S1', 'R1', 10)], size as Size);
const free = (id: string, size: string) => makeRib(id, ON, [], size as Size);
/** Its only positive record is on R1, a release it has left: not locked (a naive `percentComplete > 0` says it is). */
const left = (id: string, size: string) => makeRib(id, [{ releaseId: 'R2', percentage: 100 }], [entry('S1', 'R1', 10)], size as Size);

const rowsOf = (spec: string) => spec.split(' ').map(s => {
  const [label = '', points = '0'] = s.split(':');
  return { label, points: Number(points) };
});
const STANDARD = 'XS:5 S:10 M:20 L:40 XL:100';

function product(rows: string | SizeMapping[], ribs: RibItem[], extra: Partial<Product> = {}): Product {
  return { ...makeProduct(ribs), sizeMapping: typeof rows === 'string' ? rowsOf(rows) : rows, ...extra };
}

// ─── Reading the page ───────────────────────────────────────────────

const labels = () => [...document.querySelectorAll<HTMLInputElement>('input[name="sizeLabel"]')];
const pointsInputs = () => [...document.querySelectorAll<HTMLInputElement>('input[name="sizePoints"]')];
const labelAt = (i: number) => req(labels()[i], `label input ${i}`);
const pointsAt = (i: number) => req(pointsInputs()[i], `points input ${i}`);
const removeAt = (i: number) => req(screen.getAllByText('Remove')[i], `Remove ${i}`);
/** The row (label, points, Remove and the lines under it) holding row `i`'s label input. */
const rowAt = (i: number) => req(labelAt(i).closest('div')?.parentElement, `row ${i}`);
const stored = (p: Product) => p.sizeMapping.map(r => `${r.label}:${r.points}`).join(' ');
const sizesOf = (p: Product, ids: string[]) => ids.map(id => ribOf(p, id).size);
const dialog = () => (screen.queryByRole('button', { name: 'Cancel' })?.closest('.fixed') ?? null) as HTMLElement | null;
/** Lines on the page, not the live region that announces them. */
const onPage = (text: string | RegExp) => screen.queryAllByText(text).filter(el => !el.closest('[aria-live]'));
const announced = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';
/** The Forecaster export with its clock fields removed: what a rename must not change. */
const exportOf = (p: Product) => JSON.stringify(buildForecasterExport(p), (k, v) => (/At$/.test(k) ? undefined : v));

function mount(p: Product) {
  return { hosted: mountHosted(SettingsView, p), user: userEvent.setup() };
}

// ─── 1–3. Rename ────────────────────────────────────────────────────

describe('rename', () => {
  it('1. saves once, on blur, and carries every item and the card order with the label', async () => {
    const base = product(STANDARD, [locked('m1', 'M'), free('m2', 'M'), free('m3', 'M'), free('s1', 'S')], {
      sizingCardOrder: { M: ['m3', 'm1', 'm2'], Medium: ['x9', 'm1'], unsized: ['u1'] },
    });
    const { hosted, user } = mount(base);
    await user.type(labelAt(2), 'edium');
    expect(hosted.writes).toBe(0);
    await user.tab();
    expect(hosted.writes).toBe(1);
    const p = hosted.product;
    expect(sizesOf(p, ['m1', 'm2', 'm3', 's1'])).toEqual(['Medium', 'Medium', 'Medium', 'S']);
    expect(getTotalProjectPoints(p)).toBe(getTotalProjectPoints(base));
    expect(exportOf(p)).toBe(exportOf(base));
    expect(p.sizingCardOrder).toEqual({ Medium: ['m3', 'm1', 'm2', 'x9'], unsized: ['u1'] });
  });

  it('2a. Escape after typing writes nothing and shows the stored label', async () => {
    const { hosted, user } = mount(product(STANDARD, [free('m1', 'M')]));
    await user.type(labelAt(2), 'edium');
    await user.keyboard('{Escape}');
    expect(hosted.writes).toBe(0);
    expect(labelAt(2).value).toBe('M');
    expect(stored(hosted.product)).toBe(STANDARD);
  });

  it('2b. Enter saves and keeps focus in the input', async () => {
    const { hosted, user } = mount(product(STANDARD, [free('m1', 'M')]));
    await user.type(labelAt(2), 'edium{Enter}');
    expect(hosted.writes).toBe(1);
    expect(ribOf(hosted.product, 'm1').size).toBe('Medium');
    expect(labelAt(2)).toHaveFocus();
    expect(labelAt(2).value).toBe('Medium');
  });

  it('3. refuses a label import or the list would reject, shows why, and shows the stored label again', async () => {
    const { hosted, user } = mount(product(STANDARD, [free('xs1', 'XS')]));
    const cases: [string, string][] = [
      ['S', '“S” is already in the list.'],
      ['s', '“S” is already in the list.'],
      ['', 'A size needs a label.'],
      ['   ', 'A size needs a label.'],
      ['unsized', '“unsized” is reserved.'],
      ['UNSIZED', '“unsized” is reserved.'],
    ];
    for (const [text, reason] of cases) {
      await user.clear(labelAt(0));
      if (text) await user.type(labelAt(0), text);
      await user.tab();
      expect({ text, writes: hosted.writes, shown: labelAt(0).value, xs: ribOf(hosted.product, 'xs1').size })
        .toEqual({ text, writes: 0, shown: 'XS', xs: 'XS' });
      expect(within(rowAt(0)).getByText(reason)).toBeInTheDocument();
      expect(labelAt(0)).toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('3b. a 21st character cannot be typed, and a stored 22-character label edited to 21 is refused', async () => {
    const long = 'Extra extra large siz'; // 21
    const { hosted, user } = mount(product([...rowsOf(STANDARD), { label: `${long}e`, points: 300 }], []));
    await user.clear(labelAt(0));
    await user.type(labelAt(0), 'x'.repeat(25));
    expect(labelAt(0).value).toHaveLength(20);
    await user.keyboard('{Escape}');
    await user.click(labelAt(5));
    await user.keyboard('{End}{Backspace}');
    await user.tab();
    expect(hosted.writes).toBe(0);
    expect(within(rowAt(5)).getByText('At most 20 characters.')).toBeInTheDocument();
  });
});

// ─── 4–7. Add and remove ────────────────────────────────────────────

describe('add and remove', () => {
  it('4. "+ Add Size" names rows New, New 2, and stops at 20 rows with a line saying so', async () => {
    const { hosted, user } = mount(product(STANDARD, []));
    await user.click(screen.getByText('+ Add Size'));
    await user.click(screen.getByText('+ Add Size'));
    expect(hosted.product.sizeMapping.slice(-2).map(r => r.label)).toEqual(['New', 'New 2']);
    cleanup();
    const full = Array.from({ length: 20 }, (_, i) => ({ label: `Z${i}`, points: i }));
    const again = mount(product(full, []));
    expect(screen.getByText('+ Add Size')).toBeDisabled();
    expect(screen.getByText('At most 20 sizes.')).toBeVisible();
    await again.user.click(screen.getByText('+ Add Size'));
    expect(again.hosted.product.sizeMapping).toHaveLength(20);
  });

  it('5. (control) an unused size goes at once: one write, no dialog', async () => {
    const { hosted, user } = mount(product(STANDARD, [free('m1', 'M')]));
    await user.click(removeAt(0));
    expect({ writes: hosted.writes, dialog: dialog(), rows: stored(hosted.product) })
      .toEqual({ writes: 1, dialog: null, rows: 'S:10 M:20 L:40 XL:100' });
  });

  it('6. a size only unlocked items use asks first; Cancel writes nothing; Remove leaves them unsized', async () => {
    const base = product(STANDARD, [free('m1', 'M'), free('m2', 'M'), free('s1', 'S')], { sizingCardOrder: { M: ['m2', 'm1'], unsized: ['u'] } });
    const { hosted, user } = mount(base);
    await user.click(removeAt(2));
    const text = req(dialog(), 'dialog').textContent ?? '';
    expect(text).toContain('Remove “M”?');
    expect(text).toContain(`2 items use “M” (40 points). Removing it leaves them unsized. ${UNDO_HINT}`);
    expect(within(req(dialog(), 'dialog')).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(hosted.writes).toBe(0);
    await user.click(removeAt(2));
    await user.click(within(req(dialog(), 'dialog')).getByRole('button', { name: 'Remove' }));
    expect(hosted.writes).toBe(1);
    expect(sizesOf(hosted.product, ['m1', 'm2', 's1'])).toEqual([null, null, 'S']);
    expect(hosted.product.sizingCardOrder).toEqual({ unsized: ['u'] });
    expect(stored(hosted.product)).toBe('XS:5 S:10 L:40 XL:100');
  });

  it('7. a size a locked item uses is refused without advice; one used only by a record left behind is not', async () => {
    const base = product(STANDARD, [locked('m1', 'M'), free('m2', 'M'), left('l1', 'L')]);
    const { hosted, user } = mount(base);
    await user.click(removeAt(2));
    expect(dialog()).toBeNull();
    expect(hosted.writes).toBe(0);
    const line = within(rowAt(2)).getByText(/can't be removed/);
    expect(line.textContent).toBe('“M” can\'t be removed: 1 item with recorded progress uses it, and removing it would change the points recorded for past sprints.');
    expect(line.textContent).not.toMatch(/re-size|resize/i);
    expect(exportOf(hosted.product)).toBe(exportOf(base));
    await user.click(removeAt(3));
    expect(req(dialog(), 'L dialog').textContent).toContain('1 item uses “L” (40 points). Removing it leaves it unsized.');
  });
});

// ─── 8. Duplicate rows ──────────────────────────────────────────────

describe('8. duplicate rows: points come from the first', () => {
  const DUP = 'M:20 L:40 M:50';
  const mRibs = () => [locked('m1', 'M'), free('m2', 'M')];

  it('(control) removing the second M removes that row only', async () => {
    const base = product(DUP, mRibs());
    const { hosted, user } = mount(base);
    await user.click(removeAt(2));
    expect({ dialog: dialog(), rows: stored(hosted.product), total: getTotalProjectPoints(hosted.product) })
      .toEqual({ dialog: null, rows: 'M:20 L:40', total: getTotalProjectPoints(base) });
  });

  it('renaming the second M changes that row only, in exactly one write', async () => {
    const base = product(DUP, mRibs());
    const { hosted, user } = mount(base);
    await user.clear(labelAt(2));
    await user.type(labelAt(2), 'Big');
    await user.tab();
    expect({ writes: hosted.writes, rows: stored(hosted.product), sizes: sizesOf(hosted.product, ['m1', 'm2']) })
      .toEqual({ writes: 1, rows: 'M:20 L:40 Big:50', sizes: ['M', 'M'] });
    expect(getTotalProjectPoints(hosted.product)).toBe(getTotalProjectPoints(base));
  });

  it('removing the first M is refused, under the first M row only', async () => {
    const { hosted, user } = mount(product(DUP, mRibs()));
    await user.click(removeAt(0));
    const reason = '“M” can\'t be removed: another “M” row has different points, and 1 item with recorded progress uses “M”. Remove the other “M” row first.';
    expect(onPage(reason)).toHaveLength(1);
    expect(within(rowAt(0)).getByText(reason)).toBeInTheDocument();
    expect({ writes: hosted.writes, dialog: dialog() }).toEqual({ writes: 0, dialog: null });
  });

  it('(control) with [M:20, M:20], removing the first removes that row only', async () => {
    const { hosted, user } = mount(product('M:20 M:20', mRibs()));
    await user.click(removeAt(0));
    expect({ dialog: dialog(), rows: stored(hosted.product) }).toEqual({ dialog: null, rows: 'M:20' });
  });

  it('(control) with [M:20, M:20, M:50], the next row is the second M, so removing the first removes that row only', async () => {
    const { hosted, user } = mount(product('M:20 M:20 M:50', mRibs()));
    await user.click(removeAt(0));
    expect({ dialog: dialog(), rows: stored(hosted.product), line: screen.queryByText(/can't be removed/) })
      .toEqual({ dialog: null, rows: 'M:20 M:50', line: null });
  });

  it('with only unlocked items on [M:20, M:50], removing the first asks with the next row\'s points', async () => {
    const { hosted, user } = mount(product('M:20 M:50', [free('m1', 'M'), free('m2', 'M')]));
    await user.click(removeAt(0));
    expect(req(dialog(), 'dialog').textContent).toContain(`2 items use “M” (40 points). They will count at the next “M” row's points instead (50 points). ${UNDO_HINT}`);
    await user.click(within(req(dialog(), 'dialog')).getByRole('button', { name: 'Remove' }));
    expect({ rows: stored(hosted.product), sizes: sizesOf(hosted.product, ['m1', 'm2']), total: getTotalProjectPoints(hosted.product) })
      .toEqual({ rows: 'M:50', sizes: ['M', 'M'], total: 100 });
  });
});

// ─── 9. Points ──────────────────────────────────────────────────────

describe('9. points', () => {
  it('save once, on blur', async () => {
    const { hosted, user } = mount(product(STANDARD, [free('xs1', 'XS')]));
    await user.clear(pointsAt(0));
    await user.type(pointsAt(0), '7');
    expect(hosted.writes).toBe(0);
    await user.tab();
    expect({ writes: hosted.writes, rows: stored(hosted.product) }).toEqual({ writes: 1, rows: 'XS:7 S:10 M:20 L:40 XL:100' });
  });

  it('refuse -1, a blank field and abc, show the stored value again, and the file still imports', async () => {
    const { hosted, user } = mount(product(STANDARD, [free('xs1', 'XS')]));
    for (const text of ['-1', '', 'abc']) {
      await user.clear(pointsAt(0));
      if (text) await user.type(pointsAt(0), text);
      await user.tab();
      expect({ text, writes: hosted.writes, shown: pointsAt(0).value }).toEqual({ text, writes: 0, shown: '5' });
      expect(within(rowAt(0)).getByText('Points must be a number, 0 or more.')).toBeInTheDocument();
      expect(pointsAt(0)).toHaveAttribute('aria-invalid', 'true');
    }
    expect(() => importProductFromJSON(JSON.stringify(hosted.product))).not.toThrow();
  });

  it('keep a decimal', async () => {
    const { hosted, user } = mount(product(STANDARD, [free('xs1', 'XS')]));
    await user.clear(pointsAt(0));
    await user.type(pointsAt(0), '0.5');
    await user.tab();
    expect(hosted.product.sizeMapping[0]?.points).toBe(0.5);
  });

  it('show the recorded-points note while the field is edited, under the effective row a locked item uses only', async () => {
    const { user } = mount(product('M:20 L:40 M:50', [locked('m1', 'M'), free('l1', 'L')]));
    const note = '1 item with recorded progress uses “M”: changing its points changes the points recorded for past sprints.';
    const shown = (i: number) => [...rowAt(i).querySelectorAll('p')].some(p => p.textContent === note && !p.hidden);
    expect(shown(0)).toBe(false);
    await user.click(pointsAt(0));
    expect(shown(0)).toBe(true);
    expect(pointsAt(0)).toHaveAccessibleDescription(note);
    await user.click(pointsAt(1));
    await user.click(pointsAt(2));
    expect([shown(0), shown(1), shown(2)]).toEqual([false, false, false]);
    expect(within(rowAt(2)).queryByText(note)).toBeNull();
    expect(within(rowAt(1)).queryByText(/recorded progress/)).toBeNull();
  });
});

// ─── 10. Add back ───────────────────────────────────────────────────

describe('10. sizes items still use that are not in the list', () => {
  const xl = () => [locked('x1', 'XL'), free('x2', 'XL'), free('x3', 'XL'), free('s1', 'S')];

  it('lists them; Add back appends the row at 0 points, focuses its points, and they count once points are entered', async () => {
    const { hosted, user } = mount(product('XS:5 S:10 M:20', xl()));
    expect(screen.getByText('“XL” · 3 items')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add back “XL”' }));
    expect(stored(hosted.product)).toBe('XS:5 S:10 M:20 XL:0');
    expect(pointsAt(3)).toHaveFocus();
    expect(screen.queryByText('“XL” · 3 items')).toBeNull();
    expect(within(rowAt(3)).getByText('3 items use “XL” at 0 points. Enter its points to count them.')).toBeInTheDocument();
    expect(['x1', 'x2', 'x3'].map(id => isRibUnsized(ribOf(hosted.product, id), hosted.product.sizeMapping))).toEqual([false, false, false]);
    await user.clear(pointsAt(3));
    await user.type(pointsAt(3), '100');
    await user.tab();
    expect(['x1', 'x2', 'x3'].map(id => getRibItemPoints(ribOf(hosted.product, id), hosted.product.sizeMapping))).toEqual([100, 100, 100]);
    expect(screen.queryByText(/at 0 points/)).toBeNull();
  });

  it('gives the reason instead of a button for a label a row cannot hold, and lists no empty label', () => {
    mount(product('XS:5 m:20', [free('a', 'XL '), free('b', 'M'), free('c', ''), free('d', 'XS')]));
    expect(screen.getByText('“XL ” has a space at the start or end, which a size label can\'t have.')).toBeInTheDocument();
    expect(screen.getByText('“m” is already in the list. Rename it to “M” and this item joins it.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Add back/ })).toHaveLength(0);
    expect(screen.queryByText(/^“” ·/)).toBeNull();
    expect(screen.getByText('“XL ” · 1 item')).toBeInTheDocument();
  });

  it('two quick clicks append one row', () => {
    const { hosted } = mount(product('XS:5 S:10', xl()));
    const button = screen.getByRole('button', { name: 'Add back “XL”' });
    act(() => { button.click(); button.click(); });
    expect(stored(hosted.product)).toBe('XS:5 S:10 XL:0');
  });
});

// ─── 11. Rows keep their own lines ──────────────────────────────────

describe('11. every row keeps its own inputs and lines', () => {
  it('after a remove above it and after an Add back', async () => {
    const { user } = mount(product(STANDARD, [locked('l1', 'L'), free('s1', 'S'), free('o1', 'Gone')]));
    await user.click(removeAt(3));
    const refusal = /“L” can't be removed/;
    expect(within(rowAt(3)).getByText(refusal)).toBeInTheDocument();
    await user.click(removeAt(0));
    const check = () => labels().forEach((input, i) => {
      expect(input).toHaveAccessibleName(`Label of size “${input.value}”`);
      expect(pointsAt(i)).toHaveAccessibleName(`Points of size “${input.value}”`);
      for (const p of rowAt(i).querySelectorAll('p')) {
        if (!p.hidden && /“/.test(p.textContent ?? '')) expect(p.textContent).toContain(`“${input.value}”`);
      }
    });
    expect(labels().map(i => i.value)).toEqual(['S', 'M', 'L', 'XL']);
    check();
    // The refusal belonged to the list before the remove: it is gone, not moved.
    expect(onPage(refusal)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Add back “Gone”' }));
    expect(labels().map(i => i.value)).toEqual(['S', 'M', 'L', 'XL', 'Gone']);
    check();
    expect(within(rowAt(4)).getByText(/at 0 points/)).toBeInTheDocument();
  });
});

// ─── 13. Another editor changes the list mid-action ─────────────────

describe('13. a list changed elsewhere during an edit', () => {
  const dropXS = (p: Product): Product => ({ ...p, sizeMapping: p.sizeMapping.slice(1) });
  const ribs = () => [free('xs1', 'S'), locked('m1', 'M'), free('m2', 'M'), free('l1', 'L'), locked('x1', 'XL')];

  it('a rename typed over L saves nothing once XS is removed elsewhere', async () => {
    const { hosted, user } = mount(product(STANDARD, ribs()));
    await user.clear(labelAt(3));
    await user.type(labelAt(3), 'Large');
    hosted.replace(dropXS);
    await user.tab();
    expect({ rows: stored(hosted.product), xl: ribOf(hosted.product, 'x1').size, l: ribOf(hosted.product, 'l1').size })
      .toEqual({ rows: 'S:10 M:20 L:40 XL:100', xl: 'XL', l: 'L' });
    expect(onPage('“L” was changed elsewhere. Nothing was saved.')).toHaveLength(1);
    expect(announced()).toBe('“L” was changed elsewhere. Nothing was saved.');
  });

  it('points typed on L save nothing once XS is removed elsewhere', async () => {
    const { hosted, user } = mount(product(STANDARD, ribs()));
    await user.clear(pointsAt(3));
    await user.type(pointsAt(3), '45');
    hosted.replace(dropXS);
    await user.tab();
    expect(stored(hosted.product)).toBe('S:10 M:20 L:40 XL:100');
  });

  it('the M confirm does not remove L once XS is removed elsewhere', async () => {
    const { hosted, user } = mount(product(STANDARD, [free('m2', 'M'), free('l1', 'L')]));
    await user.click(removeAt(2));
    hosted.replace(dropXS);
    await user.click(within(req(dialog(), 'dialog')).getByRole('button', { name: 'Remove' }));
    expect({ rows: stored(hosted.product), l: ribOf(hosted.product, 'l1').size, m: ribOf(hosted.product, 'm2').size })
      .toEqual({ rows: 'S:10 M:20 L:40 XL:100', l: 'L', m: 'M' });
    expect(onPage('“M” was changed elsewhere. Nothing was saved.')).toHaveLength(1);
  });

  it('the M confirm writes nothing once an M item is locked elsewhere', async () => {
    const { hosted, user } = mount(product(STANDARD, [free('m2', 'M'), free('l1', 'L')]));
    await user.click(removeAt(2));
    hosted.replace(p => ({
      ...p,
      themes: p.themes.map(t => ({ ...t, backboneItems: t.backboneItems.map(b => ({
        ...b, ribItems: b.ribItems.map(r => (r.id === 'm2' ? { ...r, progressHistory: [entry('S1', 'R1', 10)] } : r)),
      })) })),
    }));
    const writes = hosted.writes;
    await user.click(within(req(dialog(), 'dialog')).getByRole('button', { name: 'Remove' }));
    expect({ writes: hosted.writes - writes, m: ribOf(hosted.product, 'm2').size, rows: stored(hosted.product) })
      .toEqual({ writes: 0, m: 'M', rows: STANDARD });
    expect(onPage(/“M” can't be removed: 1 item with recorded progress uses it/)).toHaveLength(1);
  });
});

// ─── 14. Revival ────────────────────────────────────────────────────

describe('14. a rename onto a label items still hold brings them back', () => {
  it('says how many joined and how many of them have recorded progress', async () => {
    const { hosted, user } = mount(product('S:10 M:20', [free('m1', 'M'), locked('x1', 'XL'), locked('x2', 'XL'), free('x3', 'XL')]));
    await user.clear(labelAt(1));
    await user.type(labelAt(1), 'XL');
    await user.tab();
    expect(sizesOf(hosted.product, ['m1', 'x1', 'x2', 'x3'])).toEqual(['XL', 'XL', 'XL', 'XL']);
    expect(within(rowAt(1)).getByText('3 items joined “XL”.')).toBeInTheDocument();
    expect(within(rowAt(1)).getByText('2 of them have recorded progress and now count at 20 points.')).toBeInTheDocument();
  });

  it('agrees its verbs with one', async () => {
    const { user } = mount(product('S:10 M:20', [locked('x1', 'XL'), free('x2', 'XL')]));
    await user.clear(labelAt(1));
    await user.type(labelAt(1), 'XL');
    await user.tab();
    expect(within(rowAt(1)).getByText('1 of them has recorded progress and now counts at 20 points.')).toBeInTheDocument();
  });
});
