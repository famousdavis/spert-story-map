// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * N5 (FRAME26, v0.57.0): the theme button is the frame's `.sf-theme`. Its icons draw in `currentColor` (the frame's
 * muted text at rest, its text on hover), with no fixed colour or opacity of their own, because they carry state. It
 * keeps its names, its cycle (Light → Dark → System, which is the contract's System → Light → Dark) and the stored
 * `spert-theme` setting that `index.html`'s first-paint script and frame-check read.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ThemeToggle from '../components/ui/ThemeToggle';
import { useDarkMode } from '../hooks/useDarkMode';
import { req } from './testHelpers';

function Host() {
  const { theme, toggleTheme } = useDarkMode();
  return <ThemeToggle theme={theme} onToggle={toggleTheme} />;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the theme button (contract §3)', () => {
  it('is `.sf-theme` alone, hooked `theme`, a button', () => {
    render(<ThemeToggle theme="light" onToggle={() => {}} />);
    const b = req(document.querySelector<HTMLElement>('[data-sf="theme"]'), 'theme button');
    expect(b.className).toBe('sf-theme');
    expect(b.getAttribute('type')).toBe('button');
  });

  it.each(['light', 'dark', 'system'] as const)('%s: its icon strokes in currentColor, with no fixed colour, fill or opacity', theme => {
    render(<ThemeToggle theme={theme} onToggle={() => {}} />);
    const svg = req(document.querySelector('[data-sf="theme"] svg'), 'icon');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
    for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
      expect((el.getAttribute('class') ?? '').split(/\s+/).filter(c => /(?:^|:)(?:text|fill|stroke|opacity)-/.test(c))).toEqual([]);
      for (const a of ['stroke', 'fill']) {
        const v = el.getAttribute(a);
        if (v !== null) expect(['currentColor', 'none']).toContain(v);
      }
    }
  });

  it('cycles Light → Dark → System → Light, keeping its names and the stored spert-theme', () => {
    localStorage.setItem('spert-theme', 'light');
    render(<Host />);
    const names: string[] = [];
    const stored: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const b = screen.getByRole('button');
      names.push(req(b.getAttribute('aria-label'), 'name'));
      stored.push(localStorage.getItem('spert-theme'));
      expect(b.getAttribute('title')).toBe(b.getAttribute('aria-label'));
      fireEvent.click(b);
    }
    expect(names).toEqual(['Light mode', 'Dark mode', 'System default', 'Light mode']);
    expect(stored).toEqual(['light', 'dark', 'system', 'light']);
  });
});
