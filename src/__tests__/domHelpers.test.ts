// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { isInteractiveChild } from '../lib/domHelpers';

describe('isInteractiveChild', () => {
  it('returns true for a button and its descendants (clone/delete/swatch)', () => {
    const btn = document.createElement('button');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    btn.appendChild(svg);
    expect(isInteractiveChild(btn)).toBe(true);
    expect(isInteractiveChild(svg as unknown as HTMLElement)).toBe(true);
  });

  it('returns true for an input (inline-edit field)', () => {
    expect(isInteractiveChild(document.createElement('input'))).toBe(true);
  });

  it('returns true for an element inside a [role="menu"] (kebab popover)', () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('span');
    menu.appendChild(item);
    expect(isInteractiveChild(item)).toBe(true);
  });

  it('returns false for the card body / name span (a plain element)', () => {
    expect(isInteractiveChild(document.createElement('span'))).toBe(false);
    expect(isInteractiveChild(document.createElement('div'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isInteractiveChild(null)).toBe(false);
  });
});
