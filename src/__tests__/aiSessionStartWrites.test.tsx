// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

// O26 (v0.55.13): characterisation of what useAiConnectivity's startSession
// writes: the create and resume payloads, the consent, the snapshot deletes and
// the cursor. Written against v0.55.12's code before startSession was split. The
// B15 files (aiSessionBinding, aiSessionWalkthrough) cannot see these; the shared
// write recorder and helpers are in fixtures/aiSessionStartRecorder.ts and
// fixtures/aiSessionStartHarness.ts. aiSessionStartPaths.test.tsx holds the rest.
import { vi, it, expect, describe } from 'vitest';
vi.mock('firebase/firestore', async () => (await import('./fixtures/aiSessionStartRecorder')).recordingFirestoreMock);
vi.mock('firebase/functions', async () => (await import('./fixtures/aiSessionFake')).functionsMock);
vi.mock('../lib/firebase', () => ({
  db: { __db: true }, auth: null, functionsInstance: { __fns: true }, isFirebaseAvailable: true,
}));
import { APP_VERSION } from '../lib/version';
import { server } from './fixtures/aiSessionFake';
import {
  SEQ, DAY, mk, openTab, start, startBehind, sid, consent, record, sessionCreates, resumeWrites, snapshotDeletes,
  sessionLeftInA, setUpEachTest,
} from './fixtures/aiSessionStartHarness';

setUpEachTest();

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

  // Review -02: a resume write the rules refuse is treated as a doc that went.
  it('a session whose resume write is refused (permission-denied) is replaced by a new one, with the new consent', async () => {
    const store = { A: mk('A', 'Alpha') };
    const s = await sessionLeftInA(store, true);
    localStorage.setItem(SEQ + s, '4');
    server.failUpdate = 'permission-denied';
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
