// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

// B15 (v0.55.11) walk-throughs: the REAL ProductLayout + ConnectPanel +
// useAiConnectivity + local storage driver, over fixtures/aiSessionFake, with an
// observable generatePairingCode. Adopted from the PR #239 review's
// revWalk.test.tsx (Opus-PR239-1); W4b counts only the code requests made after
// the jump. Record keys are spelled out (`spert_ai_session:`) on purpose.
import { vi, it, expect, beforeEach, afterEach, describe } from 'vitest';
const pairing = vi.hoisted(() => ({
  calls: [] as string[],
  gate: null as Promise<void> | null,
}));
vi.mock('firebase/firestore', async () => (await import('./fixtures/aiSessionFake')).firestoreMock);
vi.mock('firebase/functions', async () => {
  const { functionsMock } = await import('./fixtures/aiSessionFake');
  return {
    httpsCallable: (fns: unknown, name: string) => {
      if (name === 'generatePairingCode') {
        return async (data: { sessionId: string }) => {
          pairing.calls.push(data.sessionId);
          const n = pairing.calls.length;
          const gate = pairing.gate;
          if (gate) await gate;
          return { data: { code: `WORD${n}-${data.sessionId.slice(0, 4)}`, expiresAt: '' } };
        };
      }
      return functionsMock.httpsCallable(fns, name);
    },
  };
});
vi.mock('../lib/firebase', () => ({
  db: { __db: true }, auth: null, functionsInstance: { __fns: true }, isFirebaseAvailable: true,
}));
const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: true }) }));

import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useNavigate, useOutletContext } from 'react-router-dom';
import { server, installFakeLocks } from './fixtures/aiSessionFake';
import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import ProductLayout from '../components/layout/ProductLayout';
import ConnectPanel from '../components/ConnectAI/ConnectPanel';
import type { OutletContextValue, Product } from '../types';

const driver = createLocalStorageDriver();
const REC = 'spert_ai_session:';

function makeProduct(id: string, name: string): Product {
  return {
    id, name, description: '', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    schemaVersion: 2, sizeMapping: [{ label: 'M', points: 5 }], releases: [], sprints: [], themes: [],
    releaseCardOrder: {}, sizingCardOrder: {}, _changeLog: [],
  } as unknown as Product;
}
function seedProducts(...ps: Array<[string, string]>) {
  for (const [id, name] of ps) localStorage.setItem(`rp:local:product_${id}`, JSON.stringify(makeProduct(id, name)));
  localStorage.setItem('rp:local:products_index', JSON.stringify(ps.map(([id, name]) => ({ id, name }))));
}
const record = (id: string) => JSON.parse(localStorage.getItem(REC + id) ?? 'null') as { sessionId: string } | null;
const stored = (id: string) => JSON.parse(localStorage.getItem(`rp:local:product_${id}`) ?? 'null') as Product | null;

const nav: Record<string, (to: string) => void> = {};
const rename: Record<string, (name: string) => void> = {};
function Page({ tab }: { tab: string }) {
  const { product, updateProduct } = useOutletContext<OutletContextValue>();
  const navigate = useNavigate();
  useEffect(() => {
    nav[tab] = navigate;
    rename[tab] = (name: string) => updateProduct(prev => ({ ...prev, name }));
  }, [tab, navigate, updateProduct]);
  return <p data-testid={`page-${tab}`}>{product.name}: {product.themes.map(t => t.name).join(',') || 'no themes'}</p>;
}
function layoutAt(path: string, tab: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>list</p>} />
        <Route path="/product/:productId" element={<ProductLayout />}>
          <Route path="structure" element={<Page tab={tab} />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
function renderTab(path: string, tab = 'tab1') {
  server.currentTab = tab;
  return render(layoutAt(path, tab));
}
const settle = async (n = 3) => {
  for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); });
};
function withinButton(container: HTMLElement, text: string) {
  const b = [...container.querySelectorAll('button')].find(x => x.textContent?.trim() === text);
  if (!b) throw new Error(`no button "${text}"; header has: ${[...container.querySelectorAll('header button')].map(x => x.textContent).join('|')}`);
  return b;
}
async function connectFirstTime(container: HTMLElement) {
  fireEvent.click(withinButton(container, 'Connect AI'));
  await settle();
  const connect = [...document.querySelectorAll('button')].find(b => b.textContent === 'Connect')!;
  fireEvent.click(connect);
  await settle(5);
}
async function pressConnect(container: HTMLElement) {
  fireEvent.click(withinButton(container, 'Connect AI'));
  await settle(6);
}
const panelEl = () => [...document.querySelectorAll('div.fixed.inset-0')].find(d => d.querySelector('h2')?.textContent === 'AI session active') ?? null;
const panelText = () => panelEl()?.textContent ?? null;
const shownCode = () => panelEl()?.querySelector('.font-mono')?.textContent ?? '';
const DOTS = '••••• · ••••';
/** Hold every code request made from now until the returned function is called. */
function holdCodes() {
  let release: () => void = () => {};
  pairing.gate = new Promise<void>(r => { release = r; });
  return () => release();
}

let locks: ReturnType<typeof installFakeLocks>;
beforeEach(() => {
  localStorage.clear(); server.reset(); pairing.calls = []; pairing.gate = null;
  storage.value = { driver, mode: 'local', storageReady: true };
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('scrollTo', vi.fn());
  locks = installFakeLocks();
});
afterEach(() => { cleanup(); flushPendingSaves(); locks.remove(); vi.unstubAllGlobals(); localStorage.clear(); });

// ─── R-5: a history jump with the panel open (review finding 01) ─────────────
describe('W4 history jump A → B with the panel open', () => {
  it('the panel goes, no code is requested for A from B, A\'s op stays out of B', async () => {
    seedProducts(['A', 'Alpha'], ['B', 'Bravo']);
    const t1 = renderTab('/product/A/structure');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t1.container);
    const sA = record('A')!.sessionId;
    expect(panelText()).toContain('AI session active');
    const callsBefore = pairing.calls.length;
    await act(async () => { nav.tab1!('/product/B/structure'); });
    await settle(6);
    expect(screen.getByTestId('page-tab1').textContent).toBe('Bravo: no themes');
    expect(panelText()).toBeNull();
    expect(withinButton(t1.container, 'Connect AI')).toBeTruthy();
    expect(pairing.calls.slice(callsBefore)).toEqual([]);
    server.aiWrite(sA, 'create_theme', { themeId: 'ai-theme-x', name: 'AI-built theme' });
    await settle();
    expect(screen.getByTestId('page-tab1').textContent).toBe('Bravo: no themes');
    expect(record('A')!.sessionId).toBe(sA);
    // Connect AI on B: named line, A ended (this tab released its lock), waiting op not applied.
    await pressConnect(t1.container);
    expect(panelText()).toContain('was for “Alpha”, so this is a new session for “Bravo”');
    expect(panelText()).toContain('Changes your AI sent for “Alpha” were not applied.');
    expect(server.teardownCalls).toEqual([sA]);
    expect(pairing.calls.slice(callsBefore)).toEqual([record('B')!.sessionId]);
  });
});

describe('W4b a slow code request after the jump', () => {
  it('no code is requested for A from B, so none can reach B\'s new panel', async () => {
    seedProducts(['A', 'Alpha'], ['B', 'Bravo']);
    const t1 = renderTab('/product/A/structure');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t1.container);
    const sA = record('A')!.sessionId;
    const callsBefore = pairing.calls.length;
    const releaseA = holdCodes();                       // a request for A made on B would hang here
    await act(async () => { nav.tab1!('/product/B/structure'); });
    await settle(6);
    const aRequestedOnB = pairing.calls.slice(callsBefore).includes(sA);
    const releaseB = holdCodes();                       // B's own request hangs for now
    await pressConnect(t1.container);
    releaseA();                                         // anything for A arrives first
    await settle(4);
    const shownWhileBPending = shownCode();
    releaseB();
    await settle(4);
    expect({ aRequestedOnB, shownWhileBPending }).toEqual({ aRequestedOnB: false, shownWhileBPending: DOTS });
    expect(shownCode().endsWith(record('B')!.sessionId.slice(0, 4))).toBe(true);
  });
});

describe('W4c a jump while A is still in use by another tab', () => {
  it('B\'s panel never shows a code for A\'s live session', async () => {
    seedProducts(['A', 'Alpha'], ['B', 'Bravo']);
    const t1 = renderTab('/product/A/structure', 'tab1');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t1.container);
    fireEvent.keyDown(document, { key: 'Escape' });
    await settle();
    const sA = record('A')!.sessionId;
    const t2 = renderTab('/product/A/structure', 'tab2');      // a second tab on A shares the session
    await screen.findByTestId('page-tab2');
    await pressConnect(t2.container);
    fireEvent.keyDown(document, { key: 'Escape' });
    await settle();
    fireEvent.click(withinButton(t1.container, 'AI'));         // reopen tab 1's panel, then jump
    await settle();
    const callsBefore = pairing.calls.length;
    const releaseA = holdCodes();
    await act(async () => { nav.tab1!('/product/B/structure'); });
    await settle(6);
    const releaseB = holdCodes();
    await pressConnect(t1.container);
    releaseA();
    await settle(4);
    const shown = shownCode();
    const notice = panelText()?.includes('still open in another tab');
    releaseB();
    await settle(4);
    expect(server.sessions.has(sA)).toBe(true);                 // A is live: a code for it would pair an AI with A
    expect(notice).toBe(true);
    expect(shown.endsWith(sA.slice(0, 4))).toBe(false);
    expect(pairing.calls.slice(callsBefore)).not.toContain(sA);
  });
});

describe('ConnectPanel: a code that returns after the session changed', () => {
  it('is dropped; the panel waits for the current session\'s code', async () => {
    const base = { sessionActive: true, aiConnected: false, consentRead: false, boundProductId: 'A', notice: null };
    const props = { open: true, onClose: () => {}, onChangePermissions: async () => true, onDisconnect: async () => {} };
    const releaseOld = holdCodes();
    const r = render(<ConnectPanel {...props} sessionState={{ ...base, sessionId: 'old1-session' }} />);
    await settle();
    const releaseNew = holdCodes();
    r.rerender(<ConnectPanel {...props} sessionState={{ ...base, sessionId: 'new2-session' }} />);
    await settle();
    expect(pairing.calls).toEqual(['old1-session', 'new2-session']);
    releaseOld();
    await settle();
    expect(shownCode()).toBe(DOTS);
    releaseNew();
    await settle();
    expect(shownCode()).toBe('WORD2 · new2');
  });
});

// ─── R-7 / PF-01: the cursor (review finding 03) ─────────────────────────────
describe('W3b the cursor moves when an op applies', () => {
  it('an op applied live on A is not applied again after a reload resumes A', async () => {
    seedProducts(['A', 'Alpha']);
    const pa = makeProduct('A', 'Alpha') as unknown as Record<string, unknown>;
    pa.themes = [{ id: 't1', name: 'T', order: 1, backboneItems: [{ id: 'b1', name: 'B', order: 1, ribItems: [
      { id: 'r1', name: 'R', description: '', order: 1, size: null, category: 'core', releaseAllocations: [], progressHistory: [], notes: '' }] }] }];
    localStorage.setItem('rp:local:product_A', JSON.stringify(pa));
    const t1 = renderTab('/product/A/structure');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t1.container);
    const sA = record('A')!.sessionId;
    server.aiWrite(sA, 'append_rib_note', { ribId: 'r1', text: 'once' });   // not idempotent: a replay appends again
    await settle();
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });   // the driver's save debounce
    flushPendingSaves();
    t1.unmount();                                                               // the reload
    const t2 = renderTab('/product/A/structure');
    await screen.findByTestId('page-tab1');
    await pressConnect(t2.container);
    expect(record('A')!.sessionId).toBe(sA);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    flushPendingSaves();
    const rib = stored('A')!.themes[0]!.backboneItems[0]!.ribItems[0]!;
    expect(rib.notes).toBe('once');
  });
});
