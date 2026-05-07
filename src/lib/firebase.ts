// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type {
  SendInvitationEmailInput, SendInvitationEmailResult,
  ClaimPendingInvitationsResult,
  RevokeInviteInput, RevokeInviteResult,
  ResendInviteInput, ResendInviteResult,
} from '../types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Firebase is only initialized when config is present.
 * When env vars are missing, the app operates in local-only mode.
 * The StorageProvider hides the cloud toggle in Settings when Firebase is unavailable.
 */
const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);

const app: FirebaseApp | null = isFirebaseConfigured
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0])
  : null;

// memoryLocalCache avoids stale security rule decisions that persist in IndexedDB
// and cause "Missing or insufficient permissions" errors after rules change.
// See ARCHITECTURE.md §21.5.
export const db: Firestore | null = app
  ? initializeFirestore(app, { localCache: memoryLocalCache() })
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;

const functionsInstance = app ? getFunctions(app, 'us-central1') : null;

/** True when Firebase SDK is initialized and available. */
export const isFirebaseAvailable = isFirebaseConfigured && app !== null;

// ── Lazy callable factories ─────────────────────────────────────────────────
// Each returns null when Firebase is not configured. Callers check for null.

export function getSendInvitationEmail() {
  if (!functionsInstance) return null;
  return httpsCallable<SendInvitationEmailInput, SendInvitationEmailResult>(
    functionsInstance, 'sendInvitationEmail',
  );
}

export function getClaimPendingInvitations() {
  if (!functionsInstance) return null;
  return httpsCallable<Record<string, never>, ClaimPendingInvitationsResult>(
    functionsInstance, 'claimPendingInvitations',
  );
}

export function getRevokeInvite() {
  if (!functionsInstance) return null;
  return httpsCallable<RevokeInviteInput, RevokeInviteResult>(
    functionsInstance, 'revokeInvite',
  );
}

export function getResendInvite() {
  if (!functionsInstance) return null;
  return httpsCallable<ResendInviteInput, ResendInviteResult>(
    functionsInstance, 'resendInvite',
  );
}
