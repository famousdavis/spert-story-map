// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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
  // Lazy useState initializer (Lesson 66). React 19 + Vite SPA — no SSR
  // justification for setState-in-effect. On first render we read
  // SESSION_KEY synchronously and seed 'pre_auth' if a token has already
  // been captured (re-mount / navigate case). Effect 1 still runs to handle
  // fresh page loads with `?invite=` and to perform side effects (URL
  // strip, sessionStorage write, mode flip) the initializer can't.
  const [state, setState] = useState<InvitationState>(() => {
    if (typeof window === 'undefined') return 'idle';
    if (!INVITATIONS_ENABLED) return 'idle';
    try {
      return sessionStorage.getItem(SESSION_KEY) ? 'pre_auth' : 'idle';
    } catch {
      return 'idle';
    }
  });
  const [claimedNames, setClaimedNames] = useState<string[]>([]);

  // Effect 1 — capture ?invite= on mount; strip URL; auto-flip storage mode.
  // Cannot collapse into the lazy initializer: this effect performs DOM side
  // effects (history.replaceState), sessionStorage writes, and a possible
  // switchMode() — none of which belong in a render-phase initializer.
  // deps intentionally [] — mount-only landing capture.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- mount-only landing capture; setState transitions UI state from URL after side effects */
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
    // Explicit 'local' override — at landing time the user is unauthenticated
    // so the active namespace is already 'local', but be explicit so this
    // does not silently break if a future change reorders provider mount.
    const localProjectCount = loadProductIndex('local').length;
    if (localProjectCount === 0 && mode !== 'cloud') {
      switchMode('cloud');
    }
    setState('pre_auth');
  }, []);

  // Effect 2 — narrowed (Lesson 66 follow-up). Lazy initializer covers fresh
  // load and re-mount when SESSION_KEY is already populated. This effect
  // remains for the firebaseAvailable=false→true async transition: if
  // Firebase warms up after first render and a token arrived during the
  // gap, advance to 'pre_auth'. Effect 1's setState only fires when ?invite=
  // is actually in the URL — this covers the re-render path.
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
