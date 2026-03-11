// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import {
  TOS_VERSION,
  TOS_ACCEPTED_VERSION_KEY,
  TOS_APP_ID,
} from './tosConstants';

const USERS_COLLECTION = 'users';

/** Check if ToS is accepted in localStorage. */
export function isTosAcceptedLocally() {
  return localStorage.getItem(TOS_ACCEPTED_VERSION_KEY) === TOS_VERSION;
}

/** Cache ToS acceptance in localStorage. */
export function cacheTosAcceptance() {
  localStorage.setItem(TOS_ACCEPTED_VERSION_KEY, TOS_VERSION);
}

/** Clear cached ToS acceptance from localStorage. */
export function clearTosAcceptance() {
  localStorage.removeItem(TOS_ACCEPTED_VERSION_KEY);
}

/**
 * Check Firestore for ToS acceptance.
 * Returns true if the user has accepted the current version.
 */
export async function isTosAcceptedInFirestore(uid) {
  if (!db || !uid) return false;
  try {
    const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
    if (!snap.exists()) return false;
    return snap.data().tosVersion === TOS_VERSION;
  } catch {
    return false;
  }
}

/**
 * Write ToS acceptance to Firestore.
 * - If doc missing: write all fields including appId.
 * - If doc exists but tosVersion differs: write updated fields WITHOUT appId
 *   (preserves the first-acceptance app).
 * - If doc exists and tosVersion matches: skip write, just cache locally.
 */
export async function writeTosAcceptance(uid, authProvider) {
  if (!db || !uid) return;

  const ref = doc(db, USERS_COLLECTION, uid);

  try {
    const snap = await getDoc(ref);
    const exists = snap.exists();

    if (exists && snap.data().tosVersion === TOS_VERSION) {
      // Already current — just cache locally
      cacheTosAcceptance();
      return;
    }

    const data = {
      acceptedAt: serverTimestamp(),
      tosVersion: TOS_VERSION,
      privacyPolicyVersion: TOS_VERSION,
      authProvider: authProvider || 'unknown',
    };

    if (!exists) {
      // First acceptance — include appId
      data.appId = TOS_APP_ID;
    }
    // If exists but outdated: omit appId to preserve original

    await setDoc(ref, data, { merge: true });
    cacheTosAcceptance();
  } catch (e) {
    console.error('Failed to write ToS acceptance:', e);
  }
}
