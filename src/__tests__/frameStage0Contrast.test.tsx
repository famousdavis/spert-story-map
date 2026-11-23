// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.56.5 (FRAME26 stage 0): the footer links and the storage pill are readable in both themes.
 *
 * Before: the footer links had no dark colour (blue-600 on the dark footer, 3.38:1); "Local only" was
 * gray-400 on the light header (2.60:1); "Sign in" took #0070f3 from an INLINE style, which beats any
 * `dark:` class (3.90:1 on the dark product header); the lock glyph's strokes were a fixed #9CA3AF
 * (2.54:1 on white, under 1.4.11's 3:1 for a glyph that is the only visual sign of the storage mode).
 *
 * jsdom has no paint, so the ratios were measured in Chrome and are in the PR. What this file pins:
 * (1) the real components carry the themed class pairs and no inline colour, and (2) each class,
 * compiled against Story Map's own stylesheet, yields a colour that clears its bar on every ground the
 * component sits on. A must-fail control proves (2) can fail.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from '@tailwindcss/node';
import { Footer } from '../pages/ChangelogView';
import StorageStatusPill from '../components/ui/StorageStatusPill';
import { req } from './testHelpers';

const auth = vi.hoisted(() => ({ user: null as null | { displayName: string; email: string } }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: auth.user, firebaseAvailable: true }) }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ mode: 'local' }) }));

afterEach(() => {
  cleanup();
  auth.user = null;
});

const SRC = resolve(__dirname, '..');
const CSS = readFileSync(resolve(SRC, 'index.css'), 'utf8');

// ---- colour arithmetic --------------------------------------------------------------------------------------------

type Triple = [number, number, number];
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const delin = (v: number) =>
  Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
const rgb = (h: string): Triple => [1, 3, 5].map(i => Number.parseInt(h.slice(i, i + 2), 16)) as Triple;
const hex = (a: number[]) => '#' + a.map(v => v.toString(16).padStart(2, '0')).join('');
const luminance = (h: string) => {
  const [r, g, b] = rgb(h).map(lin) as Triple;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** oklch(L% C H) → #rrggbb, clipping channels as the browser's sRGB conversion does. */
function oklchHex(l: number, c: number, h: number): string {
  const [lk, a, b] = [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
  const L = (lk + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (lk - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (lk - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return hex([
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ].map(delin));
}
function parseColor(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + Array.from(v.slice(1)).map(c => c + c).join('').toLowerCase();
  const ok = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+|none)\s*\)$/i.exec(v);
  if (ok) return oklchHex(Number(ok[1]) / 100, Number(ok[2]), ok[3] === 'none' ? 0 : Number(ok[3]));
  throw new Error('unreadable colour: ' + v);
}

// ---- compiling a class against index.css --------------------------------------------------------------------------

const escapeClass = (c: string) => c.replace(/[:[\]#/]/g, m => '\\' + m);

/**
 * The colour one text- or bg- utility compiles to, on a fresh compiler (Tailwind's `build()` is cumulative).
 * A `dark:` class must compile under the `.dark` selector, or it can never apply.
 */
async function compiledColor(cls: string): Promise<string> {
  const out = (await compile(CSS, { base: SRC, onDependency() {} })).build([cls]);
  const at = out.indexOf('.' + escapeClass(cls) + ' {');
  if (at < 0) throw new Error(`${cls}: produced no rule`);
  const rule = out.slice(at, out.indexOf('\n  }\n', at) + 4);
  if (cls.startsWith('dark:') && !rule.includes('&:where(.dark, .dark *)')) throw new Error(`${cls}: not under .dark`);
  const decl = /(?:^|\s)(?:background-)?color:\s*([^;]+);/.exec(rule);
  const value = req(decl?.[1], `${cls}: colour declaration`).trim();
  const ref = /^var\((--color-[a-z0-9-]+)\)$/.exec(value);
  if (!ref) return parseColor(value);
  const def = new RegExp(`${req(ref[1], 'var name')}:\\s*([^;]+);`).exec(out);
  return parseColor(req(def?.[1], `${cls}: ${ref[1]} definition`));
}

/** The grounds, read from the classes that paint them (ProductLayout header, ProductList root, the footer, the pill's hover). */
const GROUND = {
  white: 'bg-white',
  gray50: 'bg-gray-50', // pill hover, light
  gray800: 'bg-gray-800', // pill hover, dark
  gray900: 'bg-gray-900', // footer and product header, dark
  gray950: 'bg-gray-950', // Products page, dark
} as const;

async function ratio(fg: string, ground: keyof typeof GROUND): Promise<number> {
  return contrast(await compiledColor(fg), await compiledColor(GROUND[ground]));
}

const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const inlineColor = (el: Element) => (el as HTMLElement | SVGElement).style?.color ?? '';

describe('the compiled check can fail', () => {
  it('must-fail control: the old footer link colour on the dark footer is under 4.5', async () => {
    const r = await ratio('text-blue-600', 'gray900');
    expect(r).toBeLessThan(4.5);
    expect(r).toBeCloseTo(3.38, 2);
  }, 60_000);

  it('the compiled colours match what Chrome painted', async () => {
    expect(await compiledColor('text-blue-600')).toBe('#155dfc');
    expect(await compiledColor('dark:text-blue-400')).toBe('#51a2ff');
    expect(await compiledColor('text-gray-500')).toBe('#6a7282');
    expect(await compiledColor('bg-gray-900')).toBe('#101828');
  }, 60_000);
});

describe('SM-1: footer links', () => {
  it('every link carries the light and dark pair, rest and hover, and no inline colour', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    const footer = req(document.querySelector('footer'), 'footer');
    expect(tokens(footer)).toEqual(expect.arrayContaining(['bg-white', 'dark:bg-gray-900']));
    const links = Array.from(footer.querySelectorAll('a'));
    expect(links).toHaveLength(6);
    for (const a of links) {
      expect(tokens(a), a.textContent ?? '').toEqual(expect.arrayContaining(
        ['text-blue-600', 'hover:text-blue-700', 'dark:text-blue-400', 'dark:hover:text-blue-300'],
      ));
      expect(inlineColor(a)).toBe('');
    }
  });

  it('the dark pair clears 4.5 on the dark footer; the light pair on the light one', async () => {
    expect(await ratio('dark:text-blue-400', 'gray900')).toBeGreaterThanOrEqual(4.5);
    expect(await ratio('dark:hover:text-blue-300', 'gray900')).toBeGreaterThanOrEqual(4.5);
    expect(await ratio('text-blue-600', 'white')).toBeGreaterThanOrEqual(4.5);
    expect(await ratio('hover:text-blue-700', 'white')).toBeGreaterThanOrEqual(4.5);
  }, 60_000);
});

describe('the storage pill, signed out', () => {
  it('the pill paints no ground of its own at rest, only on hover', () => {
    render(<StorageStatusPill onClick={() => {}} />);
    const button = screen.getByRole('button');
    const bg = tokens(button).filter(t => /(^|:)bg-/.test(t));
    expect(bg.sort()).toEqual(['dark:hover:bg-gray-800', 'hover:bg-gray-50']);
  });

  it('SM-2: "Local only" carries gray-500 / dark gray-400, no bare gray-400, no inline colour', () => {
    render(<StorageStatusPill onClick={() => {}} />);
    const span = screen.getByText('Local only');
    expect(tokens(span)).toEqual(expect.arrayContaining(['text-gray-500', 'dark:text-gray-400']));
    expect(tokens(span)).not.toContain('text-gray-400');
    expect(inlineColor(span)).toBe('');
  });

  it('SM-2: "Local only" clears 4.5 on every ground, rest and hover', async () => {
    for (const g of ['white', 'gray50'] as const) expect(await ratio('text-gray-500', g), g).toBeGreaterThanOrEqual(4.5);
    for (const g of ['gray900', 'gray950', 'gray800'] as const) {
      expect(await ratio('dark:text-gray-400', g), g).toBeGreaterThanOrEqual(4.5);
    }
  }, 60_000);

  it('SM-3: "Sign in" takes its colour from classes, never an inline style; light stays #0070f3', () => {
    render(<StorageStatusPill onClick={() => {}} />);
    const span = screen.getByText('Sign in');
    expect(inlineColor(span)).toBe('');
    expect(tokens(span)).toEqual(expect.arrayContaining(['text-[#0070f3]', 'dark:text-blue-400']));
    expect(span.style.fontSize).toBe('12px');
  });

  it('SM-3: "Sign in" clears 4.5 in dark on both headers and the hover; light at rest unchanged', async () => {
    for (const g of ['gray900', 'gray950', 'gray800'] as const) {
      expect(await ratio('dark:text-blue-400', g), g).toBeGreaterThanOrEqual(4.5);
    }
    // Light is #0070f3 as before (4.55 at rest). On the light hover ground it is 4.36, as it was
    // before this release; recorded, not changed here.
    expect(await compiledColor('text-[#0070f3]')).toBe('#0070f3');
    expect(await ratio('text-[#0070f3]', 'white')).toBeGreaterThanOrEqual(4.5);
  }, 60_000);
});

describe('SM-4: the lock glyph', () => {
  function lockSvgs(): SVGElement[] {
    return Array.from(document.querySelectorAll('button svg')).filter(svg => svg.querySelector('rect')) as SVGElement[];
  }

  it.each([
    ['signed out', null],
    ['signed in, local storage', { displayName: 'Ada Lovelace', email: 'ada@example.com' }],
  ])('%s: strokes are currentColor and the svg carries gray-500 / dark gray-400', (_label, user) => {
    auth.user = user;
    render(<StorageStatusPill onClick={() => {}} />);
    const svgs = lockSvgs();
    expect(svgs).toHaveLength(1);
    const svg = req(svgs[0], 'lock svg');
    const strokes = Array.from(svg.querySelectorAll('[stroke]')).map(n => n.getAttribute('stroke'));
    expect(strokes).toHaveLength(2);
    expect(strokes.every(s => s === 'currentColor')).toBe(true);
    expect(tokens(svg)).toEqual(expect.arrayContaining(['text-gray-500', 'dark:text-gray-400']));
  });

  it('the lock clears 3:1 (WCAG 1.4.11) on every ground, rest and hover', async () => {
    for (const g of ['white', 'gray50'] as const) expect(await ratio('text-gray-500', g), g).toBeGreaterThanOrEqual(3);
    for (const g of ['gray900', 'gray950', 'gray800'] as const) {
      expect(await ratio('dark:text-gray-400', g), g).toBeGreaterThanOrEqual(3);
    }
  }, 60_000);
});
