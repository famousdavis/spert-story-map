// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * N6 (FRAME26, v0.57.0, D12): every notice is the frame's `.sf-notice`, in the variant that matches what it says, and
 * its "Got it" or "Dismiss" is the frame's `.sf-notice-dismiss` (28 px, outlined). Its other buttons keep their own
 * look: the invitation's two sign-in buttons and the teardown's "Try again". The notice root carries no ground, border,
 * padding or margin of its own, so the variant's colours are the ones that show; the product's notice (a part of the
 * product left out on load) adds only `.sf-below`, because it sits under the product's heading row, not in the slot.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';

const inv = vi.hoisted(() => ({ state: 'idle' as 'idle' | 'pre_auth' | 'claimed', user: null as null | { uid: string }, firebase: true }));
const teardown = vi.hoisted(() => ({ pending: null as string | null }));
const store = vi.hoisted(() => ({ value: { mode: 'local', driver: { loadPreferences: () => Promise.resolve({}) } } }));
vi.mock('../hooks/useInvitationLanding', () => ({ useInvitationLanding: () => ({ state: inv.state, claimedNames: ['Alpha'], dismiss: () => {} }) }));
vi.mock('../hooks/useSignInWithTosGate', () => ({ useSignInWithTosGate: () => ({ signIn: () => {}, authError: null, showTosConsent: false, onTosAccepted: () => {}, onTosCancel: () => {} }) }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: inv.user, firebaseAvailable: inv.firebase }) }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => store.value }));
vi.mock('../lib/aiSessionTeardown', () => ({
  AI_TEARDOWN_CHANGED_EVENT: 'spert:ai-teardown-changed',
  getPendingAiTeardownSessionId: () => teardown.pending,
  getPendingSessionEnds: () => [],
  retryPendingAiTeardown: () => Promise.resolve(false),
  clearPendingAiTeardown: () => {},
}));

import FirstRunBanner from '../components/ui/FirstRunBanner';
import LocalStorageCaution from '../components/ui/LocalStorageCaution';
import InvitationBanner from '../components/ui/InvitationBanner';
import AiTeardownBanner from '../components/ui/AiTeardownBanner';
import TermsSignOutBanner from '../components/ui/TermsSignOutBanner';
import LocalFoldBanner from '../components/ui/LocalFoldBanner';
import CloudLoadNotice from '../components/ui/CloudLoadNotice';
import { resetLocalCaution } from '../lib/localCaution';
import { setTermsSignOutNotice, clearTermsSignOutNotice } from '../lib/termsSignOutNotice';
import { reportFold, dismissFoldNotice } from '../lib/localFoldNotice';
import { reportGuardedLoad, dismissGuardedLoad } from '../lib/cloudLoadNotices';
import { req } from './testHelpers';

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  inv.state = 'idle';
  inv.user = null;
  inv.firebase = true;
  teardown.pending = null;
});

afterEach(() => {
  cleanup();
  clearTermsSignOutNotice();
  dismissFoldNotice();
  dismissGuardedLoad('p1');
});

const OWN_BOX = /^(?:bg-|border|rounded|p[xytrbl]?-|m[xytrbl]?-|-m|shadow|max-w-|mx-)/;

/** Render one notice and read it: its root, its classes, and which buttons are the frame's dismiss. */
async function notice(el: ReactElement, text: RegExp) {
  render(el);
  const root = req((await screen.findByText(text)).closest<HTMLElement>('.sf-notice'), 'the notice root');
  const cls = root.className.split(/\s+/);
  const buttons = Array.from(root.querySelectorAll('button'));
  return {
    cls,
    own: cls.filter(c => OWN_BOX.test(c)),
    dismiss: buttons.filter(b => b.className === 'sf-notice-dismiss').map(b => b.textContent),
    others: buttons.filter(b => b.className !== 'sf-notice-dismiss').map(b => b.textContent?.trim()),
  };
}

describe('the notices (contract §3, §6; D12)', () => {
  it('the terms notice: info; "Got it" is the frame\'s dismiss', async () => {
    const n = await notice(<FirstRunBanner />, /SPERT® Suite web apps are free to use/);
    expect(n.cls).toEqual(['sf-notice', 'sf-notice--info']);
    expect(n.dismiss).toEqual(['Got it']);
  });

  it('the local-storage caution: caution; "Got it" is the frame\'s dismiss', async () => {
    const n = await notice(<LocalStorageCaution />, /Your data exists only in this browser/);
    expect(n.cls).toEqual(['sf-notice', 'sf-notice--caution']);
    expect(n.dismiss).toEqual(['Got it']);
  });

  it('the invitation before sign-in: info; the sign-in buttons keep their own look', async () => {
    inv.state = 'pre_auth';
    const n = await notice(<InvitationBanner />, /invited to collaborate/);
    expect(n.cls).toEqual(['sf-notice', 'sf-notice--info']);
    expect(n.dismiss).toEqual(['Dismiss']);
    expect(n.others).toEqual(['Sign in with Google', 'Sign in with Microsoft']);
  });

  it('the invitation claimed: success', async () => {
    inv.state = 'claimed';
    const n = await notice(<InvitationBanner />, /You now have access to/);
    expect(n.cls).toEqual(['sf-notice', 'sf-notice--success']);
    expect(n.dismiss).toEqual(['Dismiss']);
  });

  it('the invitation unmatched, and with no Firebase: caution', async () => {
    inv.state = 'pre_auth';
    inv.user = { uid: 'u1' };
    expect((await notice(<InvitationBanner />, /couldn't match this invitation/)).cls).toEqual(['sf-notice', 'sf-notice--caution']);
    cleanup();
    inv.firebase = false;
    expect((await notice(<InvitationBanner />, /Cloud sign-in is unavailable/)).cls).toEqual(['sf-notice', 'sf-notice--caution']);
  });

  it('the Connect AI teardown: caution, an alert; "Try again" keeps its look, "Dismiss" is the frame\'s', async () => {
    teardown.pending = 's1';
    const n = await notice(<AiTeardownBanner />, /Your AI assistant may still be connected/);
    expect(n.cls).toEqual(['sf-notice', 'sf-notice--caution']);
    expect(n.dismiss).toEqual(['Dismiss']);
    expect(n.others).toEqual(['Try again']);
  });

  it('the Terms sign-out: caution, an alert', async () => {
    setTermsSignOutNotice();
    const n = await notice(<TermsSignOutBanner />, /You were signed out because the Terms of Service changed/);
    expect(n.cls).toEqual(['sf-notice', 'sf-notice--caution']);
    expect(n.dismiss).toEqual(['Dismiss']);
  });

  it('the Local store\'s fold: info', async () => {
    reportFold({ moved: 1, copies: 0, unreadable: 0, stopped: false });
    render(<LocalFoldBanner />);
    const root = req(document.querySelector<HTMLElement>('[role="status"]'), 'the fold notice');
    expect(root.className.split(/\s+/)).toEqual(['sf-notice', 'sf-notice--info']);
    expect(Array.from(root.querySelectorAll('button')).map(b => [b.textContent, b.className])).toEqual([['Dismiss', 'sf-notice-dismiss']]);
  });

  it('the product\'s notice (part of it left out on load): caution, below the product\'s heading row', async () => {
    reportGuardedLoad('p1', ['releases'], true);
    const n = await notice(<CloudLoadNotice productId="p1" productName="Alpha" />, /could not be read and was left out/);
    expect(n.cls).toEqual(['sf-notice', 'sf-notice--caution', 'sf-below']);
    expect(n.dismiss).toEqual(['Dismiss']);
  });

  it('no notice root paints a ground, border, padding or margin of its own', async () => {
    const cases: [ReactElement, RegExp, () => void][] = [
      [<FirstRunBanner />, /free to use/, () => {}],
      [<LocalStorageCaution />, /exists only in this browser/, () => {}],
      [<InvitationBanner />, /invited to collaborate/, () => { inv.state = 'pre_auth'; }],
      [<AiTeardownBanner />, /may still be connected/, () => { teardown.pending = 's1'; }],
      [<TermsSignOutBanner />, /signed out because/, () => setTermsSignOutNotice()],
    ];
    for (const [el, text, arrange] of cases) {
      arrange();
      expect((await notice(el, text)).own, String(text)).toEqual([]);
      cleanup();
    }
  });
});
