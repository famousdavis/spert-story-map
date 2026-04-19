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
import { auth, db, isFirebaseAvailable } from './firebase';
import { signOutCleanup } from './signOutCleanup';
import {
  isTosAcceptedLocally,
  isTosAcceptedInFirestore,
  writeTosAcceptance,
  cacheTosAcceptance,
  clearTosAcceptance,
} from './tosHelpers';

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
        // Upsert profile on sign-in
        try {
          await setDoc(
            doc(db, 'spertstorymap_profiles', firebaseUser.uid),
            {
              displayName: firebaseUser.displayName || '',
              email: firebaseUser.email || '',
              lastLogin: serverTimestamp(),
            },
            { merge: true },
          );
        } catch (e) {
          console.error('Failed to upsert profile:', e instanceof Error ? e.message : 'Unknown error');
        }

        // Post-auth: write ToS acceptance to Firestore if locally accepted
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
