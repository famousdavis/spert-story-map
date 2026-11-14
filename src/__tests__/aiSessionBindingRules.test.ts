// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

// B15: the pure rules behind binding a Connect AI session to its product.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  canResumeSession, isBoundProduct, isSessionInUse, changesWaiting, buildSwitchNotice,
  type SessionDocView, type OtherSession,
} from '../hooks/aiConnectivityUtils';
import {
  readSessionRecord, writeSessionRecord, removeSessionRecord, listSessionRecords, anySessionRecorded,
  removeLegacySessionId, listRecordedSessions,
} from '../lib/aiSessionRecords';

const NOW = new Date('2026-11-14T12:00:00Z');
const view = (o: Partial<SessionDocView> = {}): SessionDocView => ({
  exists: true, expiresAt: new Date(NOW.getTime() + 1000), openProductId: 'A', lastSeq: 0,
  browserConnectedAt: null, consentRead: false, ...o,
});

describe('R-2 canResumeSession', () => {
  it.each([
    ['entry missing (or legacy only: no entry)', false, view(), false],
    ['doc names another product', true, view({ openProductId: 'B' }), false],
    ['doc names nothing', true, view({ openProductId: null }), false],
    ['expired', true, view({ expiresAt: new Date(NOW.getTime() - 1) }), false],
    ['missing doc', true, view({ exists: false }), false],
    ['no doc read', true, null, false],
    ['match', true, view(), true],
    ['match with no expiresAt (as before B15)', true, view({ expiresAt: null }), true],
  ] as const)('%s', (_label, hasRecord, doc, expected) => {
    expect(canResumeSession(hasRecord, doc, 'A', NOW)).toBe(expected);
  });
});

describe('R-7 isBoundProduct', () => {
  it.each([
    ['A', 'A', true], ['A', 'B', false], ['A', null, false], ['A', undefined, false], [null, 'A', false], [null, null, false],
  ] as const)('bound %s, product %s → %s', (bound, product, expected) => {
    expect(isBoundProduct(bound, product)).toBe(expected);
  });
});

describe('R-3 isSessionInUse', () => {
  const fresh = new Date(NOW.getTime() - 89_000);
  const stale = new Date(NOW.getTime() - 90_000);
  it.each([
    ['lock held', true, false, null, true],
    ['lock not held, recorded session, fresh heartbeat', false, false, fresh, false],
    ['lock not held, legacy, fresh heartbeat (a v0.55.10 tab)', false, true, fresh, true],
    ['lock not held, legacy, stale heartbeat', false, true, stale, false],
    ['no Web Locks, fresh heartbeat', null, false, fresh, true],
    ['no Web Locks, stale heartbeat', null, false, stale, false],
    ['no Web Locks, no heartbeat', null, false, null, false],
  ] as const)('%s', (_label, lock, legacy, at, expected) => {
    expect(isSessionInUse(lock, legacy, at, NOW)).toBe(expected);
  });
  it('changesWaiting: the doc is ahead of this browser', () => {
    expect([changesWaiting(3, 2), changesWaiting(2, 2), changesWaiting(0, 0)]).toEqual([true, false, false]);
  });
});

describe('R-4 buildSwitchNotice (words proposed for William)', () => {
  const other = (o: Partial<OtherSession> = {}): OtherSession => ({
    sessionId: 's', productId: 'A', productName: 'Alpha', startedAt: 1,
    readFailed: false, live: true, inUse: false, waiting: false, ...o,
  });
  const named = 'Your earlier Connect AI session was for “Alpha”, so this is a new session for “Bravo”. '
    + 'Give your AI the new code and tell it you are now in “Bravo”.';
  const neutral = 'Your earlier Connect AI session can’t be continued here, so this is a new session. Give your AI the new code.';
  it('named', () => { expect(buildSwitchNotice([other()], 'B', 'Bravo')).toBe(named); });
  it('named, ended with changes waiting', () => {
    expect(buildSwitchNotice([other({ waiting: true })], 'B', 'Bravo'))
      .toBe(`${named} Changes your AI sent for “Alpha” were not applied.`);
  });
  it('left open in another tab: no "not applied"', () => {
    expect(buildSwitchNotice([other({ inUse: true, waiting: true })], 'B', 'Bravo')).toBe(
      'Your Connect AI session for “Alpha” is still open in another tab, so this is a new session for “Bravo”. Give your AI the new code.');
  });
  it('equal names (uploading to cloud gives new ids): neutral', () => {
    expect(buildSwitchNotice([other({ productName: 'Bravo', waiting: true })], 'B', 'Bravo'))
      .toBe(`${neutral} Changes your AI sent in that session were not applied.`);
    expect(buildSwitchNotice([other({ productName: 'Bravo', inUse: true, waiting: true })], 'B', 'Bravo')).toBe(neutral);
  });
  it('legacy: neutral, with "not applied" only when waiting', () => {
    expect(buildSwitchNotice([other({ productId: null })], 'B', 'Bravo')).toBe(neutral);
    expect(buildSwitchNotice([other({ productId: null, waiting: true })], 'B', 'Bravo'))
      .toBe(`${neutral} Changes your AI sent in that session were not applied.`);
  });
  it('no line for missing/expired, a failed read, or a replaced entry for the open product', () => {
    expect(buildSwitchNotice([other({ live: false }), other({ readFailed: true }), other({ productId: 'B' })], 'B', 'Bravo'))
      .toBeNull();
    expect(buildSwitchNotice([], 'B', 'Bravo')).toBeNull();
  });
  it('names the most recently started product, ahead of a legacy session', () => {
    const notice = buildSwitchNotice([
      other({ productId: null }), other({ productId: 'C', productName: 'Charlie', startedAt: 5 }), other({ startedAt: 3 }),
    ], 'B', 'Bravo');
    expect(notice).toContain('was for “Charlie”');
  });
});

describe('R-1 records: one key per product, compare-and-remove', () => {
  beforeEach(() => localStorage.clear());
  it('writes, lists and reads one key per product', () => {
    writeSessionRecord('A', { sessionId: 's1', productName: 'Alpha', startedAt: 1 });
    writeSessionRecord('B', { sessionId: 's2', productName: 'Bravo', startedAt: 2 });
    expect(localStorage.getItem('spert_ai_session:A')).not.toBeNull();
    expect(listSessionRecords().map(r => r.productId).sort()).toEqual(['A', 'B']);
    expect(readSessionRecord('B')?.sessionId).toBe('s2');
  });
  it('removes an entry only while it still names the session ended', () => {
    writeSessionRecord('A', { sessionId: 's-new', productName: 'Alpha', startedAt: 2 });
    removeSessionRecord('A', 's-old');
    expect(readSessionRecord('A')?.sessionId).toBe('s-new');
    removeSessionRecord('A', 's-new');
    expect(readSessionRecord('A')).toBeNull();
  });
  it('the legacy key counts as recorded, is compare-and-removed, and a junk record is ignored', () => {
    localStorage.setItem('spert_ai_session:Z', '{not json');
    expect(anySessionRecorded()).toBe(false);
    localStorage.setItem('spert_ai_session_id', 'L1');
    expect(anySessionRecorded()).toBe(true);
    removeLegacySessionId('L2');
    expect(localStorage.getItem('spert_ai_session_id')).toBe('L1');
    removeLegacySessionId('L1');
    expect(anySessionRecorded()).toBe(false);
  });
});

describe('R-3/R-11 listRecordedSessions: the one list startSession and sign-out both use', () => {
  beforeEach(() => { localStorage.clear(); });
  const bySession = (a: { sessionId: string }, b: { sessionId: string }) => a.sessionId.localeCompare(b.sessionId);
  it('lists every product entry and the legacy session, each once', () => {
    writeSessionRecord('A', { sessionId: 's1', productName: 'Alpha', startedAt: 2 });
    writeSessionRecord('B', { sessionId: 's2', productName: 'Bravo', startedAt: 1 });
    localStorage.setItem('spert_ai_session_id', 'sL');
    expect(listRecordedSessions().sort(bySession)).toEqual([
      { sessionId: 's1', productId: 'A', productName: 'Alpha', startedAt: 2 },
      { sessionId: 's2', productId: 'B', productName: 'Bravo', startedAt: 1 },
      { sessionId: 'sL', productId: null, productName: '', startedAt: 0 },
    ]);
  });
  it('a legacy id that an entry already names is listed once, as that entry', () => {
    writeSessionRecord('A', { sessionId: 's1', productName: 'Alpha', startedAt: 2 });
    localStorage.setItem('spert_ai_session_id', 's1');
    expect(listRecordedSessions()).toEqual([{ sessionId: 's1', productId: 'A', productName: 'Alpha', startedAt: 2 }]);
  });
  it('nothing recorded: an empty list', () => { expect(listRecordedSessions()).toEqual([]); });
});
