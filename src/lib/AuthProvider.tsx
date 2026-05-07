// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseAvailable, getClaimPendingInvitations } from './firebase';
import { signOutCleanup } from './signOutCleanup';
import {
  isTosAcceptedLocally,
  isTosAcceptedInFirestore,
  writeTosAcceptance,
  cacheTosAcceptance,
  clearTosAcceptance,
} from './tosHelpers';
import { denormalizeLastFirst } from './auth-name';
import { sanitizeForFirestore } from './firestoreUtils';
import { INVITATIONS_ENABLED } from './featureFlags';
import type { SpertModelsChangedDetail } from '../types';

/**
 * Fire-and-forget: call claimPendingInvitations and dispatch spert:models-changed
 * if invitations were claimed.
 *
 * Matches AHP's AuthContext.tsx:147-167 pattern:
 *  - Module-level (stable reference, no per-render closure)
 *  - Takes firebaseUser as a parameter
 *  - emailVerified guard INSIDE this function (Lesson 26):
 *      → prevents failed-precondition for MS personal-account users
 *      → ToS check in the caller is UNAFFECTED (runs for all users)
 */
function claimPendingInvitationsAndNotify(firebaseUser: User): void {
  if (!INVITATIONS_ENABLED) return;
  if (!firebaseUser.emailVerified) return;
  const callable = getClaimPendingInvitations();
  if (!callable) return;
  void callable({})
    .then((res) => {
      const claimed = res.data?.claimed ?? [];
      if (claimed.length > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent<SpertModelsChangedDetail>('spert:models-changed', {
            detail: { claimed },
          }),
        );
      }
    })
    .catch((err) => {
      const code = (err as { code?: string }).code ?? 'unknown';
      // emailVerified guard prevents failed-precondition in normal flows.
      console.error('claimPendingInvitations failed:', code);
    });
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  firebaseAvailable: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseAvailable); // No loading if Firebase not configured

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(false);

      if (firebaseUser && db) {
        // ── Profile dual-write ──────────────────────────────────────────────
        const normalizedName = denormalizeLastFirst(firebaseUser.displayName || '');
        const normalizedEmail = (firebaseUser.email || '').toLowerCase();
        const photoURL = firebaseUser.photoURL ?? null;
        const profilePayload = {
          displayName: normalizedName,
          email: normalizedEmail,
          photoURL,
        };
        try {
          // Per-app profile (Lesson 29: sentinel merged after sanitize)
          await setDoc(
            doc(db, 'spertstorymap_profiles', firebaseUser.uid),
            { ...sanitizeForFirestore(profilePayload), updatedAt: serverTimestamp() },
            { merge: true },
          );
          // Suite-wide profile (cross-app invitation email lookup)
          await setDoc(
            doc(db, 'spertsuite_profiles', firebaseUser.uid),
            { ...sanitizeForFirestore(profilePayload), updatedAt: serverTimestamp() },
            { merge: true },
          );
        } catch (e) {
          console.error('Failed to upsert profile:', e instanceof Error ? e.message : 'Unknown error');
        }

        // ── ToS check ───────────────────────────────────────────────────────
        // UNCHANGED from v0.26.4 — do NOT add any emailVerified wrapper here.
        // ToS validation runs for ALL authenticated users regardless of verification.
        // The emailVerified guard lives inside claimPendingInvitationsAndNotify.
        if (isTosAcceptedLocally()) {
          try {
            const providerData = firebaseUser.providerData?.[0];
            const authProvider = providerData?.providerId || 'unknown';
            await writeTosAcceptance(firebaseUser.uid, authProvider);
          } catch (e) {
            console.error('Failed to write ToS acceptance:', e instanceof Error ? e.message : 'Unknown error');
          }
        } else {
          // Returning user check: verify ToS acceptance in Firestore
          try {
            const accepted = await isTosAcceptedInFirestore(firebaseUser.uid);
            if (accepted) {
              cacheTosAcceptance();
            } else {
              // ToS outdated or missing — sign out
              clearTosAcceptance();
              await signOutCleanup(null);
              return;
            }
          } catch (e) {
            console.error('Failed to check ToS acceptance:', e instanceof Error ? e.message : 'Unknown error');
            // Cannot verify ToS — sign out to prevent bypass
            clearTosAcceptance();
            await signOutCleanup(null);
            return;
          }
        }

        // ── Claim pending invitations ───────────────────────────────────────
        // Runs AFTER ToS check succeeds. Stale-ToS/error paths return above.
        // Covers both fresh sign-in and cached-session page load.
        claimPendingInvitationsAndNotify(firebaseUser);
      }

      setUser(firebaseUser);
    });
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInWithMicrosoft = async () => {
    if (!auth) return;
    const provider = new OAuthProvider('microsoft.com');
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    if (!auth) return;
    await signOutCleanup(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      firebaseAvailable: isFirebaseAvailable,
      signInWithGoogle,
      signInWithMicrosoft,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- co-located hook for provider
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
