// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

// B15 (v0.55.11): a Connect AI session belongs to the product it was started in.
// Runs the REAL useAiConnectivity hook against fixtures/aiSessionFake. Each
// defect path has a matching-product control; every "must not" here was red at
// 63ea2b3. Record keys are spelled out (`spert_ai_session:`) on purpose.
import { vi, it, expect, beforeEach, afterEach, describe } from 'vitest';
vi.mock('firebase/firestore', async () => (await import('./fixtures/aiSessionFake')).firestoreMock);
vi.mock('firebase/functions', async () => (await import('./fixtures/aiSessionFake')).functionsMock);
vi.mock('../lib/firebase', () => ({
  db: { __db: true }, auth: null, functionsInstance: { __fns: true }, isFirebaseAvailable: true,
}));
import { renderHook, act, render, screen, cleanup } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { server, installFakeLocks } from './fixtures/aiSessionFake';
import { useAiConnectivity } from '../hooks/useAiConnectivity';
import { getLastSeq } from '../hooks/aiConnectivityUtils';
import { endAiSessionForSignOut, retryPendingAiTeardown } from '../lib/aiSessionTeardown';
import { AI_CONSENT_KEY, AI_TEARDOWN_PENDING_KEY } from '../lib/aiConstants';
import ConnectPanel from '../components/ConnectAI/ConnectPanel';
import type { Product, ProductUpdater } from '../types';

const LEGACY_KEY = 'spert_ai_session_id';
const REC = 'spert_ai_session:';
type Store = Record<string, Product>;
function makeProduct(id: string, name: string): Product {
  return {
    id, name, description: '', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    schemaVersion: 2, sizeMapping: [{ label: 'M', points: 5 }], releases: [], sprints: [], themes: [],
    releaseCardOrder: {}, sizingCardOrder: {}, _changeLog: [],
  } as unknown as Product;
}
const THEME = { themeId: 'ai-theme-for-A', name: 'Checkout (built for A)' };
const has = (p: Product | undefined) => !!p?.themes.some(t => t.id === THEME.themeId);
const store2 = (): Store => ({ A: makeProduct('A', 'Alpha'), B: makeProduct('B', 'Bravo') });
const record = (productId: string) =>
  JSON.parse(localStorage.getItem(REC + productId) ?? 'null') as { sessionId: string; productName: string; startedAt: number } | null;

/** One browser tab. updateProduct is a React state updater, as useProduct's is (it runs at render). */
function useTab(store: Store, initial: string | null) {
  const [product, setProduct] = useState<Product | null>(initial ? store[initial] ?? null : null);
  const updateProduct = useCallback((u: ProductUpdater) => {
    setProduct(prev => {
      if (!prev) return prev;
      const next = typeof u === 'function' ? u(prev) : u;
      store[next.id] = next;
      return next;
    });
  }, [store]);
  const ai = useAiConnectivity(product, updateProduct);
  return { ai, open: (id: string | null) => setProduct(id ? store[id] ?? null : null) };
}
type Tab = { current: ReturnType<typeof useTab> };
const flush = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
function openTab(store: Store, initial: string | null, name = 'tab1') {
  server.currentTab = name;
  return renderHook(() => useTab(store, initial));
}
/** What ProductLayout's Connect AI button does with stored consent (or the dialog's Connect, first time). */
async function press(tab: Tab, read = false) {
  const stored = JSON.parse(localStorage.getItem(AI_CONSENT_KEY) ?? 'null') as { read?: boolean } | null;
  let ok = false;
  await act(async () => { ok = await tab.current.ai.startSession(stored ? (stored.read ?? false) : read); });
  await flush();
  return ok;
}
const sid = (tab: Tab) => tab.current.ai.sessionState.sessionId;

let locks: ReturnType<typeof installFakeLocks>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  localStorage.clear(); server.reset();
  locks = installFakeLocks();
});
afterEach(() => { cleanup(); locks.remove(); vi.useRealTimers(); });

// ─── §1: every path, with its control ────────────────────────────────────────
describe('§1 (a)/(d) Connect AI in B after leaving A', () => {
  async function run(reopen: 'A' | 'B') {
    const store = store2();
    const t1 = openTab(store, 'A');
    await press(t1.result);
    const sA = sid(t1.result)!;
    t1.unmount();
    server.aiWrite(sA, 'create_theme', THEME);
    const t2 = openTab(store, reopen);
    await press(t2.result);
    return { store, sA, t2 };
  }
  it('A\'s queued change does not land in B, and B gets its own session', async () => {
    const { store, sA, t2 } = await run('B');
    expect(has(store.B)).toBe(false);
    expect(sid(t2.result)).not.toBe(sA);
    expect(record('B')?.sessionId).toBe(sid(t2.result));
  });
  it('control: reopening A resumes A\'s session and the change lands in A', async () => {
    const { store, sA, t2 } = await run('A');
    expect(sid(t2.result)).toBe(sA);
    expect(has(store.A)).toBe(true);
  });
});

describe('§1 (b) same mount, A → B by a history jump', () => {
  it('A\'s change does not land in B; the session disconnects locally and stays with A', async () => {
    const store = store2();
    const t = openTab(store, 'A');
    await press(t.result);
    const sA = sid(t.result)!;
    act(() => t.result.current.open('B'));
    await flush();
    server.aiWrite(sA, 'create_theme', THEME);
    await flush();
    expect(has(store.B)).toBe(false);
    expect(t.result.current.ai.sessionState).toMatchObject({ sessionActive: false, sessionId: null });
    expect(server.sessions.has(sA)).toBe(true);
    expect(record('A')?.sessionId).toBe(sA);
    expect(locks.held).toEqual([]);
  });
  it('control: staying on A, the change lands in A', async () => {
    const store = store2();
    const t = openTab(store, 'A');
    await press(t.result);
    server.aiWrite(sid(t.result)!, 'create_theme', THEME);
    await flush();
    expect(has(store.A)).toBe(true);
  });
});

describe('§1 (c) the null-window drain (A → null → ?)', () => {
  async function run(next: 'A' | 'B') {
    const store = store2();
    const t = openTab(store, 'A');
    await press(t.result);
    const sA = sid(t.result)!;
    act(() => t.result.current.open(null));
    server.aiWrite(sA, 'create_theme', THEME);
    await flush();
    act(() => t.result.current.open(next));
    await flush();
    return store;
  }
  it('A\'s null-window op is not drained into B', async () => { expect(has((await run('B')).B)).toBe(false); });
  it('control: A comes back and the drain applies it to A (null is not a product change)', async () => {
    expect(has((await run('A')).A)).toBe(true);
  });
});

describe('§1 (e) two tabs', () => {
  async function run(tab2On: 'A' | 'B', order: 'registration' | 'reverse') {
    const s1 = store2(); const s2 = store2();
    const t1 = openTab(s1, 'A', 'tab1');
    await press(t1.result);
    const t2 = openTab(s2, tab2On, 'tab2');
    await press(t2.result);
    server.aiWrite(sid(t1.result)!, 'create_theme', THEME, order);
    await flush();
    return { s1, s2, same: sid(t1.result) === sid(t2.result) };
  }
  // Inverted from Char-B15-1's "(e) tab 2 resumes the SAME session", which asserted the old behaviour.
  it('tab 2 on B gets a new session, not tab 1\'s', async () => { expect((await run('B', 'registration')).same).toBe(false); });
  it.each(['registration', 'reverse'] as const)('A\'s change lands in tab 1\'s A and never in tab 2\'s B (%s)', async order => {
    const { s1, s2 } = await run('B', order);
    expect(has(s2.B)).toBe(false);
    expect(has(s1.A)).toBe(true);
    expect(record('B')).not.toBeNull();               // tab 2's own session is recorded for B
  });
  it('control: tab 2 also on A shares the session', async () => { expect((await run('A', 'reverse')).same).toBe(true); });
});

describe('§1 (f)/(f2) the snapshot the AI reads, and (g) openProductId', () => {
  it('(f) after Connect AI in B, A\'s session never carries B\'s snapshot', async () => {
    const store = store2();
    const t1 = openTab(store, 'A');
    await press(t1.result, true);
    const sA = sid(t1.result)!;
    t1.unmount();
    const t2 = openTab(store, 'B');
    await press(t2.result);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(server.snapshotWrites.filter(w => w.sessionId === sA).every(w => w.productId === 'A')).toBe(true);
    expect(server.snapshotWrites.some(w => w.sessionId === sid(t2.result) && w.productId === 'B')).toBe(true);
  });
  it('(f2)+(g) a jump to B with Read on writes neither B\'s snapshot nor B as openProductId into A\'s session', async () => {
    const store = store2();
    const t = openTab(store, 'A');
    await press(t.result, true);
    const sA = sid(t.result)!;
    act(() => t.result.current.open('B'));
    await flush();
    act(() => { vi.advanceTimersByTime(65_000); });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(server.snapshotWrites.filter(w => w.sessionId === sA).every(w => w.productId === 'A')).toBe(true);
    expect(server.openProductIdWrites.filter(w => w.sessionId === sA).map(w => w.value)).not.toContain('B');
  });
  it('(b)+(d) jump to B, reload on B, Connect AI: A\'s change does not land in B', async () => {
    const store = store2();
    const t1 = openTab(store, 'A');
    await press(t1.result);
    const sA = sid(t1.result)!;
    act(() => t1.result.current.open('B'));
    await flush();
    t1.unmount();
    server.aiWrite(sA, 'create_theme', THEME);
    const t2 = openTab(store, 'B');
    await press(t2.result);
    expect(has(store.B)).toBe(false);
  });
  it('control (g): while live on A, the heartbeat writes A', async () => {
    const t = openTab(store2(), 'A');
    await press(t.result);
    act(() => { vi.advanceTimersByTime(31_000); });
    await flush();
    const writes = server.openProductIdWrites.filter(w => w.sessionId === sid(t.result));
    expect(writes.length).toBeGreaterThan(1);
    expect(writes.every(w => w.value === 'A')).toBe(true);
  });
});

// ─── R-7 / PF-01: the in-updater guard and the cursor ────────────────────────
describe('R-7 an op that arrives while B\'s load is queued but not rendered', () => {
  it('is not applied to B, does not move the cursor, and lands in A when A resumes', async () => {
    const store = store2();
    const t = openTab(store, 'A');
    await press(t.result);
    const sA = sid(t.result)!;
    let seq = 0;
    act(() => {
      t.result.current.open('B');                    // the load lands (queued)
      seq = server.aiWrite(sA, 'create_theme', THEME);  // A's op arrives in the same task
    });
    await flush();
    expect(has(store.B)).toBe(false);
    expect(getLastSeq(sA)).toBeLessThan(seq);
    act(() => t.result.current.open('A'));
    await flush();
    await press(t.result);
    expect(sid(t.result)).toBe(sA);
    expect(has(store.A)).toBe(true);
  });
});

// ─── R-1 / R-11: records, Disconnect, reload, sign-out ───────────────────────
describe('R-1/R-11', () => {
  it('Disconnect in one tab leaves the other tab\'s entry, session and consent', async () => {
    const t1 = openTab(store2(), 'A', 'tab1');
    await press(t1.result);
    const sA = sid(t1.result)!;
    const t2 = openTab(store2(), 'B', 'tab2');
    await press(t2.result);
    const sB = sid(t2.result)!;
    await act(async () => { await t1.result.current.ai.stopSession(); });
    await flush();
    expect(server.teardownCalls).toEqual([sA]);
    expect(record('A')).toBeNull();
    expect(record('B')?.sessionId).toBe(sB);
    expect(server.sessions.has(sB)).toBe(true);
    expect(localStorage.getItem(AI_CONSENT_KEY)).not.toBeNull();
    expect(t2.result.current.ai.sessionState.sessionActive).toBe(true);
  });
  it('a reload on A after another tab started B resumes A\'s session, and A\'s waiting change lands in A', async () => {
    const sA1 = store2(); const sB2 = store2();
    const t1 = openTab(sA1, 'A', 'tab1');
    await press(t1.result);
    const sA = sid(t1.result)!;
    const t2 = openTab(sB2, 'B', 'tab2');
    await press(t2.result);
    t1.unmount();                                     // the reload
    server.aiWrite(sA, 'create_theme', THEME);
    const t1b = openTab(sA1, 'A', 'tab1');
    await press(t1b.result);
    expect(sid(t1b.result)).toBe(sA);
    expect(has(sA1.A)).toBe(true);
  });
  it('sign-out ends every recorded session and a legacy one, and forgets them', async () => {
    for (const [p, s] of [['A', 'sA'], ['B', 'sB']]) {
      server.seed(s!, { openProductId: p });
      localStorage.setItem(REC + p, JSON.stringify({ sessionId: s, productName: p, startedAt: 1 }));
    }
    server.seed('sL', { openProductId: 'C' });
    localStorage.setItem(LEGACY_KEY, 'sL');
    const r = await endAiSessionForSignOut();
    expect(r).toEqual({ attempted: true, serverOk: true });
    expect([...server.teardownCalls].sort()).toEqual(['sA', 'sB', 'sL']);
    expect([record('A'), record('B'), localStorage.getItem(LEGACY_KEY)]).toEqual([null, null, null]);
  });
});

describe('R-11 sign-out that cannot reach the server', () => {
  it('parks one id on the banner marker and the rest on the silent list; the retry drains both', async () => {
    for (const [p, s] of [['A', 'sA'], ['B', 'sB']]) {
      server.seed(s!, { openProductId: p });
      localStorage.setItem(REC + p, JSON.stringify({ sessionId: s, productName: p, startedAt: 1 }));
    }
    server.failTeardown = true;
    expect(await endAiSessionForSignOut()).toEqual({ attempted: true, serverOk: false });
    const parked = [localStorage.getItem(AI_TEARDOWN_PENDING_KEY), ...JSON.parse(localStorage.getItem('spert_ai_end_pending') ?? '[]')];
    expect(parked.sort()).toEqual(['sA', 'sB']);
    server.failTeardown = false;
    expect(await retryPendingAiTeardown()).toBe(true);
    expect([localStorage.getItem(AI_TEARDOWN_PENDING_KEY), localStorage.getItem('spert_ai_end_pending')]).toEqual([null, null]);
    expect(server.sessions.size).toBe(0);
  });
});

// ─── R-2 / R-3 / R-4 through the hook ────────────────────────────────────────
describe('R-2/R-3/R-4 when Connect AI starts a session in B', () => {
  async function liveOnA(store = store2()) {
    const t = openTab(store, 'A');
    await press(t.result);
    const sA = sid(t.result)!;
    return { t, sA, store };
  }
  it('ends A\'s session after the create, even while the AI keeps writing (lastActiveAt fresh), and names A', async () => {
    const { t, sA } = await liveOnA();
    act(() => t.result.current.open('B'));            // R-5 tears down here; only this tab held A
    await flush();
    server.aiWrite(sA, 'create_theme', THEME);         // the AI is still building A
    await press(t.result);
    expect(server.teardownCalls).toEqual([sA]);
    expect(record('A')).toBeNull();
    expect(t.result.current.ai.sessionState.notice).toBe(
      'Your earlier Connect AI session was for “Alpha”, so this is a new session for “Bravo”. Give your AI the new code '
      + 'and tell it you are now in “Bravo”. Changes your AI sent for “Alpha” were not applied.');
  });
  it('the new session\'s listeners are untouched: a change for B lands in B', async () => {
    const { t, store, sA } = await liveOnA();
    act(() => t.result.current.open('B'));
    await flush();
    await press(t.result);
    expect(server.teardownCalls).toEqual([sA]);
    server.aiWrite(sid(t.result)!, 'create_theme', THEME);
    await flush();
    expect(has(store.B)).toBe(true);
  });
  it('a create that fails ends nothing', async () => {
    const { t, sA } = await liveOnA();
    act(() => t.result.current.open('B'));
    await flush();
    server.failCreate = true;
    expect(await press(t.result)).toBe(false);
    expect(server.teardownCalls).toEqual([]);
    expect(record('A')?.sessionId).toBe(sA);
  });
  it('leaves A when another tab holds its lock, with the still-open line', async () => {
    const { sA } = await liveOnA();
    const t2 = openTab(store2(), 'B', 'tab2');
    await press(t2.result);
    expect(server.teardownCalls).toEqual([]);
    expect(record('A')?.sessionId).toBe(sA);
    expect(t2.result.current.ai.sessionState.notice).toBe(
      'Your Connect AI session for “Alpha” is still open in another tab, so this is a new session for “Bravo”. Give your AI the new code.');
  });
  it('leaves a session whose lock is only pending in another tab', async () => {
    server.seed('sP', { openProductId: 'A' });
    localStorage.setItem(REC + 'A', JSON.stringify({ sessionId: 'sP', productName: 'Alpha', startedAt: 1 }));
    locks.pending.push({ name: 'spert-ai:sP', mode: 'shared' });
    server.seed('sC', { openProductId: 'C' });          // control: no lock at all, so it is ended
    localStorage.setItem(REC + 'C', JSON.stringify({ sessionId: 'sC', productName: 'Charlie', startedAt: 0 }));
    const t = openTab(store2(), 'B');
    await press(t.result);
    expect(server.teardownCalls).toEqual(['sC']);
  });
  it('a legacy session is never resumed, even on its own product; stale, it is ended with the neutral line', async () => {
    server.seed('sL', { openProductId: 'A' });
    localStorage.setItem(LEGACY_KEY, 'sL');
    localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({ version: 1, read: false, write: true }));
    const t = openTab(store2(), 'A');
    await press(t.result);
    expect(sid(t.result)).not.toBe('sL');
    expect(server.teardownCalls).toEqual(['sL']);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(t.result.current.ai.sessionState.notice).toBe(
      'Your earlier Connect AI session can’t be continued here, so this is a new session. Give your AI the new code.');
  });
  it('a legacy session with a fresh browserConnectedAt (a v0.55.10 tab, no lock) is left', async () => {
    server.seed('sL', { openProductId: 'A', browserConnectedAt: new Date() });
    localStorage.setItem(LEGACY_KEY, 'sL');
    // control: a recorded session with the same fresh heartbeat but no lock is ended (the rule is legacy-only)
    server.seed('sC', { openProductId: 'C', browserConnectedAt: new Date() });
    localStorage.setItem(REC + 'C', JSON.stringify({ sessionId: 'sC', productName: 'Charlie', startedAt: 0 }));
    const t = openTab(store2(), 'B');
    await press(t.result);
    expect(server.teardownCalls).toEqual(['sC']);
    expect(localStorage.getItem(LEGACY_KEY)).toBe('sL');
  });
  it('a failed read leaves that session and its entry, with no line', async () => {
    server.seed('sX', { openProductId: 'A' });
    localStorage.setItem(REC + 'A', JSON.stringify({ sessionId: 'sX', productName: 'Alpha', startedAt: 1 }));
    server.failRead.add('sX');
    const t = openTab(store2(), 'B');
    expect(await press(t.result)).toBe(true);
    expect(server.teardownCalls).toEqual([]);
    expect(record('A')?.sessionId).toBe('sX');
    expect(t.result.current.ai.sessionState.notice).toBeNull();
  });
  it('a missing or expired doc loses its entry and gets no line', async () => {
    server.seed('sE', { openProductId: 'C', expiresAt: new Date(Date.now() - 1000) });
    localStorage.setItem(REC + 'A', JSON.stringify({ sessionId: 'sGone', productName: 'Alpha', startedAt: 2 }));
    localStorage.setItem(REC + 'C', JSON.stringify({ sessionId: 'sE', productName: 'Charlie', startedAt: 1 }));
    const t = openTab(store2(), 'B');
    await press(t.result);
    expect([record('A'), record('C')]).toEqual([null, null]);
    expect(server.teardownCalls).toEqual([]);
    expect(t.result.current.ai.sessionState.notice).toBeNull();
  });
  it('R-2: an entry for A whose doc names another product is replaced, not resumed, and ended (PF-05)', async () => {
    server.seed('sOld', { openProductId: 'B' });     // an old-bundle tab re-pointed it
    localStorage.setItem(REC + 'A', JSON.stringify({ sessionId: 'sOld', productName: 'Alpha', startedAt: 1 }));
    const t = openTab(store2(), 'A');
    await press(t.result);
    expect(sid(t.result)).not.toBe('sOld');
    expect(server.teardownCalls).toEqual(['sOld']);
    expect(record('A')?.sessionId).toBe(sid(t.result));
    expect(t.result.current.ai.sessionState.notice).toBeNull();
  });
  it('a failed end is parked on its own key, and the sign-out banner marker stays empty', async () => {
    const { t, sA } = await liveOnA();
    act(() => t.result.current.open('B'));
    await flush();
    server.failTeardown = true;
    await press(t.result);
    await flush();
    expect(JSON.parse(localStorage.getItem('spert_ai_end_pending') ?? '[]')).toEqual([sA]);
    expect(localStorage.getItem(AI_TEARDOWN_PENDING_KEY)).toBeNull();
    expect(record('A')).toBeNull();
  });
  it('without Web Locks, a fresh browserConnectedAt counts as in use and a stale one does not', async () => {
    locks.remove();
    server.seed('sF', { openProductId: 'A', browserConnectedAt: new Date() });
    server.seed('sS', { openProductId: 'C', browserConnectedAt: new Date(Date.now() - 120_000) });
    localStorage.setItem(REC + 'A', JSON.stringify({ sessionId: 'sF', productName: 'Alpha', startedAt: 2 }));
    localStorage.setItem(REC + 'C', JSON.stringify({ sessionId: 'sS', productName: 'Charlie', startedAt: 1 }));
    const t = openTab(store2(), 'B');
    await press(t.result);
    expect(server.teardownCalls).toEqual(['sS']);
    expect(record('A')?.sessionId).toBe('sF');
  });
});

// ─── R-5 / R-9 ───────────────────────────────────────────────────────────────
describe('R-5/R-9', () => {
  it('Disconnect after a jump ends nothing stored', async () => {
    const t = openTab(store2(), 'A');
    await press(t.result);
    const sA = sid(t.result)!;
    act(() => t.result.current.open('B'));
    await flush();
    await act(async () => { await t.result.current.ai.stopSession(); });
    expect(server.teardownCalls).toEqual([]);
    expect(record('A')?.sessionId).toBe(sA);
  });
  it('a jump during startSession does not go live, attaches no listener, ends nothing; back in A it resumes', async () => {
    const store = store2();
    server.seed('sOther', { openProductId: 'C' });
    localStorage.setItem(REC + 'C', JSON.stringify({ sessionId: 'sOther', productName: 'Charlie', startedAt: 1 }));
    const t = openTab(store, 'A');
    let release: () => void = () => {};
    server.createGate = new Promise<void>(r => { release = r; });
    let pending: Promise<boolean> = Promise.resolve(true);
    act(() => { pending = t.result.current.ai.startSession(false); });
    await flush();                                      // the reads are done; the create is in flight
    act(() => t.result.current.open('B'));             // the jump lands
    await flush();
    release();
    let ok: boolean | null = null;
    await act(async () => { ok = await pending; });
    await flush();
    server.createGate = null;
    expect(ok).toBe(false);
    expect(t.result.current.ai.sessionState.sessionActive).toBe(false);
    expect(server.listeners.filter(l => l.active)).toEqual([]);
    expect(server.teardownCalls).toEqual([]);
    const sA = record('A')?.sessionId;
    expect(sA).toBeTruthy();
    act(() => t.result.current.open('A'));
    await flush();
    await press(t.result);
    expect(sid(t.result)).toBe(sA);
  });
  it('the panel does not show without a session, and shows the line with one', () => {
    const base = { sessionActive: false, aiConnected: false, consentRead: false, sessionId: null, boundProductId: null, notice: null };
    const props = { open: true, onClose: () => {}, onChangePermissions: async () => true, onDisconnect: async () => {} };
    const { unmount } = render(<ConnectPanel {...props} sessionState={base} />);
    expect(screen.queryByText('AI session active')).toBeNull();
    unmount();
    render(<ConnectPanel {...props} sessionState={{ ...base, sessionActive: true, sessionId: 's1', notice: 'The line.' }} />);
    expect(screen.getByText('The line.')).toBeTruthy();
  });
});
