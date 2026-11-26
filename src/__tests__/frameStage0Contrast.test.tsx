// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.56.5 (FRAME26 stage 0) made the footer links and the storage pill readable in both themes: SM-1 the footer links
 * (no dark colour, 3.38 : 1), SM-2 "Local only" (gray-400, 2.60), SM-3 "Sign in" (an inline #0070f3 that beat every
 * `dark:` class, 3.90), SM-4 the lock glyph (a fixed #9CA3AF, 2.54, under 1.4.11's 3 : 1).
 *
 * Rewritten at v0.57.0 (FRAME26 stage 5), on purpose: the footer and the pill are now the frame's (`.sf-footer`,
 * `.sf-chip`), and their colours are the vendored stylesheet's tokens, not Tailwind classes. Stage 0's four findings
 * stay pinned, against those tokens: (1) the real components carry no colour of their own that could beat or bypass
 * the frame (no utility colour, no inline colour), and (2) each token, read from `src/styles/spert-frame.css`, clears
 * its bar on every ground the element sits on: the page (`--sf-page`) and, for the chip, its hover (`--sf-hover`). A
 * must-fail control proves (2) can fail. frame-check measures the rendered colours in Chrome.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AppFooter from '../components/layout/AppFooter';
import StorageStatusPill from '../components/ui/StorageStatusPill';
import { req } from './testHelpers';

vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: true }) }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ mode: 'local' }) }));

afterEach(cleanup);

const FRAME_CSS = readFileSync(resolve(__dirname, '../styles/spert-frame.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// ---- colour arithmetic --------------------------------------------------------------------------------------------

type Triple = [number, number, number];
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const rgb = (h: string): Triple => [1, 3, 5].map(i => Number.parseInt(h.slice(i, i + 2), 16)) as Triple;
const luminance = (h: string) => {
  const [r, g, b] = rgb(h).map(lin) as Triple;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// ---- the frame's tokens, from the vendored stylesheet ------------------------------------------------------------

/** One theme's block of custom properties: `:root` (light) or `:root.dark, …` (dark). */
function block(theme: 'light' | 'dark'): string {
  const selector = theme === 'light' ? ':root {' : ':root.dark, :root[data-theme="dark"] {';
  const at = FRAME_CSS.indexOf('\n' + selector);
  if (at < 0) throw new Error(`spert-frame.css: no ${selector}`);
  return FRAME_CSS.slice(at, FRAME_CSS.indexOf('}', at));
}
function token(theme: 'light' | 'dark', name: string): string {
  return req(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block(theme))?.[1], `--${name} (${theme})`).toLowerCase();
}
/** The colour one frame rule draws with: `.sf-chip-state` → `var(--sf-text-muted)`, and so on. */
function ruleUses(selector: string, property: string): string {
  const at = FRAME_CSS.search(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm'));
  if (at < 0) throw new Error(`spert-frame.css: no rule ${selector}`);
  const body = FRAME_CSS.slice(FRAME_CSS.indexOf('{', at) + 1, FRAME_CSS.indexOf('}', at));
  return req(new RegExp(`(?:^|[\\s;])${property}:\\s*var\\(--([a-z-]+)\\)`).exec(body)?.[1], `${selector} ${property}`);
}

const THEMES = ['light', 'dark'] as const;
const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const UTILITY_COLOUR = /(?:^|:)(?:text|bg|fill|stroke)-(?:\[|[a-z]+-\d|white|black)/;

function renderChip() {
  render(<StorageStatusPill onClick={() => {}} />);
  return req(document.querySelector<HTMLElement>('[data-sf="chip"]'), 'the chip');
}

describe('the check can fail', () => {
  it('must-fail control: stage 0\'s old footer link, blue-600 (#155dfc), on the frame\'s dark ground is under 4.5', () => {
    expect(contrast('#155dfc', token('dark', 'sf-page'))).toBeLessThan(4.5);
  });
});

describe('SM-1: footer links', () => {
  it('every link carries no class and no inline colour: the frame\'s `.sf-footer a` colours it', () => {
    render(<MemoryRouter><AppFooter /></MemoryRouter>);
    const links = Array.from(document.querySelectorAll<HTMLElement>('[data-sf="footer"] a'));
    expect(links.map(a => a.textContent)).toEqual([
      expect.stringMatching(/^Version /), 'SPERT® Suite', 'Terms of Service', 'Privacy Policy', 'AI Privacy Notice', 'License',
    ]);
    for (const a of links) {
      expect(a.getAttribute('class'), a.textContent ?? '').toBeNull();
      expect(a.style.color, a.textContent ?? '').toBe('');
    }
    expect(ruleUses('.sf-footer a, .sf-footer .sf-link', 'color')).toBe('sf-link');
  });

  it.each(THEMES)('%s: the link colour clears 4.5 on the page ground', theme => {
    expect(contrast(token(theme, 'sf-link'), token(theme, 'sf-page'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the account chip, signed out', () => {
  it('the chip paints its ground from the frame: the page at rest, `--sf-hover` on hover, and no ground class of its own', () => {
    const chip = renderChip();
    expect(classes(chip)).toEqual(['sf-chip']);
    expect(ruleUses('.sf-chip', 'background')).toBe('sf-page');
    expect(ruleUses('.sf-chip:hover', 'background')).toBe('sf-hover');
  });

  it('SM-2 / SM-3: "Local only" and "Sign in" carry no utility or inline colour; the segments take the frame\'s', () => {
    const chip = renderChip();
    const state = req(chip.querySelector<HTMLElement>('.sf-chip-state'), 'state');
    const act = req(chip.querySelector<HTMLElement>('.sf-chip-act'), 'act');
    expect(state.textContent).toBe('Local only');
    expect(act.textContent).toBe('Sign in');
    for (const el of [state, act, ...Array.from(state.querySelectorAll<HTMLElement>('span')), ...Array.from(act.querySelectorAll<HTMLElement>('*'))]) {
      expect(classes(el).filter(c => UTILITY_COLOUR.test(c) && !c.includes('--sf-')), el.outerHTML.slice(0, 60)).toEqual([]);
      expect(el.style.color).toBe('');
    }
    expect(ruleUses('.sf-chip-state', 'color')).toBe('sf-text-muted');
    expect(ruleUses('.sf-chip-act', 'color')).toBe('sf-link');
  });

  it.each(THEMES)('%s: "Local only" and "Sign in" clear 4.5 at rest and on the hover ground', theme => {
    for (const ground of ['sf-page', 'sf-hover']) {
      expect(contrast(token(theme, 'sf-text-muted'), token(theme, ground)), `Local only on ${ground}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(theme, 'sf-link'), token(theme, ground)), `Sign in on ${ground}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('SM-4: the lock glyph', () => {
  it('draws in currentColor, with no fixed stroke or fill, in the frame\'s muted colour', () => {
    const chip = renderChip();
    const svg = req(chip.querySelector('svg'), 'the lock');
    for (const el of Array.from(svg.querySelectorAll('rect, path'))) {
      for (const attr of ['stroke', 'fill']) {
        const v = el.getAttribute(attr);
        if (v !== null) expect(['currentColor', 'none'], `${attr}=${v}`).toContain(v);
      }
    }
    expect(classes(svg)).toEqual(['text-[color:var(--sf-text-muted)]']);
  });

  it.each(THEMES)('%s: the lock clears 3 : 1 (WCAG 1.4.11) at rest and on the hover ground', theme => {
    for (const ground of ['sf-page', 'sf-hover']) {
      expect(contrast(token(theme, 'sf-text-muted'), token(theme, ground)), ground).toBeGreaterThanOrEqual(3);
    }
  });
});
