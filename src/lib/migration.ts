// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Data migration between localStorage and Firestore.
 *
 * migrateLocalToCloud(uid) — uploads local products to Firestore.
 * Cloud-to-local migration was removed in v0.15.0 (cloud is source of truth).
 * Use "Download All as JSON" for data portability instead.
 */

import {
  doc, getDoc, setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Firestore } from 'firebase/firestore';
import {
  loadProductIndex, loadProduct, loadPreferences,
  appendChangeLogEntry,
} from './storage';
import { sanitizeForFirestore } from './firestoreUtils';
import { PROJECTS_COL, SETTINGS_COL } from './firestoreCollections';

/** Narrow the module-level `db` — see the identical helper in firestoreDriver. */
function requireDb(): Firestore {
  if (!db) throw new Error('Cloud storage unavailable. Please try again.');
  return db;
}

/**
 * Test Firestore connectivity by reading the user's settings doc.
 * Returns true if reachable, false otherwise.
 */
export async function testCloudConnection(uid: string): Promise<boolean> {
  try {
    await getDoc(doc(requireDb(), SETTINGS_COL, uid));
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload all local products to Firestore.
 *
 * Collision handling:
 * - If a doc with the same ID exists AND user is a member → skip
 * - If a doc exists but user is NOT a member → generate new ID
 * - If doc doesn't exist → proceed
 *
 * Local data is left in place as a backup.
 *
 * @returns {{ uploaded: number, skipped: number }}
 */
export async function migrateLocalToCloud(uid: string): Promise<{ uploaded: number; skipped: number }> {
  // Explicit 'local' overrides — migration always reads from the anonymous-
  // session namespace. At sign-in the active namespace becomes the uid, but
  // the user's pre-sign-in projects live at rp:local:*, not rp:{uid}:*.
  const index = loadProductIndex('local');
  let uploaded = 0;
  let skipped = 0;

  for (const entry of index) {
    const product = loadProduct(entry.id, 'local');
    if (!product) {
      skipped++;
      continue;
    }

    let targetId = product.id;

    // Collision check: try to read the doc to see if it already exists.
    // Firestore `get` rules reference `resource.data.members`, which fails
    // with PERMISSION_DENIED for both non-existent docs (resource.data is
    // null) and docs the user isn't a member of. We treat PERMISSION_DENIED
    // as "safe to create with a new ID" to handle both cases.
    try {
      const existing = await getDoc(doc(requireDb(), PROJECTS_COL, targetId));
      if (existing.exists()) {
        const data = existing.data();
        if (data.members && data.members[uid]) {
          // User already has this project in cloud — skip
          skipped++;
          continue;
        }
        // Belongs to someone else — generate new ID
        targetId = crypto.randomUUID();
      }
    } catch {
      // PERMISSION_DENIED means doc exists but user isn't a member,
      // or doc doesn't exist (rule can't evaluate resource.data).
      // Generate a new ID to avoid collision.
      targetId = crypto.randomUUID();
    }

    // Append migration event to changelog
    const updatedProduct = { ...product, id: targetId };
    updatedProduct._changeLog = appendChangeLogEntry(updatedProduct, { op: 'cloud-migration', uid });

    const { id, ...rest } = updatedProduct;
    await setDoc(doc(requireDb(), PROJECTS_COL, id), {
      ...sanitizeForFirestore(rest),
      owner: uid,
      members: { [uid]: 'owner' },
      updatedAt: new Date().toISOString(),
    });

    uploaded++;
  }

  // Migrate preferences — read from the anonymous-session namespace, since
  // they were captured before the user signed in.
  const prefs = loadPreferences('local');
  if (prefs && Object.keys(prefs).length > 0) {
    await setDoc(doc(requireDb(), SETTINGS_COL, uid), sanitizeForFirestore(prefs), { merge: true });
  }

  return { uploaded, skipped };
}

