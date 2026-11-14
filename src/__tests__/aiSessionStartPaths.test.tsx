// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

// O26 (v0.55.13): characterisation of the paths useAiConnectivity's startSession
// takes: where it stops when a step fails, what a change of product during an
// await stops, and go live (the listeners, the snapshot, the record's name, the
// lock, the D5 refs). Written against v0.55.12's code before startSession was
// split; the shared write recorder and helpers are in fixtures/aiSessionStartRecorder.ts
// and fixtures/aiSessionStartHarness.ts. aiSessionStartWrites.test.tsx holds the writes.
import { vi, it, expect, describe } from 'vitest';
vi.mock('firebase/firestore', async () => (await import('./fixtures/aiSessionStartRecorder')).recordingFirestoreMock);
vi.mock('firebase/functions', async () => (await import('./fixtures/aiSessionFake')).functionsMock);
vi.mock('../lib/firebase', () => ({
  db: { __db: true }, auth: null, functionsInstance: { __fns: true }, isFirebaseAvailable: true,
}));
import { act } from '@testing-library/react';
import { AI_CONSENT_KEY } from '../lib/aiConstants';
import { server } from './fixtures/aiSessionFake';
import { calls } from './fixtures/aiSessionStartRecorder';
import {
  REC, SEQ, mk, openTab, start, startBehind, sid, consent, record, setRecord, of, sessionCreates, resumeWrites,
  snapshotDeletes, errorMessages, locks, flush, sessionLeftInA, setUpEachTest,
} from './fixtures/aiSessionStartHarness';

setUpEachTest();

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

  // Review -03: only a failed Read → off downgrade reverts the stored consent.
  it('a resume write that fails for another reason keeps the requested consent (no revert to Read)', async () => {
    const store = { A: mk('A', 'Alpha') };
    await sessionLeftInA(store, false);
    server.failUpdate = 'unavailable';
    const t = openTab(store, 'A');
    expect(await start(t, false)).toBe(true);
    expect(consent()).toMatchObject({ version: 1, write: true, read: false });
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

  // Review -01: startSession returns early at S1 and S2 as well as in the create path,
  // and the in-flight flag must be cleared on every one of them, or Connect AI refuses
  // to start again until a reload.
  it('after a start stopped by a failed read of its own session, the next start runs and resumes it', async () => {
    server.seed('sA', { openProductId: 'A' });
    setRecord('A', 'sA', 'Alpha');
    server.failRead.add('sA');
    const t = openTab({ A: mk('A', 'Alpha') }, 'A');
    expect(await start(t, false)).toBe(false);
    server.failRead.delete('sA');
    expect(await start(t, false)).toBe(true);
    expect(sid(t)).toBe('sA');
  });

  it('after a start stopped by a failed Read → off downgrade, the next start runs and resumes the same session', async () => {
    const store = { A: mk('A', 'Alpha') };
    const s = await sessionLeftInA(store, true);
    server.failUpdate = 'unavailable';
    const t = openTab(store, 'A');
    expect(await start(t, false)).toBe(false);
    server.failUpdate = null;
    expect(await start(t, false)).toBe(true);
    expect(sid(t)).toBe(s);
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
