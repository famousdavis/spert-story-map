/**
 * Data migration between localStorage and Firestore.
 *
 * migrateLocalToCloud(uid) — uploads local products to Firestore.
 * Cloud-to-local migration was removed in v0.15.0 (cloud is source of truth).
 * Use "Download All as JSON" for data portability instead.
 */

import {
  doc, getDoc, setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  loadProductIndex, loadProduct, loadPreferences,
  appendChangeLogEntry,
} from './storage';

const PROJECTS_COL = 'spertstorymap_projects';
const SETTINGS_COL = 'spertstorymap_settings';

/**
 * Recursively strip undefined values for Firestore.
 * Duplicated from storageDriver.js to keep migration self-contained.
 */
function sanitize(obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (typeof obj !== 'object') return obj;
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = sanitize(value);
    }
  }
  return clean;
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
export async function migrateLocalToCloud(uid) {
  const index = loadProductIndex();
  let uploaded = 0;
  let skipped = 0;

  for (const entry of index) {
    const product = loadProduct(entry.id);
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
      const existing = await getDoc(doc(db, PROJECTS_COL, targetId));
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
    } catch (collisionErr) {
      // PERMISSION_DENIED means doc exists but user isn't a member,
      // or doc doesn't exist (rule can't evaluate resource.data).
      // Generate a new ID to avoid collision.
      targetId = crypto.randomUUID();
    }

    // Append migration event to changelog
    const updatedProduct = { ...product, id: targetId };
    updatedProduct._changeLog = appendChangeLogEntry(updatedProduct, { op: 'cloud-migration', uid });

    const { id, ...rest } = updatedProduct;
    await setDoc(doc(db, PROJECTS_COL, id), {
      ...sanitize(rest),
      owner: uid,
      members: { [uid]: 'owner' },
      updatedAt: serverTimestamp(),
    });

    uploaded++;
  }

  // Migrate preferences
  const prefs = loadPreferences();
  if (prefs && Object.keys(prefs).length > 0) {
    await setDoc(doc(db, SETTINGS_COL, uid), sanitize(prefs));
  }

  return { uploaded, skipped };
}

