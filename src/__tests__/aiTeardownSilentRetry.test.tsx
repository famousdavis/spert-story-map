// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

// B15 (v0.55.11): a session Story Map could not end when another product's
// session started is parked on the silent list (`spert_ai_end_pending`). The
// banner's online retry must end it too, without showing the banner, which
// speaks about signing out. Adopted from the PR #239 review's revBanner.test.tsx.
import { vi, it, expect, beforeEach, afterEach } from 'vitest';
vi.mock('firebase/firestore', async () => (await import('./fixtures/aiSessionFake')).firestoreMock);
vi.mock('firebase/functions', async () => (await import('./fixtures/aiSessionFake')).functionsMock);
vi.mock('../lib/firebase', () => ({
  db: { __db: true }, auth: null, functionsInstance: { __fns: true }, isFirebaseAvailable: true,
}));
import { render, act, cleanup, screen } from '@testing-library/react';
import { server } from './fixtures/aiSessionFake';
import AiTeardownBanner from '../components/ui/AiTeardownBanner';

let online = true;
beforeEach(() => {
  localStorage.clear(); server.reset(); online = true;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
});
afterEach(() => { cleanup(); localStorage.clear(); });
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const BANNER = /Signing out could not reach the server/;

it.each([
  ['the silent list only (an end that failed offline)', false],
  ['control: the sign-out marker is also set', true],
])('coming back online ends the parked sessions: %s', async (_label, withMarker) => {
  server.seed('sP', { openProductId: 'A' });
  localStorage.setItem('spert_ai_end_pending', JSON.stringify(['sP']));
  if (withMarker) { server.seed('sM', { openProductId: 'B' }); localStorage.setItem('spert_ai_teardown_pending', 'sM'); }
  online = false;
  render(<AiTeardownBanner />);
  await settle();
  expect(server.teardownCalls).toEqual([]);               // the load retry ran offline
  expect(!!screen.queryByText(BANNER)).toBe(withMarker);  // the banner is for the sign-out marker only
  online = true;
  window.dispatchEvent(new Event('online'));
  await settle();
  expect(server.teardownCalls).toContain('sP');
  expect(localStorage.getItem('spert_ai_end_pending')).toBeNull();
  expect(screen.queryByText(BANNER)).toBeNull();
});
