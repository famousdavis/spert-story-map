// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Data migration between localStorage and Firestore.
 *
 * migrateLocalToCloud(uid) — uploads local products to Firestore, skipping any an earlier upload put there.
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
import { indexCloud, findEarlierUpload, sharedOriginKeys, type CloudRow } from './uploadRecognition';

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

/** A local product the upload left in this browser because the cloud already holds it. */
export interface UploadSkip { localId: string; name: string; cloudName: string }
/** What one upload did: the local ids it uploaded, what it skipped, and how many it could not read. */
export interface UploadOutcome { uploadedIds: string[]; skipped: UploadSkip[]; unreadable: number }

/**
 * Upload the local products to Firestore, each under a new id.
 *
 * A product an earlier upload already put in the cloud is skipped (v0.55.15, R67): decided from the
 * server list in `uploadRecognition.ts`, which replaced a per-product get of the product's own id
 * (that get answered only for a product the user is a member of, which the list holds anyway). Every
 * upload's `cloud-migration` entry names the local id it came from (`source`), which is what lets a
 * later upload recognise it.
 *
 * Local data is left in place as a backup.
 */
export async function migrateLocalToCloud(uid: string): Promise<UploadOutcome> {
  // v0.55.14 (R63): the cloud's tile order and settings, read BEFORE any product is written and
  // from the server: offline the members query resolves empty from cache without throwing, which
  // would put every uploaded product ahead of the cloud's. A failed read stops the upload here.
  const settingsRef = doc(requireDb(), SETTINGS_COL, uid);
  const settingsSnap = await getDocFromServer(settingsRef);
  const cloudPrefs: UserSettings = settingsSnap.exists() ? settingsSnap.data() : {};
  const cloudList = await getDocsFromServer(projectsMembersQuery(requireDb(), uid));
  const cloudTiles = sortByOrder(cloudList.docs.map(d => ({ id: d.id })), cloudPrefs.projectOrder).map(t => t.id);
  const cloud = indexCloud(cloudList.docs.map((d): CloudRow => ({ id: d.id, data: d.data() })), uid);

  // Explicit 'local' overrides — migration always reads from the anonymous-
  // session namespace. At sign-in the active namespace becomes the uid, but
  // the user's pre-sign-in projects live at rp:local:*, not rp:{uid}:*.
  const index = loadProductIndex('local');
  const localPrefs = loadPreferences('local');
  const loaded = index.map(entry => ({ entry, product: loadProduct(entry.id, 'local', false) }));
  const shared = sharedOriginKeys(loaded.map(l => l.product));
  const targetIds = new Map<string, string>();
  const outcome: UploadOutcome = { uploadedIds: [], skipped: [], unreadable: 0 };

  for (const { entry, product } of loaded) {
    if (!product) {
      outcome.unreadable++;
      continue;
    }
    const earlier = findEarlierUpload(product, cloud, shared);
    if (earlier) {
      outcome.skipped.push({ localId: product.id, name: product.name, cloudName: earlier.cloudName });
      continue;
    }

    // R-2: the entry names the local id it came from; nothing else about the product changes.
    const uploaded = { ...product, id: crypto.randomUUID(), _changeLog: appendChangeLogEntry(product, { op: 'cloud-migration', uid, source: product.id }) };
    const { id, ...rest } = uploaded;
    await setDoc(doc(requireDb(), PROJECTS_COL, id), {
      ...sanitizeForFirestore(rest),
      owner: uid,
      members: { [uid]: 'owner' },
      updatedAt: new Date().toISOString(),
    });

    targetIds.set(entry.id, id);
    outcome.uploadedIds.push(entry.id);
  }

  await setDoc(settingsRef, ...uploadedSettings(cloudPrefs, localPrefs, cloudTiles, sortByOrder(index, localPrefs.projectOrder), targetIds));
  return outcome;
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

