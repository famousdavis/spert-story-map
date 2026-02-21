import { initializeApp, getApps } from 'firebase/app';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

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

const app = isFirebaseConfigured
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0])
  : null;

// memoryLocalCache avoids stale security rule decisions that persist in IndexedDB
// and cause "Missing or insufficient permissions" errors after rules change.
// See ARCHITECTURE.md §21.5.
export const db = app
  ? initializeFirestore(app, { localCache: memoryLocalCache() })
  : null;

export const auth = app ? getAuth(app) : null;

/** True when Firebase SDK is initialized and available. */
export const isFirebaseAvailable = isFirebaseConfigured && app !== null;
