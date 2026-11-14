// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// O26 (v0.55.13): the tabs, start helpers and queries the aiSessionStart* tests
// share. Each test file mocks firebase/firestore with aiSessionStartRecorder.ts,
// firebase/functions with aiSessionFake.ts and ../lib/firebase, then calls
// setUpEachTest(). Every gate is released in `finally`, so a broken start fails,
// never hangs.
import { vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { server, installFakeLocks } from './aiSessionFake';
import { calls } from './aiSessionStartRecorder';
import { useAiConnectivity } from '../../hooks/useAiConnectivity';
import { AI_CONSENT_KEY } from '../../lib/aiConstants';
import type { Product, ProductUpdater } from '../../types';

// Record and cursor keys are spelled out on purpose, as in aiSessionBinding.
export const REC = 'spert_ai_session:';
export const SEQ = 'spert_ai_last_seq:';
export const DAY = 86_400_000;
export const mk = (id: string, name: string) => ({
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
export type Tab = { result: { current: ReturnType<typeof useTab> }; unmount: () => void };
export const openTab = (store: Record<string, Product>, id: string): Tab => renderHook(() => useTab(store, id));
export const flush = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
export async function start(t: Tab, read: boolean) {
  let ok = false;
  await act(async () => { ok = await t.result.current.ai.startSession(read); });
  await flush();
  return ok;
}
/** Start a session behind a held gate, act while it waits, then always release and settle it. */
export async function startBehind(
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
export const sid = (t: Tab) => t.result.current.ai.sessionState.sessionId;
export const consent = () => JSON.parse(localStorage.getItem(AI_CONSENT_KEY) ?? 'null') as { version: number; write: boolean; read: boolean } | null;
export const record = (p: string) => JSON.parse(localStorage.getItem(REC + p) ?? 'null') as { sessionId: string; productName: string } | null;
export const setRecord = (p: string, sessionId: string, productName: string) =>
  localStorage.setItem(REC + p, JSON.stringify({ sessionId, productName, startedAt: 1 }));
export const of = (kind: string) => calls.log.filter(c => c.kind === kind);
export const sessionCreates = () => of('setDoc').filter(c => c.segs.length === 2);
export const resumeWrites = () => of('updateDoc').filter(c => c.segs.length === 2 && 'consentRead' in (c.data ?? {}));
export const snapshotDeletes = (s: string) => of('deleteDoc').filter(c => c.segs[1] === s && c.segs[2] === 'snapshot').length;
let errors: MockInstance<typeof console.error>;
export const errorMessages = () => errors.mock.calls.map(c => c[0] as string);

/** This test's lock manager (a live binding: set again before each test). */
export let locks: ReturnType<typeof installFakeLocks>;
/** Fake timers (not Date), a clean store, server and log, fresh locks, console.error silenced and spied. */
export function setUpEachTest() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    localStorage.clear(); server.reset(); calls.log = [];
    locks = installFakeLocks();
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { cleanup(); locks.remove(); errors.mockRestore(); vi.useRealTimers(); });
}

/** A session started and left in A, for the resume cases. */
export async function sessionLeftInA(store: Record<string, Product>, read: boolean) {
  const t = openTab(store, 'A');
  await start(t, read);
  const s = sid(t)!;
  t.unmount();
  calls.log = []; errors.mockClear();
  return s;
}
