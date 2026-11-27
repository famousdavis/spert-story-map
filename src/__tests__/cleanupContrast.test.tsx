// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * Text and controls made readable in FRAME26's clean-up (v0.58.0), each measured failing on production v0.57.0 in
 * Chrome (canvas-composited, a real mouse hover):
 * - S1 Connect AI, inactive: 2.60 light / 3.67 dark at rest. Now the frame's muted text, its text colour on hover.
 * - S2 "← Back to Products" on About and the changelog: the same 2.60 / 3.67, the same fix.
 * - S3 ConnectPanel's Retry: 3.38 in dark (no dark colour). Now blue-400 in dark.
 * - ConnectPanel's "Valid 15 min · refreshes automatically" / "Generating code…": gray-400 / gray-500, as S1.
 * - Modal's close "×": gray-400 / gray-500, under the 3 : 1 an icon needs in light.
 * - S4 the Map's +Rib (2.43 / 4.30 hover in light) and +Release (the same, and 3.47 at rest in dark).
 * - The Map's release "×" (gray-400 / gray-500 on the canvas).
 *
 * Each element is rendered (the Map's +Rib, which needs a pointer over a gap, is read from its source) and each of its
 * colours, in each theme, at rest and on hover, is checked on the ground it sits on. Tokens come from the vendored
 * stylesheet; Tailwind colours from a table measured in Chrome 154 (canvas, 2026-11-26), whose oklch sources are pinned
 * against the installed Tailwind theme so a palette change shows here. Translucent grounds are composited as Chrome
 * paints them. A must-fail control proves the check can fail: v0.57.0's classes fail it. The after-probe measures the
 * real pages in Chrome.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../hooks/useProduct', () => ({
  useProduct: () => ({ product: { id: 'p1', name: 'P' }, loading: false, lastSaved: null, updateProduct: () => {}, undo: () => {}, redo: () => {} }),
}));
vi.mock('../hooks/useAiConnectivity', () => ({
  useAiConnectivity: () => ({ sessionState: { sessionActive: false, aiConnected: false, boundProductId: null }, startSession: () => Promise.resolve(false), stopSession: () => {}, changePermissions: () => {}, dismissNotice: () => {} }),
}));
vi.mock('../lib/firebase', async orig => ({ ...(await orig<object>()), isFirebaseAvailable: true, functionsInstance: { __fns: true } }));
vi.mock('../lib/callables', () => ({ callGeneratePairingCode: vi.fn(async () => { throw new Error('no code'); }) }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ driver: { onSaveError: () => () => {}, loadPreferences: () => Promise.resolve({}) }, mode: 'local', storageReady: true }) }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: false }) }));

import ProductLayout from '../components/layout/ProductLayout';
import AboutView from '../pages/AboutView';
import ChangelogView from '../pages/ChangelogView';
import ConnectPanel from '../components/ConnectAI/ConnectPanel';
import Modal from '../components/ui/Modal';
import ReleaseDivider from '../components/storymap/ReleaseDivider';
import { req } from './testHelpers';

const SRC = resolve(__dirname, '..');
const FRAME = readFileSync(resolve(SRC, 'styles/spert-frame.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const TW_THEME = readFileSync(resolve(SRC, '../node_modules/tailwindcss/theme.css'), 'utf8');

type Theme = 'light' | 'dark';
type State = 'rest' | 'hover';

// ---- colour arithmetic ----
const rgb = (h: string) => [1, 3, 5].map(i => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (h: string) => { const [r, g, b] = rgb(h).map(lin) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** `top` at `alpha` over the opaque `base`, as a canvas paints it (sRGB, rounded). */
const over = (top: string, alpha: number, base: string) =>
  '#' + rgb(top).map((c, i) => Math.round(alpha * c + (1 - alpha) * (rgb(base)[i] ?? 0)).toString(16).padStart(2, '0')).join('');

// ---- Tailwind 4's colours as Chrome 154 paints them (canvas, 2026-11-26), with the oklch each came from ----
const PALETTE: Record<string, [oklch: string, hex: string]> = {
  'blue-50': ['oklch(97% 0.014 254.604)', '#eff6ff'], 'blue-100': ['oklch(93.2% 0.032 255.585)', '#dbeafe'],
  'blue-300': ['oklch(80.9% 0.105 251.813)', '#8ec5ff'], 'blue-400': ['oklch(70.7% 0.165 254.624)', '#50a2ff'],
  'blue-500': ['oklch(62.3% 0.214 259.815)', '#2b7fff'], 'blue-600': ['oklch(54.6% 0.245 262.881)', '#155dfc'],
  'blue-700': ['oklch(48.8% 0.243 264.376)', '#1447e6'], 'blue-800': ['oklch(42.4% 0.199 265.638)', '#193cb8'],
  'blue-900': ['oklch(37.9% 0.146 265.522)', '#1c398e'],
  'gray-100': ['oklch(96.7% 0.003 264.542)', '#f3f4f6'], 'gray-200': ['oklch(92.8% 0.006 264.531)', '#e5e7eb'],
  'gray-300': ['oklch(87.2% 0.01 258.338)', '#d1d5dc'], 'gray-400': ['oklch(70.7% 0.022 261.325)', '#99a1af'],
  'gray-500': ['oklch(55.1% 0.027 264.364)', '#6a7282'], 'gray-600': ['oklch(44.6% 0.03 256.802)', '#4a5565'],
  'gray-700': ['oklch(37.3% 0.034 259.733)', '#364153'], 'gray-800': ['oklch(27.8% 0.033 256.848)', '#1e2939'],
  'gray-900': ['oklch(21% 0.034 264.665)', '#101828'],
  'red-400': ['oklch(70.4% 0.191 22.216)', '#ff6467'], 'red-500': ['oklch(63.7% 0.237 25.331)', '#fb2c36'],
};
const hex = (name: string) => req(PALETTE[name], `palette ${name}`)[1];
function token(theme: Theme, name: string): string {
  const at = FRAME.indexOf(theme === 'light' ? '\n:root {' : '\n:root.dark, :root[data-theme="dark"] {');
  return req(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(FRAME.slice(at, FRAME.indexOf('}', at)))?.[1], `--${name}`).toLowerCase();
}
const PAGE = { light: token('light', 'sf-page'), dark: token('dark', 'sf-page') };

/**
 * The text colour a class list gives in a theme and state. Tailwind's order: in dark, `dark:hover:` then `dark:` win;
 * a state with no class of its own takes the rest colour. Tokens (`text-[color:var(--sf-…)]`) resolve per theme.
 */
function textColour(cls: string[], theme: Theme, state: State): string {
  const order = theme === 'light'
    ? (state === 'hover' ? ['hover:', ''] : [''])
    : (state === 'hover' ? ['dark:hover:', 'dark:', 'hover:', ''] : ['dark:', '']);
  const find = (p: string) => cls.find(c => new RegExp(`^${p}text-(?:\\[color:var\\(--[a-z-]+\\)\\]|(?:blue|gray|red)-\\d+)$`).test(c));
  const c = req(order.map(find).find(Boolean), `text colour (${theme} ${state}) in "${cls.join(' ')}"`);
  const tok = /var\(--([a-z-]+)\)/.exec(c);
  return tok ? token(theme, req(tok[1], 'token')) : hex(c.replace(/^(?:dark:)?(?:hover:)?text-/, ''));
}
const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

interface Case { name: string; cls: () => string[]; ground: (t: Theme, s: State) => string; min: number }
function check(c: Case) {
  const out: string[] = [];
  for (const t of ['light', 'dark'] as const) for (const s of ['rest', 'hover'] as const) {
    const fg = textColour(c.cls(), t, s); const bg = c.ground(t, s); const r = contrast(fg, bg);
    if (r < c.min) out.push(`${c.name} ${t} ${s}: ${fg} on ${bg} = ${r.toFixed(2)} < ${c.min}`);
  }
  return out;
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '## Version 0.58.0 (2026-11-26)\n\nx\n' })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
async function renderAt(path: string, routes: React.ReactNode) {
  render(<MemoryRouter initialEntries={[path]}><Routes>{routes}</Routes></MemoryRouter>);
  await flush();
}

describe('the palette is the installed Tailwind theme\'s (re-measure in Chrome if this fails)', () => {
  it.each(Object.entries(PALETTE))('%s', (name, [oklch]) => {
    const m = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(TW_THEME);
    expect(m?.[1]?.trim()).toBe(oklch);
  });
});

describe('each element clears its bar, both themes, at rest and on hover', () => {
  it('S1: Connect AI, inactive, on the page ground (≥ 4.5)', async () => {
    await renderAt('/product/p1/structure', <Route path="/product/:productId" element={<ProductLayout />}><Route path="structure" element={<p>S</p>} /></Route>);
    const button = screen.getByRole('button', { name: 'Connect AI' });
    expect(check({ name: 'Connect AI', cls: () => classesOf(button), ground: t => PAGE[t], min: 4.5 })).toEqual([]);
  });

  it.each([['About', '/about', <Route key="a" path="/about" element={<AboutView />} />], ['the changelog', '/changelog', <Route key="c" path="/changelog" element={<ChangelogView />} />]] as const)(
    'S2: "← Back to Products" on %s, on the page ground (≥ 4.5)', async (_label, path, route) => {
      await renderAt(path, route);
      const link = screen.getByRole('link', { name: '← Back to Products' });
      expect(check({ name: 'back link', cls: () => classesOf(link), ground: t => PAGE[t], min: 4.5 })).toEqual([]);
    });

  it('S3 and the code line: ConnectPanel\'s Retry and "Valid 15 min …" on the dialog\'s card (≥ 4.5)', async () => {
    render(<ConnectPanel open onClose={() => {}} onChangePermissions={async () => true} onDisconnect={async () => {}}
      sessionState={{ sessionActive: true, aiConnected: false, consentRead: true, sessionId: 's1', boundProductId: 'p1', notice: null }} />);
    const retry = await screen.findByRole('button', { name: 'Retry' });
    const line = req(screen.getByText(/Valid 15 min|Generating code/), 'the code line');
    const card = { light: '#ffffff', dark: hex('gray-900') }; // Modal's card: bg-white dark:bg-gray-900
    expect(classesOf(req(retry.closest('[role="dialog"]'), 'dialog'))).toEqual(expect.arrayContaining(['bg-white', 'dark:bg-gray-900']));
    expect([
      ...check({ name: 'Retry', cls: () => classesOf(retry), ground: t => card[t], min: 4.5 }),
      ...check({ name: 'code line', cls: () => classesOf(line), ground: t => card[t], min: 4.5 }),
    ]).toEqual([]);
  });

  it('Modal\'s close "×" on its card (≥ 3, an icon), its name unchanged', () => {
    render(<Modal open onClose={() => {}} title="T"><p>body</p></Modal>);
    const close = screen.getByRole('button', { name: '×' });
    const card = { light: '#ffffff', dark: hex('gray-900') };
    expect(check({ name: '×', cls: () => classesOf(close), ground: t => card[t], min: 3 })).toEqual([]);
  });

  it('S4: +Release and the release "×" on the Map (≥ 4.5 and ≥ 3)', () => {
    render(<ReleaseDivider lane={{ releaseId: 'r1', releaseName: 'R1', y: 0, height: 120 }} totalWidth={800} isFirst isDropTarget={false}
      isDragging={false} collapsed={false} onToggleCollapse={() => {}} onRename={() => {}} onAddReleaseAfter={() => {}}
      onDeleteRelease={() => {}} hasAllocations={false} />);
    const adds = screen.getAllByRole('button', { name: '+ Release' });
    const deletes = screen.getAllByRole('button', { name: '×' });
    expect(adds).toHaveLength(2);
    expect(deletes).toHaveLength(2);
    // Light: its own blue-50 (blue-100 on hover). Dark: blue-900 at 40 % (60 % on hover) over the canvas, gray-800.
    const addGround = (t: Theme, s: State) => t === 'light' ? hex(s === 'rest' ? 'blue-50' : 'blue-100') : over(hex('blue-900'), s === 'rest' ? 0.4 : 0.6, hex('gray-800'));
    const canvas = { light: hex('gray-100'), dark: hex('gray-800') };
    expect([
      ...adds.flatMap(b => check({ name: '+ Release', cls: () => classesOf(b), ground: addGround, min: 4.5 })),
      ...deletes.flatMap(b => check({ name: 'release ×', cls: () => classesOf(b), ground: t => canvas[t], min: 3 })),
    ]).toEqual([]);
  });

  it('S4: +Rib, read from MapContent\'s source (it renders only under the pointer) (≥ 4.5)', () => {
    const source = readFileSync(resolve(SRC, 'components/storymap/MapContent.tsx'), 'utf8');
    const at = source.indexOf('+ Rib\n');
    const cls = req(/className="([^"]+)"/.exec(source.slice(source.lastIndexOf('<button', at), at))?.[1], '+ Rib className').split(/\s+/);
    const ground = (t: Theme, s: State) => t === 'light' ? hex(s === 'rest' ? 'blue-50' : 'blue-100') : over(hex('blue-900'), s === 'rest' ? 0.3 : 0.5, hex('gray-800'));
    expect(check({ name: '+ Rib', cls: () => cls, ground, min: 4.5 })).toEqual([]);
  });
});

describe('must-fail control: v0.57.0\'s classes fail the same check', () => {
  it.each([
    ['S1 / S2 / the code line', 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300', 4.5],
    ['S3 Retry', 'text-xs text-blue-600 hover:underline', 4.5],
    ['S4 +Release', 'text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300', 4.5],
    ['Modal ×', 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300', 3],
  ] as const)('%s', (name, old, min) => {
    const ground = (t: Theme) => t === 'light' ? (name === 'S4 +Release' ? hex('blue-50') : '#ffffff') : hex('gray-900');
    expect(check({ name, cls: () => old.split(' '), ground, min }).length).toBeGreaterThan(0);
  });
});
