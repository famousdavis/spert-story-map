// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthProvider';
import { useStorage } from '../lib/StorageProvider';
import { INVITATIONS_ENABLED } from '../lib/featureFlags';
import { loadProductIndex } from '../lib/storage';
import type { SpertModelsChangedDetail } from '../types';

const SESSION_KEY = 'spert_invite_token';

export type InvitationState = 'idle' | 'pre_auth' | 'claimed';

export interface UseInvitationLandingResult {
  state: InvitationState;
  claimedNames: string[];
  dismiss: () => void;
}

export function useInvitationLanding(): UseInvitationLandingResult {
  const { user, firebaseAvailable } = useAuth();
  // No triggerClaim needed: emailed invite links cause full page reloads in a
  // Vite SPA. AuthProvider mounts fresh; onAuthStateChanged fires with the cached
  // credential; claim dispatches spert:models-changed BEFORE any Effect fires here
  // (the CF call is async, but that's still before Effect 3 processes the event).
  const { mode, switchMode } = useStorage();
  const [state, setState] = useState<InvitationState>('idle');
  const [claimedNames, setClaimedNames] = useState<string[]>([]);

  // Effect 1 — capture ?invite= on mount; strip URL; auto-flip storage mode.
  // deps intentionally [] — mode and firebaseAvailable captured at mount; subsequent
  // mode flips are handled by Effect 2 + StorageProvider's own listener.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- mount-only landing capture; setState transitions UI state from URL */
  useEffect(() => {
    if (!INVITATIONS_ENABLED) return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get('invite');
    if (!token) return;
    // Strip URL before the firebaseAvailable check — ?invite= must never persist
    // in the address bar regardless of build configuration.
    sessionStorage.setItem(SESSION_KEY, token);
    url.searchParams.delete('invite');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    if (!firebaseAvailable) return;
    // Auto-flip to cloud only when no local projects exist (Lesson 28).
    // AHP reference omits this gate — verified and confirmed; Story Map adds it.
    const localProjectCount = loadProductIndex().length;
    if (localProjectCount === 0 && mode !== 'cloud') {
      switchMode('cloud');
    }
    setState('pre_auth');
  }, []);

  // Effect 2 — restore pre_auth state from sessionStorage on re-mount / navigate
  useEffect(() => {
    if (!INVITATIONS_ENABLED) return;
    if (state !== 'idle') return;
    if (!firebaseAvailable) return;
    if (sessionStorage.getItem(SESSION_KEY)) {
      setState('pre_auth');
    }
  }, [firebaseAvailable, state]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // Effect 3 — listen for claim confirmation.
  //
  // React ordering invariant: this hook lives inside InvitationBanner, which is
  // a descendant of AuthProvider (main.tsx: AuthProvider → StorageProvider → App →
  // ErrorBoundary → InvitationBanner). React fires useEffects bottom-up, so this
  // listener is registered before AuthProvider's onAuthStateChanged is set up.
  // The async CF call in AuthProvider further guarantees the event fires after this
  // listener exists. Do not move InvitationBanner outside AuthProvider's tree.
  //
  // SESSION_KEY gate: only show 'claimed' banner if user arrived via an invite link
  // this session. Without this gate, a user signing in normally who has pending
  // invitations would see an unexpected banner; projects silently appear in the list.
  //
  // Payload gate (Lesson 27): handler gates on claimed.length, not on state.
  // This prevents stale-closure issues — no deps needed; handler captures only
  // stable setter refs.
  //
  // SESSION_KEY removal timing: removed before setState so a second event (future
  // expansion) doesn't re-trigger the banner after it's already showing 'claimed'.
  useEffect(() => {
    if (!INVITATIONS_ENABLED) return;
    const handler = (e: Event) => {
      if (!sessionStorage.getItem(SESSION_KEY)) return;
      const names =
        (e as CustomEvent<SpertModelsChangedDetail>).detail?.claimed
          .map(c => c.modelName)
          .filter(Boolean) ?? [];
      if (names.length === 0) return;
      sessionStorage.removeItem(SESSION_KEY);
      setClaimedNames(names);
      setState('claimed');
    };
    window.addEventListener('spert:models-changed', handler);
    return () => window.removeEventListener('spert:models-changed', handler);
  }, []);

  // Effect 4 — grace timer (30s).
  // Fires when pre_auth + user is signed in. Two cases:
  //   (a) right email + slow CF cold start: claim resolves in 5-15s; Effect 3 fires
  //       first; this timer's cleanup cancels the timeout.
  //   (b) wrong email account or expired invite: claim returns empty or no claim;
  //       timer auto-dismisses the banner after 30s.
  // Both cases initially show the amber "different email" banner — see Known V1 Limitations.
  useEffect(() => {
    if (!INVITATIONS_ENABLED) return;
    if (state !== 'pre_auth') return;
    if (!user) return;
    const timeout = setTimeout(() => {
      sessionStorage.removeItem(SESSION_KEY);
      setState('idle');
    }, 30_000);
    return () => clearTimeout(timeout);
  }, [state, user]);

  const dismiss = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setState('idle');
    setClaimedNames([]);
  }, []);

  return { state, claimedNames, dismiss };
}
