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
  doc, getDoc, setDoc, getDocFromServer, getDocsFromServer, FieldPath, deleteField,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Firestore } from 'firebase/firestore';
import {
  loadProductIndex, loadProduct, loadPreferences,
  appendChangeLogEntry,
} from './storage';
import { sanitizeForFirestore } from './firestoreUtils';
import { PROJECTS_COL, SETTINGS_COL } from './firestoreCollections';
import { projectsMembersQuery } from './projectsMembersQuery';
import { sortByOrder } from './sortByOrder';
import { addEntry, buildMaskedWrite, type PrefEntry } from './prefEntries';
import type { UserSettings } from '../types';

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
  // v0.55.14 (R63): the cloud's tile order and settings, read BEFORE any product is written and
  // from the server: offline the members query resolves empty from cache without throwing, which
  // would put every uploaded product ahead of the cloud's. A failed read stops the upload here.
  const settingsRef = doc(requireDb(), SETTINGS_COL, uid);
  const settingsSnap = await getDocFromServer(settingsRef);
  const cloudPrefs: UserSettings = settingsSnap.exists() ? settingsSnap.data() : {};
  const cloudList = await getDocsFromServer(projectsMembersQuery(requireDb(), uid));
  const cloudTiles = sortByOrder(cloudList.docs.map(d => ({ id: d.id })), cloudPrefs.projectOrder).map(t => t.id);

  // Explicit 'local' overrides — migration always reads from the anonymous-
  // session namespace. At sign-in the active namespace becomes the uid, but
  // the user's pre-sign-in projects live at rp:local:*, not rp:{uid}:*.
  const index = loadProductIndex('local');
  const localPrefs = loadPreferences('local');
  const targetIds = new Map<string, string>();
  let uploaded = 0;
  let skipped = 0;

  for (const entry of index) {
    const product = loadProduct(entry.id, 'local', false);
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

    targetIds.set(entry.id, id);
    uploaded++;
  }

  await setDoc(settingsRef, ...uploadedSettings(cloudPrefs, localPrefs, cloudTiles, sortByOrder(index, localPrefs.projectOrder), targetIds));
  return { uploaded, skipped };
}

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * The upload's one masked settings write (R63, R64). The tile order: the cloud's tiles as the
 * dashboard shows them, then the uploaded products in this browser's tile order. The export name,
 * identifier and caution switch: this browser's value only where the cloud has none, so the cloud
 * keeps every value it has. Masked, so nothing else in the document changes. Built as entries
 * through the drivers' own rules (`addEntry`, `buildMaskedWrite`), so one mask builder serves both.
 */
function uploadedSettings(
  cloud: UserSettings, local: UserSettings, cloudTiles: string[],
  localTiles: { id: string }[], targetIds: Map<string, string>,
): [Record<string, unknown>, { mergeFields: FieldPath[] }] {
  const order = [...cloudTiles];
  for (const tile of localTiles) {
    const id = targetIds.get(tile.id);
    if (id !== undefined && !order.includes(id)) order.push(id);
  }
  let entries: PrefEntry[] = addEntry([], { path: ['projectOrder'], value: order });
  for (const key of ['exportName', 'exportId'] as const) {
    if (isBlank(cloud[key]) && !isBlank(local[key])) entries = addEntry(entries, { path: [key], value: local[key] });
  }
  if (cloud.suppressLocalStorageWarning === undefined && typeof local.suppressLocalStorageWarning === 'boolean') {
    entries = addEntry(entries, { path: ['suppressLocalStorageWarning'], value: local.suppressLocalStorageWarning });
  }
  const { data, fields } = buildMaskedWrite(entries, sanitizeForFirestore, deleteField, segs => new FieldPath(...segs));
  return [data, { mergeFields: fields }];
}

