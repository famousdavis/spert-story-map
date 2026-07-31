// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

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
  ? (getApps()[0] ?? initializeApp(firebaseConfig))
  : null;

// memoryLocalCache avoids stale security rule decisions that persist in IndexedDB
// and cause "Missing or insufficient permissions" errors after rules change.
// See ARCHITECTURE.md §21.5.
export const db: Firestore | null = app
  ? initializeFirestore(app, { localCache: memoryLocalCache() })
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;

/**
 * Firebase Functions instance (us-central1). May be null when Firebase is
 * not configured. Imported by `lib/callables.ts`, which wraps each callable
 * with a `requireFunctions()` guard (Lesson 61).
 */
export const functionsInstance = app ? getFunctions(app, 'us-central1') : null;

/** True when Firebase SDK is initialized and available. */
export const isFirebaseAvailable = isFirebaseConfigured && app !== null;
