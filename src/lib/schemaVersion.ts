// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The single place that decides what a persisted `schemaVersion` means.
 *
 * ⚠️ WHY THIS MODULE EXISTS. Until v0.52.5 four expressions answered that question
 * and two of them disagreed:
 *
 *   migrateToV2's own guard   `(sv || 1) >= 2`      -> run the waterfall if false
 *   local  (storage.ts)       `(sv || 1) < 2`
 *   import (importExport.ts)  `!sv || sv < 2`
 *   cloud  (firestoreDriver)  no guard at all — called unconditionally
 *
 * `x < 2` and `!(x >= 2)` are NOT equivalent for a value that is not comparable to
 * a number: BOTH are false for `'abc'` and `{}`. So for exactly those two shapes the
 * cloud ran the **destructive** v1→v2 waterfall — which zeroes `progressHistory` for
 * every rib with no allocations — while local and import skipped it. Measured across
 * seventeen values, those two were the only divergences.
 *
 * ⚠️ Do not re-derive this predicate at a call site. Import it. That is the whole
 * point of the module, and the divergence above is what it cost last time.
 *
 * THE RULE, and why it is "do not migrate" rather than "migrate":
 *   - A **falsy** value (absent, `null`, `0`, `''`, `NaN`, `false`) is a genuine
 *     pre-`schemaVersion` product. That is v1 and it migrates — every one of the four
 *     expressions above already agreed on this, so nothing changes.
 *   - A value that reads as a **finite number** migrates iff it is below the current
 *     version, exactly as before.
 *   - A **truthy, non-numeric** value is NOT a v1 product — a real v1 product has the
 *     field ABSENT, which is the falsy case above. It is a corrupted or hand-edited
 *     field, and the migration it would trigger is irreversible. So it is left alone.
 *     This moves the cloud onto the behaviour local and import already had, which is
 *     the non-destructive direction and the smaller change.
 */

import { SCHEMA_VERSION } from './constants';

/**
 * Read a value as a version number, or `null` when it does not read as one.
 *
 * ⚠️ `Number()` THROWS on a `Symbol`, and on any object whose `valueOf`/`toString`
 * cannot produce a primitive (e.g. `Object.create(null)`). Neither survives a JSON
 * round-trip, so neither arrives from Firestore or `localStorage` — but this predicate
 * runs inside `migrateToV2`, which the cloud calls inside `snap.forEach`, where a
 * throw takes down the ENTIRE project-index load rather than one project. Being
 * genuinely total is the property that matters here, so the conversion is guarded
 * rather than assumed.
 */
function asVersionNumber(value: unknown): number | null {
  let n: number;
  try {
    n = Number(value);
  } catch {
    return null;
  }
  return Number.isFinite(n) ? n : null;
}

/**
 * True when the v1→v2 waterfall should run for this persisted `schemaVersion`.
 * Total: every input returns a boolean, none throws.
 */
export function needsV2Migration(schemaVersion: unknown): boolean {
  // Falsy means the field predates `schemaVersion` entirely — that is v1.
  if (!schemaVersion) return true;
  // Truthy but not a number: not v1, and the migration is destructive. Leave it.
  const n = asVersionNumber(schemaVersion);
  return n !== null && n < SCHEMA_VERSION;
}

/**
 * Normalise a `schemaVersion` for storage, non-destructively.
 *
 * Only a **truthy, non-numeric** value is replaced — the exact set `needsV2Migration`
 * cannot interpret — and it becomes the current version, which is the same decision
 * `needsV2Migration` makes for it ("not a v1 product, do not migrate"), written down
 * so the state stops being ambiguous.
 *
 * ⚠️ A falsy value is returned UNCHANGED and must stay that way. Normalising `null`
 * or `0` up to the current version would tell the migration gate the product is
 * already v2 and a genuine legacy product would never migrate.
 *
 * ⚠️ An interpretable value is returned UNCHANGED rather than coerced. `'1'` is left
 * as the string it is: `needsV2Migration` already reads it correctly, and rewriting it
 * would make the validator report a repaired field on every load of a product that has
 * nothing wrong with it.
 */
export function normalizeSchemaVersion(schemaVersion: unknown): unknown {
  if (!schemaVersion) return schemaVersion;
  return asVersionNumber(schemaVersion) !== null ? schemaVersion : SCHEMA_VERSION;
}
