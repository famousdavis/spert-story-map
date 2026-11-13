// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
// v0.55.9 (BRIEF_product-rename-v3 D3, D10, D10a): the invitation banner, through the real component
// with the landing state, sign-in and storage mocked (never a real sign-in).
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';

const state = vi.hoisted(() => ({
  landing: { state: 'idle' as string, claimedNames: [] as string[] },
  user: null as { uid: string } | null,
  mode: 'local' as 'local' | 'cloud',
}));
vi.mock('../hooks/useInvitationLanding', () => ({
  useInvitationLanding: () => ({ ...state.landing, dismiss: () => {} }),
}));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: state.user, firebaseAvailable: true }) }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ mode: state.mode }) }));
vi.mock('../hooks/useSignInWithTosGate', () => ({
  useSignInWithTosGate: () => ({ signIn: () => {}, authError: null, showTosConsent: false, onTosCancel: () => {}, onTosAccepted: () => {} }),
}));

import InvitationBanner from '../components/ui/InvitationBanner';

afterEach(() => { cleanup(); state.user = null; state.mode = 'local'; });

const text = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');

describe('the invitation banner', () => {
  it('signed out: invited to collaborate in the app, no noun (D10a, A56)', () => {
    state.landing = { state: 'pre_auth', claimedNames: [] };
    render(<InvitationBanner />);
    expect(screen.getByText("You've been invited to collaborate in SPERT Story Map.")).toBeInTheDocument();
  });

  it('claimed in local mode, one name: "view it" (D10, A57)', () => {
    state.landing = { state: 'claimed', claimedNames: ['Alpha'] };
    render(<InvitationBanner />);
    expect(text()).toContain('You now have access to: Alpha');
    expect(text()).toContain('Switch to Cloud Storage in Settings to view it.');
  });

  it('claimed in local mode, two names: "view them" (D10, A57)', () => {
    state.landing = { state: 'claimed', claimedNames: ['Alpha', 'Beta'] };
    render(<InvitationBanner />);
    expect(text()).toContain('You now have access to: Alpha, Beta');
    expect(text()).toContain('Switch to Cloud Storage in Settings to view them.');
  });

  it('signed in, no match: ask the person who invited you (D3, A58)', () => {
    state.landing = { state: 'pre_auth', claimedNames: [] };
    state.user = { uid: 'me' };
    render(<InvitationBanner />);
    expect(text()).toContain(
      "We couldn't match this invitation to your account. If this seems wrong, ask the person who invited you to resend the invitation.");
  });
});
