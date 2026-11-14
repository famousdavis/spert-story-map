// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

// O26 (v0.55.13): characterisation of what useAiConnectivity's startSession does,
// written against v0.55.12's code before startSession was split. The B15 files
// (aiSessionBinding, aiSessionWalkthrough) cannot see these: the fake records no
// snapshot delete, merges every update into the stored doc, and no test there
// reads a payload key, a console message or the order of the calls. So this file
// wraps the fake's six Firestore functions in one ordered log and pins them.
// Every gate is released in `finally`, so a broken start fails here, never hangs.
import { vi, it, expect, beforeEach, afterEach, describe, type MockInstance } from 'vitest';
type Call = { kind: string; segs: string[]; data?: Record<string, unknown> };
const calls = vi.hoisted(() => ({ log: [] as Call[] }));
vi.mock('firebase/firestore', async () => {
  const m = (await import('./fixtures/aiSessionFake')).firestoreMock;
  /** A doc or collection's path; a query's collection path plus each `where` as `<op><value>`. */
  const segsOf = (target: unknown): string[] => {
    const t = target as {
      kind: string; segs?: string[]; col?: { segs: string[] };
      constraints?: Array<{ kind: string; op?: string; value?: unknown }>;
    };
    if (t.kind !== 'query') return t.segs ?? [];
    const wheres = (t.constraints ?? []).filter(c => c.kind === 'where').map(c => `${c.op}${String(c.value)}`);
    return [...(t.col?.segs ?? []), ...wheres];
  };
  const log = (kind: string, target: unknown, data?: Record<string, unknown>) => {
    calls.log.push({ kind, segs: segsOf(target), ...(data ? { data } : {}) });
  };
  type Ref = Parameters<typeof m.setDoc>[0];
  type Q = Parameters<typeof m.getDocs>[0];
  type Target = Parameters<typeof m.onSnapshot>[0];
  return {
    ...m,
    setDoc: async (ref: Ref, data: Record<string, unknown>) => { log('setDoc', ref, data); return m.setDoc(ref, data); },
    updateDoc: async (ref: Ref, data: Record<string, unknown>) => { log('updateDoc', ref, data); return m.updateDoc(ref, data); },
    deleteDoc: async (ref: Ref) => { log('deleteDoc', ref); return m.deleteDoc(); },
    getDoc: async (ref: Ref) => { log('getDoc', ref); return m.getDoc(ref); },
    getDocs: async (q: Q) => { log('getDocs', q); return m.getDocs(q); },
    onSnapshot: (target: Target, onNext: (s: unknown) => void) => { log('onSnapshot', target); return m.onSnapshot(target, onNext); },
  };
});
vi.mock('firebase/functions', async () => (await import('./fixtures/aiSessionFake')).functionsMock);
vi.mock('../lib/firebase', () => ({
  db: { __db: true }, auth: null, functionsInstance: { __fns: true }, isFirebaseAvailable: true,
}));
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { server, installFakeLocks } from './fixtures/aiSessionFake';
import { useAiConnectivity } from '../hooks/useAiConnectivity';
import { AI_CONSENT_KEY } from '../lib/aiConstants';
import { APP_VERSION } from '../lib/version';
import type { Product, ProductUpdater } from '../types';

// Record and cursor keys are spelled out on purpose, as in aiSessionBinding.
const REC = 'spert_ai_session:';
const SEQ = 'spert_ai_last_seq:';
const DAY = 86_400_000;
const mk = (id: string, name: string) => ({
  id, name, description: '', createdAt: '', updatedAt: '', schemaVersion: 2, sizeMapping: [], releases: [],
  sprints: [], themes: [], releaseCardOrder: {}, sizingCardOrder: {}, _changeLog: [],
}) as unknown as Product;

function useTab(store: Record<string, Product>, initial: string) {
  const [product, setProduct] = useState<Product | null>(store[initial] ?? null);
  const updateProduct = useCallback((u: ProductUpdater) => {
    setProduct(prev => (prev ? (typeof u === 'function' ? u(prev) : u) : prev));
  }, []);
  return {
    ai: useAiConnectivity(product, updateProduct),
    open: (id: string | null) => setProduct(id ? store[id] ?? null : null),
  };
}
type Tab = { result: { current: ReturnType<typeof useTab> }; unmount: () => void };
const openTab = (store: Record<string, Product>, id: string): Tab => renderHook(() => useTab(store, id));
const flush = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
async function start(t: Tab, read: boolean) {
  let ok = false;
  await act(async () => { ok = await t.result.current.ai.startSession(read); });
  await flush();
  return ok;
}
/** Start a session behind a held gate, act while it waits, then always release and settle it. */
async function startBehind(
  t: Tab, read: boolean, hold: (gate: Promise<void>) => void, during: () => Promise<void> | void,
) {
  let release!: () => void;
  hold(new Promise<void>(r => { release = r; }));
  let p: Promise<boolean> = Promise.resolve(false);
  let ok = true;
  try {
    await act(async () => { p = t.result.current.ai.startSession(read); for (let i = 0; i < 4; i++) await Promise.resolve(); });
    await during();
  } finally {
    release();
    await act(async () => { ok = await p; });
    await flush();
  }
  return ok;
}
const sid = (t: Tab) => t.result.current.ai.sessionState.sessionId;
const consent = () => JSON.parse(localStorage.getItem(AI_CONSENT_KEY) ?? 'null') as { version: number; write: boolean; read: boolean } | null;
const record = (p: string) => JSON.parse(localStorage.getItem(REC + p) ?? 'null') as { sessionId: string; productName: string } | null;
const setRecord = (p: string, sessionId: string, productName: string) =>
  localStorage.setItem(REC + p, JSON.stringify({ sessionId, productName, startedAt: 1 }));
const of = (kind: string) => calls.log.filter(c => c.kind === kind);
const sessionCreates = () => of('setDoc').filter(c => c.segs.length === 2);
const resumeWrites = () => of('updateDoc').filter(c => c.segs.length === 2 && 'consentRead' in (c.data ?? {}));
const snapshotDeletes = (s: string) => of('deleteDoc').filter(c => c.segs[1] === s && c.segs[2] === 'snapshot').length;
let errors: MockInstance<typeof console.error>;
const errorMessages = () => errors.mock.calls.map(c => c[0] as string);

let locks: ReturnType<typeof installFakeLocks>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  localStorage.clear(); server.reset(); calls.log = [];
  locks = installFakeLocks();
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); locks.remove(); errors.mockRestore(); vi.useRealTimers(); });

/** A session started and left in A, for the resume cases. */
async function sessionLeftInA(store: Record<string, Product>, read: boolean) {
  const t = openTab(store, 'A');
  await start(t, read);
  const s = sid(t)!;
  t.unmount();
  calls.log = []; errors.mockClear();
  return s;
}

describe('the writes', () => {
  it('a new session is created with exactly the ten keys, and its cursor is stored as 0', async () => {
    const t = openTab({ A: mk('A', 'Alpha') }, 'A');
    const before = Date.now();
    expect(await start(t, false)).toBe(true);
    expect(sessionCreates()).toHaveLength(1);
    const { segs, data } = sessionCreates()[0]!;
    expect(Object.keys(data!).sort()).toEqual([
      'appId', 'appVersion', 'browserConnectedAt', 'consentRead', 'consentWrite',
      'createdAt', 'expiresAt', 'lastActiveAt', 'lastSeq', 'openProductId',
    ]);
    expect(data).toMatchObject({
      lastSeq: 0, consentWrite: true, consentRead: false, appId: 'storymap', appVersion: APP_VERSION, openProductId: 'A',
    });
    const exp = (data!.expiresAt as Date).getTime();
    expect(exp - before).toBeGreaterThanOrEqual(7 * DAY);
    expect(exp - Date.now()).toBeLessThanOrEqual(7 * DAY);
    expect(segs[1]).toBe(sid(t));
    expect(localStorage.getItem(SEQ + segs[1])).toBe('0');
    expect(consent()).toMatchObject({ version: 1, write: true, read: false });
  });

  it('a resume writes exactly the five keys and records the new consent', async () => {
    const store = { A: mk('A', 'Alpha') };
    const s = await sessionLeftInA(store, false);
    const t = openTab(store, 'A');
    expect(await start(t, true)).toBe(true);
    expect(sid(t)).toBe(s);
    expect(sessionCreates()).toHaveLength(0);
    expect(resumeWrites().map(c => Object.keys(c.data!).sort()))
      .toEqual([['browserConnectedAt', 'consentRead', 'expiresAt', 'lastActiveAt', 'openProductId']]);
    expect(resumeWrites()[0]!.data).toMatchObject({ consentRead: true, openProductId: 'A' });
    expect(consent()).toMatchObject({ write: true, read: true });
  });

  it('the consent is written before the resume write', async () => {
    const store = { A: mk('A', 'Alpha') };
    await sessionLeftInA(store, true);
    const t = openTab(store, 'A');
    const ok = await startBehind(t, false, g => { server.updateGate = g; }, () => {
      expect(resumeWrites()).toHaveLength(1);
      expect(consent()).toMatchObject({ read: false });
    });
    expect(ok).toBe(true);
  });

  it('Read → off on a resume deletes the snapshot once; Read → Read deletes nothing', async () => {
    const store = { A: mk('A', 'Alpha') };
    const s = await sessionLeftInA(store, true);
    const t1 = openTab(store, 'A');
    expect(await start(t1, true)).toBe(true);
    t1.unmount();
    expect(snapshotDeletes(s)).toBe(0);
    const t2 = openTab(store, 'A');
    expect(await start(t2, false)).toBe(true);
    expect(snapshotDeletes(s)).toBe(1);
    expect(consent()).toMatchObject({ read: false });
  });

  it('a session whose doc went at the resume write is replaced by a new one, with the new consent', async () => {
    const store = { A: mk('A', 'Alpha') };
    const s = await sessionLeftInA(store, true);
    localStorage.setItem(SEQ + s, '4');
    server.failUpdate = 'not-found';
    const t = openTab(store, 'A');
    expect(await start(t, false)).toBe(true);
    const fresh = sid(t)!;
    expect(fresh).not.toBe(s);
    expect(sessionCreates().map(c => c.segs[1])).toEqual([fresh]);
    expect(localStorage.getItem(SEQ + s)).toBeNull();
    expect(record('A')?.sessionId).toBe(fresh);
    expect(consent()).toMatchObject({ read: false });
  });
});

describe('the failure paths', () => {
  it('a failed Read → off resume reverts consent to Read, deletes the snapshot, logs, and stops', async () => {
    const store = { A: mk('A', 'Alpha') };
    const s = await sessionLeftInA(store, true);
    server.failUpdate = 'unavailable';
    const t = openTab(store, 'A');
    expect(await start(t, false)).toBe(false);
    expect(consent()).toMatchObject({ version: 1, write: true, read: true });
    expect(snapshotDeletes(s)).toBe(1);
    expect(errorMessages()).toEqual(['[AI] Consent downgrade write failed; aborting resume:']);
    expect(t.result.current.ai.sessionState.sessionActive).toBe(false);
    expect(of('onSnapshot')).toHaveLength(0);
    expect(sessionCreates()).toHaveLength(0);
  });

  it('a resume write that fails for another reason is logged, and the same session goes live', async () => {
    const store = { A: mk('A', 'Alpha') };
    const s = await sessionLeftInA(store, false);
    server.failUpdate = 'unavailable';
    const t = openTab(store, 'A');
    expect(await start(t, false)).toBe(true);
    expect(t.result.current.ai.sessionState).toMatchObject({ sessionActive: true, sessionId: s });
    expect(errorMessages()[0]).toBe('[AI] Resume reconciliation failed; proceeding:');
    expect(errorMessages()).not.toContain('[AI] Consent downgrade write failed; aborting resume:');
  });

  it('a failed read of the open product\'s own session is logged and stops; record, cursor and doc stay; nothing is written', async () => {
    server.seed('sA', { openProductId: 'A', lastSeq: 4 });
    setRecord('A', 'sA', 'Alpha');
    localStorage.setItem(SEQ + 'sA', '3');
    server.failRead.add('sA');
    const t = openTab({ A: mk('A', 'Alpha') }, 'A');
    expect(await start(t, false)).toBe(false);
    expect(record('A')?.sessionId).toBe('sA');
    expect(localStorage.getItem(SEQ + 'sA')).toBe('3');
    expect(server.sessions.has('sA')).toBe(true);
    expect(consent()).toBeNull();
    expect(calls.log.map(c => c.kind)).toEqual(['getDoc']);
    expect(errorMessages()).toEqual(['[AI] Session check failed:']);
  });

  it('a create that fails is logged and stops', async () => {
    server.failCreate = true;
    const t = openTab({ A: mk('A', 'Alpha') }, 'A');
    expect(await start(t, false)).toBe(false);
    expect(errorMessages()).toEqual(['[AI] Session creation failed:']);
    expect(of('onSnapshot')).toHaveLength(0);
  });

  it('a second start while one runs returns false and writes nothing', async () => {
    const t = openTab({ A: mk('A', 'Alpha') }, 'A');
    let second: Promise<boolean> = Promise.resolve(true);
    const first = await startBehind(t, false, g => { server.createGate = g; }, async () => {
      const n = calls.log.length;
      localStorage.setItem(AI_CONSENT_KEY, 'unchanged');
      await act(async () => { second = t.result.current.ai.startSession(true); await Promise.resolve(); });
      expect(calls.log.length).toBe(n);
      expect(localStorage.getItem(AI_CONSENT_KEY)).toBe('unchanged');
    });
    let r2 = true;
    await act(async () => { r2 = await second; });
    expect([first, r2]).toEqual([true, false]);
    expect(sessionCreates()).toHaveLength(1);
  });
});

describe('the open product changes during an await', () => {
  it('a stale own record is forgotten even when the product changes during its read', async () => {
    const store = { A: mk('A', 'Alpha'), B: mk('B', 'Bravo') };
    setRecord('A', 'old', 'Alpha');
    localStorage.setItem(SEQ + 'old', '7');
    const t = openTab(store, 'A');
    const ok = await startBehind(t, false, g => { server.readGate = g; }, async () => {
      await act(async () => { t.result.current.open('B'); });
    });
    expect(ok).toBe(false);
    expect(localStorage.getItem(REC + 'A')).toBeNull();
    expect(localStorage.getItem(SEQ + 'old')).toBeNull();
    expect(consent()).toBeNull();
  });

  it('after a resume write that finds the doc gone, a change of product stops before any other session is read', async () => {
    const store = { A: mk('A', 'Alpha'), B: mk('B', 'Bravo') };
    server.seed('sA', { openProductId: 'A' });
    server.seed('sB', { openProductId: 'B' });
    setRecord('A', 'sA', 'Alpha');
    setRecord('B', 'sB', 'Bravo');
    server.failUpdate = 'not-found';
    const t = openTab(store, 'A');
    const ok = await startBehind(t, false, g => { server.updateGate = g; }, async () => {
      expect(resumeWrites()).toHaveLength(1);
      await act(async () => { t.result.current.open('B'); });
    });
    expect(ok).toBe(false);
    expect(of('getDoc').map(c => c.segs[1])).toEqual(['sA']);
    expect(sessionCreates()).toHaveLength(0);
  });
});

describe('go live', () => {
  it('the listeners attach before the heartbeat\'s first write', async () => {
    const t = openTab({ A: mk('A', 'Alpha') }, 'A');
    expect(await start(t, false)).toBe(true);
    const afterCreate = calls.log.slice(calls.log.findIndex(c => c.kind === 'setDoc') + 1);
    expect(afterCreate.slice(0, 3).map(c => `${c.kind} ${c.segs.join('/')}`)).toEqual([
      `onSnapshot anonymous_sessions/${sid(t)}/ops/>0`,
      `onSnapshot anonymous_sessions/${sid(t)}`,
      `updateDoc anonymous_sessions/${sid(t)}`,
    ]);
  });

  it('a second start on a live Read session schedules a snapshot', async () => {
    const t = openTab({ A: mk('A', 'Alpha') }, 'A');
    await start(t, true);
    await act(async () => { vi.advanceTimersByTime(2000); });
    await flush();
    expect(server.snapshotWrites).toHaveLength(1);
    expect(await start(t, true)).toBe(true);
    await act(async () => { vi.advanceTimersByTime(2000); });
    await flush();
    expect(server.snapshotWrites).toHaveLength(2);
  });

  it('a second start on a live session writes the product\'s name into its record', async () => {
    const t = openTab({ A: mk('A', 'Alpha') }, 'A');
    await start(t, false);
    setRecord('A', sid(t)!, 'Old name');
    expect(await start(t, false)).toBe(true);
    expect(record('A')?.productName).toBe('Alpha');
  });

  it('a second start releases the previous lock, so Disconnect leaves none', async () => {
    const t = openTab({ A: mk('A', 'Alpha') }, 'A');
    await start(t, false);
    const s = sid(t)!;
    expect(await start(t, false)).toBe(true);
    await act(async () => { await t.result.current.ai.stopSession(); });
    await flush();
    expect(locks.names().filter(n => n === 'spert-ai:' + s)).toEqual([]);
  });

  it('a new session drains its null window only up to its own highest op (the D5 refs are reset)', async () => {
    const t = openTab({ A: mk('A', 'Alpha') }, 'A');
    await start(t, false);
    const first = sid(t)!;
    for (let i = 0; i < 3; i++) server.aiWrite(first, 'noop_op', {});
    await flush();
    // An older tab has rewritten the doc's product, so the next start replaces it.
    (server.sessions.get(first) as Record<string, unknown>).openProductId = 'Z';
    expect(await start(t, false)).toBe(true);
    const second = sid(t)!;
    expect(second).not.toBe(first);
    act(() => t.result.current.open(null));
    await flush();
    server.aiWrite(second, 'noop_op', {});
    await flush();
    calls.log = [];
    act(() => t.result.current.open('A'));
    await flush();
    expect(of('getDocs').map(c => c.segs.join('/'))).toEqual([`anonymous_sessions/${second}/ops/>0/<=1`]);
  });
});
