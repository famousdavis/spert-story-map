// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.

/**
 * Recursively strip `undefined` values from an object before writing to Firestore.
 * Firestore rejects explicit `undefined` — must omit the field entirely.
 *
 * CRITICAL (Lesson 29): Firestore FieldValue sentinels (serverTimestamp(),
 * deleteField(), increment(), etc.) must NOT pass through this function.
 * Always merge them into the payload AFTER calling sanitizeForFirestore:
 *   { ...sanitizeForFirestore(data), updatedAt: serverTimestamp() }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore document data is heterogeneous; strict typing would be false safety
export function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  if (typeof obj !== 'object') return obj;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firestore document data is heterogeneous; strict typing would be false safety
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean;
}
