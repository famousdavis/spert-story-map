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

import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useNavigate, useOutletContext } from 'react-router-dom';
import { server, installFakeLocks } from './fixtures/aiSessionFake';
import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import { endAiSessionForSignOut } from '../lib/aiSessionTeardown';
import { AI_CONSENT_KEY } from '../lib/aiConstants';
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
// Waits are for a state, not a number of turns: under load React can render a
// turn later than a fixed number of settles allows.
const WAIT = { timeout: 3000 };
async function panelOpens() {
  await waitFor(() => { if (!panelEl()) throw new Error('the Connect AI panel did not open'); }, WAIT);
  await settle(2);
}
async function closePanel() {
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => { if (panelEl()) throw new Error('the Connect AI panel did not close'); }, WAIT);
}
async function shows(tab: string, text: string) {
  await waitFor(() => expect(screen.getByTestId(`page-${tab}`).textContent).toBe(text), WAIT);
  await settle(1);
}
async function showsTheme(tab: string) {
  await waitFor(() => expect(screen.getByTestId(`page-${tab}`).textContent).toContain('AI-built theme'), WAIT);
}
// A press is made only after the page's effects have run, as a person's click
// always is: the hook reads the open product from a ref its effect sets, and a
// click inside the commit that first shows the page finds that ref still empty.
async function connectFirstTime(container: HTMLElement) {
  await settle(1);
  fireEvent.click(withinButton(container, 'Connect AI'));
  const connect = await waitFor(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'Connect');
    if (!b) throw new Error('no Connect button');
    return b;
  }, WAIT);
  fireEvent.click(connect);
  await panelOpens();
}
async function pressConnect(container: HTMLElement) {
  await settle(1);
  fireEvent.click(withinButton(container, 'Connect AI'));
  await panelOpens();
}
async function reopenPanel(container: HTMLElement) {
  fireEvent.click(withinButton(container, 'AI'));
  await panelOpens();
}
const panelEl = () => [...document.querySelectorAll('div.fixed.inset-0')].find(d => d.querySelector('h2')?.textContent === 'AI session active') ?? null;
const panelText = () => panelEl()?.textContent ?? null;
const shownCode = () => panelEl()?.querySelector('.font-mono')?.textContent ?? '';
const DOTS = '••••• · ••••••••••';
const THEME = { themeId: 'ai-theme-x', name: 'AI-built theme' };
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
    await shows('tab1', 'Bravo: no themes');
    await waitFor(() => expect(withinButton(t1.container, 'Connect AI')).toBeTruthy(), WAIT);
    await settle(3);
    expect(panelText()).toBeNull();
    expect(pairing.calls.slice(callsBefore)).toEqual([]);
    server.aiWrite(sA, 'create_theme', THEME);
    await settle();
    expect(screen.getByTestId('page-tab1').textContent).toBe('Bravo: no themes');
    expect(record('A')!.sessionId).toBe(sA);
    // Connect AI on B: named line, A ended (this tab released its lock), waiting op not applied.
    await pressConnect(t1.container);
    expect(panelText()).toContain('was for “Alpha”, so this is a new session for “Bravo”');
    expect(panelText()).toContain('Changes your AI sent for “Alpha” were not applied.');
    expect(server.teardownCalls).toEqual([sA]);
    await waitFor(() => expect(pairing.calls.slice(callsBefore)).toEqual([record('B')!.sessionId]), WAIT);
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
    await shows('tab1', 'Bravo: no themes');
    await settle(3);
    const aRequestedOnB = pairing.calls.slice(callsBefore).includes(sA);
    const releaseB = holdCodes();                       // B's own request hangs for now
    await pressConnect(t1.container);
    releaseA();                                         // anything for A arrives first
    await settle(4);
    const shownWhileBPending = shownCode();
    releaseB();
    expect({ aRequestedOnB, shownWhileBPending }).toEqual({ aRequestedOnB: false, shownWhileBPending: DOTS });
    await waitFor(() => expect(shownCode().endsWith(record('B')!.sessionId.slice(0, 4))).toBe(true), WAIT);
  });
});

describe('W4c a jump while A is still in use by another tab', () => {
  it('B\'s panel never shows a code for A\'s live session', async () => {
    seedProducts(['A', 'Alpha'], ['B', 'Bravo']);
    const t1 = renderTab('/product/A/structure', 'tab1');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t1.container);
    await closePanel();
    const sA = record('A')!.sessionId;
    const t2 = renderTab('/product/A/structure', 'tab2');      // a second tab on A shares the session
    await screen.findByTestId('page-tab2');
    await pressConnect(t2.container);
    await closePanel();
    await reopenPanel(t1.container);                           // reopen tab 1's panel, then jump
    const callsBefore = pairing.calls.length;
    const releaseA = holdCodes();
    await act(async () => { nav.tab1!('/product/B/structure'); });
    await shows('tab1', 'Bravo: no themes');
    await settle(3);
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
    await waitFor(() => expect(shownCode()).toBe('WORD2 · new2'), WAIT);
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

// ─── The other walk-throughs (review finding 04): ProductLayout's start gate,
// the notice cleared on close, and the recorded name, through the real layout ──
describe('W1 build in A, leave, Connect AI in B', () => {
  it('B gets a new session with the named line; A is ended; A\'s op is not in B; closing clears the line', async () => {
    seedProducts(['A', 'Alpha'], ['B', 'Bravo']);
    const t1 = renderTab('/product/A/structure');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t1.container);
    expect(panelText()).toContain('AI session active');
    const sA = record('A')!.sessionId;
    server.aiWrite(sA, 'create_theme', THEME);
    await showsTheme('tab1');
    t1.unmount();
    server.aiWrite(sA, 'create_theme', { themeId: 'second', name: 'Second for A' });   // waiting
    const t2 = renderTab('/product/B/structure');
    await screen.findByTestId('page-tab1');
    await pressConnect(t2.container);
    expect(panelText()).toContain('Your earlier Connect AI session was for “Alpha”, so this is a new session for “Bravo”. Give your AI the new code and tell it you are now in “Bravo”. Changes your AI sent for “Alpha” were not applied.');
    expect(server.teardownCalls).toEqual([sA]);
    expect(record('A')).toBeNull();
    expect(screen.getByTestId('page-tab1').textContent).toBe('Bravo: no themes');
    expect(pairing.calls.filter(id => id === sA).length).toBe(1);   // only while A was open
    await closePanel();                                              // close: the line goes with the panel
    await reopenPanel(t2.container);
    expect(panelText()).not.toContain('earlier Connect AI session');
  });
});

describe('W2 two tabs', () => {
  it('tab 2 on B: the still-open line, A kept, A\'s op lands only in tab 1', async () => {
    seedProducts(['A', 'Alpha'], ['B', 'Bravo']);
    const t1 = renderTab('/product/A/structure', 'tab1');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t1.container);
    await closePanel();
    const sA = record('A')!.sessionId;
    const t2 = renderTab('/product/B/structure', 'tab2');
    await screen.findByTestId('page-tab2');
    await pressConnect(t2.container);
    expect(panelText()).toContain('Your Connect AI session for “Alpha” is still open in another tab, so this is a new session for “Bravo”. Give your AI the new code.');
    expect(server.teardownCalls).toEqual([]);
    server.aiWrite(sA, 'create_theme', THEME);
    await showsTheme('tab1');
    expect(screen.getByTestId('page-tab2').textContent).toBe('Bravo: no themes');
  });
});

describe('W3 reload on A', () => {
  it('Connect AI resumes the same session with no line, and the waiting op lands in A', async () => {
    seedProducts(['A', 'Alpha'], ['B', 'Bravo']);
    const t1 = renderTab('/product/A/structure');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t1.container);
    const sA = record('A')!.sessionId;
    t1.unmount();
    server.aiWrite(sA, 'create_theme', THEME);
    const t2 = renderTab('/product/A/structure');
    await screen.findByTestId('page-tab1');
    await pressConnect(t2.container);
    expect(record('A')!.sessionId).toBe(sA);
    expect(panelText()).toContain('AI session active');
    expect(panelText()).not.toContain('earlier Connect AI session');
    await showsTheme('tab1');
  });
});

describe('W5 Disconnect in one tab with another live', () => {
  it('the other tab keeps its session and the consent', async () => {
    seedProducts(['A', 'Alpha'], ['B', 'Bravo']);
    const t1 = renderTab('/product/A/structure', 'tab1');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t1.container);
    await closePanel();
    const t2 = renderTab('/product/B/structure', 'tab2');
    await screen.findByTestId('page-tab2');
    await pressConnect(t2.container);
    await closePanel();
    const sB = record('B')!.sessionId;
    await reopenPanel(t1.container);
    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent === 'Disconnect')!);
    await waitFor(() => expect(record('A')).toBeNull(), WAIT);
    expect(record('B')!.sessionId).toBe(sB);
    expect(localStorage.getItem(AI_CONSENT_KEY)).not.toBeNull();
    expect(withinButton(t2.container, 'AI')).toBeTruthy();
    expect(server.sessions.has(sB)).toBe(true);
  });
});

describe('W6 sign-out with sessions recorded for several products, one tab live', () => {
  it('ends them all; the live tab disconnects and its panel goes', async () => {
    seedProducts(['A', 'Alpha'], ['B', 'Bravo']);
    const t1 = renderTab('/product/A/structure', 'tab1');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t1.container);
    const sA = record('A')!.sessionId;
    await act(async () => { nav.tab1!('/product/B/structure'); });
    await shows('tab1', 'Bravo: no themes');
    await pressConnect(t1.container);                  // A is ended here (not in use): only B is left
    const sB = record('B')!.sessionId;
    server.seed('sC', { openProductId: 'C' });         // another product's session from an earlier visit
    localStorage.setItem(REC + 'C', JSON.stringify({ sessionId: 'sC', productName: 'Charlie', startedAt: 1 }));
    expect(panelText()).toContain('AI session active');
    const r = await act(async () => endAiSessionForSignOut());
    expect(r).toEqual({ attempted: true, serverOk: true });
    expect([...server.teardownCalls].sort()).toEqual([sA, sB, 'sC'].sort());
    expect([record('B'), record('C'), localStorage.getItem(AI_CONSENT_KEY)]).toEqual([null, null, null]);
    await waitFor(() => expect(panelText()).toBeNull(), WAIT);
    await waitFor(() => expect(withinButton(t1.container, 'Connect AI')).toBeTruthy(), WAIT);
  });
});

describe('W7 a session from v0.55.10 (legacy)', () => {
  it('is never resumed; the neutral line; ended; its key removed', async () => {
    const legacy = '11111111-1111-1111-1111-111111111111';
    seedProducts(['A', 'Alpha']);
    server.seed(legacy, { openProductId: 'A' });
    localStorage.setItem('spert_ai_session_id', legacy);
    localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({ version: 1, date: '', write: true, read: false }));
    server.aiWrite(legacy, 'create_theme', THEME);    // waiting in the legacy session
    const t = renderTab('/product/A/structure');
    await screen.findByTestId('page-tab1');
    await pressConnect(t.container);
    expect(panelText()).toContain('Your earlier Connect AI session can’t be continued here, so this is a new session. Give your AI the new code. Changes your AI sent in that session were not applied.');
    expect(server.teardownCalls).toEqual([legacy]);
    expect(localStorage.getItem('spert_ai_session_id')).toBeNull();
    expect(screen.getByTestId('page-tab1').textContent).toBe('Alpha: no themes');
  });
});

describe('W8 storage swap', () => {
  it('A → null → A drains the null-window op into A', async () => {
    seedProducts(['A', 'Alpha']);
    const t = renderTab('/product/A/structure');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t.container);
    const sA = record('A')!.sessionId;
    const hanging = { ...driver, loadProduct: () => new Promise<null>(() => {}) };
    storage.value = { driver: hanging, mode: 'local', storageReady: false };   // the driver swaps
    t.rerender(layoutAt('/product/A/structure', 'tab1'));
    await settle(3);
    server.aiWrite(sA, 'create_theme', THEME);
    await settle(3);
    storage.value = { driver, mode: 'local', storageReady: true };
    t.rerender(layoutAt('/product/A/structure', 'tab1'));
    await showsTheme('tab1');
    expect(stored('A')).not.toBeNull();
  });
});

describe('W8b uploading to cloud storage gives the product a new id (same name)', () => {
  it('Connect AI on the new id: the neutral line, the old session ended', async () => {
    const old = '22222222-2222-2222-2222-222222222222';
    seedProducts(['A2', 'Alpha']);
    server.seed(old, { openProductId: 'A', lastSeq: 0 });
    localStorage.setItem(REC + 'A', JSON.stringify({ sessionId: old, productName: 'Alpha', startedAt: 5 }));
    localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({ version: 1, date: '', write: true, read: false }));
    server.aiWrite(old, 'create_theme', THEME);
    const t = renderTab('/product/A2/structure');
    await screen.findByTestId('page-tab1');
    await pressConnect(t.container);
    expect(panelText()).toContain('Your earlier Connect AI session can’t be continued here, so this is a new session. Give your AI the new code. Changes your AI sent in that session were not applied.');
    expect(server.teardownCalls).toEqual([old]);
  });
});

describe('W10 rename under a live session, then Connect AI elsewhere', () => {
  it('the line names the product by its current name', async () => {
    seedProducts(['A', 'Alpha'], ['B', 'Bravo']);
    const t1 = renderTab('/product/A/structure');
    await screen.findByTestId('page-tab1');
    await connectFirstTime(t1.container);
    await closePanel();
    await act(async () => { rename.tab1!('Alpha Renamed'); });
    await settle();
    await act(async () => { nav.tab1!('/product/B/structure'); });
    await shows('tab1', 'Bravo: no themes');
    await pressConnect(t1.container);
    expect(panelText()).toContain('was for “Alpha Renamed”');
  });
});
