// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.

import { useState } from 'react';
import { useAuth } from '../lib/AuthProvider';
import { isTosAcceptedLocally, cacheTosAcceptance } from '../lib/tosHelpers';

type AuthProvider = 'google' | 'microsoft';

export interface UseSignInWithTosGateResult {
  signIn: (provider: AuthProvider) => void;
  authError: string | null;
  showTosConsent: boolean;
  onTosAccepted: () => void;
  onTosCancel: () => void;
}

/**
 * Extracts the consent-gate sign-in logic from StorageSection for reuse in
 * InvitationBanner. Cache-before-sign-in ordering matches the existing
 * StorageSection.handleTosAccepted — verified against StorageSection.tsx:187–191.
 */
export function useSignInWithTosGate(): UseSignInWithTosGateResult {
  const { signInWithGoogle, signInWithMicrosoft } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [showTosConsent, setShowTosConsent] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<AuthProvider | null>(null);

  async function executeSignIn(provider: AuthProvider): Promise<void> {
    setAuthError(null);
    try {
      if (provider === 'google') await signInWithGoogle();
      else await signInWithMicrosoft();
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e &&
        typeof (e as { code: unknown }).code === 'string'
          ? (e as { code: string }).code : '';
      if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
        setAuthError(
          'Your browser blocked the sign-in popup. Please allow popups for this site and try again.',
        );
      } else if (code === 'auth/popup-closed-by-user') {
        setAuthError(null);
      } else {
        setAuthError('Sign-in failed. Please try again.');
      }
    }
  }

  function signIn(provider: AuthProvider): void {
    setAuthError(null);
    if (!isTosAcceptedLocally()) {
      setPendingProvider(provider);
      setShowTosConsent(true);
      return;
    }
    void executeSignIn(provider);
  }

  function onTosAccepted(): void {
    setShowTosConsent(false);
    cacheTosAcceptance();   // matches existing StorageSection order
    if (pendingProvider) {
      void executeSignIn(pendingProvider);
      setPendingProvider(null);
    }
  }

  function onTosCancel(): void {
    setShowTosConsent(false);
    setPendingProvider(null);
  }

  return { signIn, authError, showTosConsent, onTosAccepted, onTosCancel };
}
