// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * S4 of FRAME26 pass 3 (v0.59.0): SizePicker's dropdown is `position: fixed` in a portal, placed under its button when
 * it opens. On production v0.58.0 it stayed open while the page scrolled: in Chrome, after `scrollBy(0, 300)` the gap
 * under its button went from 4 px to 304 px. It now closes when anything scrolls or the window resizes, as KebabMenu
 * does; a closed picker listens for neither.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SizePicker from '../components/ui/SizePicker';
import type { SizeMapping } from '../types';

const MAPPING: SizeMapping[] = [{ label: 'S', points: 3 }, { label: 'M', points: 5 }, { label: 'L', points: 8 }];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function openPicker() {
  const onChange = vi.fn();
  render(<div><div data-testid="scroller" style={{ overflow: 'auto' }}><SizePicker value="M" sizeMapping={MAPPING} onChange={onChange} /></div></div>);
  fireEvent.click(screen.getByRole('button', { name: 'M' }));
  expect(screen.getByRole('button', { name: 'Clear size' })).toBeTruthy();
  return { onChange };
}
const isOpen = () => !!screen.queryByRole('button', { name: 'Clear size' });

describe('the size picker closes rather than float away (S4)', () => {
  it('closes when the page scrolls, and changes nothing', () => {
    const { onChange } = openPicker();
    fireEvent.scroll(window);
    expect(isOpen()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes when a scrolling container it sits in scrolls (a scroll event does not bubble: it is caught on the way down)', () => {
    openPicker();
    fireEvent.scroll(screen.getByTestId('scroller'));
    expect(isOpen()).toBe(false);
  });

  it('closes when the window resizes', () => {
    openPicker();
    fireEvent(window, new Event('resize'));
    expect(isOpen()).toBe(false);
  });

  it('still picks a size, and reopens after closing', () => {
    const { onChange } = openPicker();
    fireEvent.scroll(window);
    fireEvent.click(screen.getByRole('button', { name: 'M' }));
    fireEvent.click(screen.getByRole('button', { name: /^L/ }));
    expect(onChange).toHaveBeenCalledWith('L');
  });

  it('a closed picker adds no scroll or resize listener, and removes them once closed', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    render(<SizePicker value="M" sizeMapping={MAPPING} onChange={() => {}} />);
    const kinds = (spy: typeof add) => spy.mock.calls.map(c => c[0]).filter(k => k === 'scroll' || k === 'resize');
    expect(kinds(add)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'M' }));
    expect(kinds(add).sort()).toEqual(['resize', 'scroll']);
    fireEvent.scroll(window);
    expect(kinds(remove).sort()).toEqual(['resize', 'scroll']);
  });
});
