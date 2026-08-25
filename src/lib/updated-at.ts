// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Normalizes a Firestore `updatedAt` value to an ISO 8601 string.
 *
 * WHY THIS EXISTS — and why the failure here LOOKS DIFFERENT from CFD's.
 * ---------------------------------------------------------------------
 * CFD and Forecaster carry a near-identical classifier because `date-fns`
 * `format()` throws `RangeError` on an Invalid Date, so a bad shape CRASHES the
 * row. This app never crashes: `ProjectCard` rendered
 * `(parseDate(p.updatedAt) || new Date()).toLocaleDateString()`, and
 * `ProductLayout`'s "Saved ..." line feeds the same value to
 * `formatRelativeTime`. So the bad shapes did not throw — they RENDERED, and
 * two of the three ways they rendered were lies:
 *
 *   - `{seconds,nanoseconds}`, `{_seconds,_nanoseconds}`, the persisted
 *     `{_methodName:'serverTimestamp'}` sentinel, `{}` and any string
 *     `Date.parse` rejects all produce an Invalid Date. `||` CANNOT catch it,
 *     because an Invalid Date is a truthy object. The card printed the literal
 *     string "Invalid Date".
 *   - `undefined`, `null` and `''` are falsy, so `parseDate` returned null and
 *     `|| new Date()` substituted TODAY. A project not touched in months
 *     displayed today's date, indistinguishable from the truth by the person
 *     reading it.
 *
 * The second is the worse defect and the reason this file exists: a wrong date
 * that looks right is not a degraded render, it is fabricated data. Measured
 * against the real `parseDate`, 12 inputs: 4 correct, 5 "Invalid Date",
 * 3 fabricating today.
 *
 * NOT A PRODUCER OF THE CORRUPT SHAPE, unlike Forecaster. Every write site here
 * stamps a fresh `new Date().toISOString()` (`firestoreDriver.ts` and
 * `migration.ts`, converted in Brief 19 and pinned by `updatedAtIso.test.ts`),
 * so a degraded value read from a document is never written back out. The
 * residual exposure is entirely (a) documents written before that conversion
 * and (b) entry points that bypass the Firestore converter — see below.
 *
 * THE REACHABLE PATH IS THE IMPORT BOUNDARY, not a hypothetical document.
 * `Product.updatedAt` was declared a non-optional `string`, but
 * `validateProduct` requires only `id`, `name` and `themes`, and
 * `importProductFromJSON` backfills `sizeMapping`/`releases`/`sprints` and NOT
 * `updatedAt`. A JSON project with no `updatedAt` imports cleanly and renders
 * today's date. The type was a lie at that boundary; `updatedAt` is optional
 * now, and callers must branch.
 *
 * THIS IS NOT A PORT OF `spert-admin-tool`'s `normalizeUpdatedAt`.
 * That one carries `import 'server-only'` and matches `instanceof Timestamp`
 * against firebase-admin, which does not match a firebase/firestore client
 * Timestamp and cannot be bundled for the browser at all. This is a client-side
 * equivalent that duck-types instead, ported from `spert-cfd`'s
 * `src/lib/updated-at.ts`. Its CLASSIFICATION is deliberately identical across
 * all three, so that a document rendered in any app and the same document
 * scanned by the admin tool agree about whether an instant exists.
 *
 * RETURNS `undefined`, NEVER `''` AND NEVER `null`, for a shape carrying no
 * recoverable instant. `''` is itself a fabricating shape here (falsy, so it
 * reached the `new Date()` substitution), and `null` would reach the document
 * through write paths that strip only `undefined`. The caller renders a
 * fallback for `undefined`; it must never substitute the current date or
 * `createdAt`, both of which manufacture data with the wrong meaning.
 */
export function normalizeUpdatedAt(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;

  // The unresolved serverTimestamp() sentinel, persisted as data. MUST precede
  // the object handling below, which would otherwise reach it by a less
  // explicit route — and this shape is the only one that has ever leaked to
  // production in this suite (Scheduler Q#32).
  if (isServerTimestampSentinel(value)) return undefined;

  if (typeof value === 'number') return fromMillis(value);
  if (typeof value === 'string') return fromDateString(value);
  if (typeof value === 'object') return fromTimestampLike(value);
  return undefined;
}

/**
 * A string `Date.parse` rejects has no instant to encode and must take the
 * fallback, not pass through. `''` belongs here too: it is falsy, so the old
 * render substituted today for it rather than printing "Invalid Date".
 */
function fromDateString(value: string): string | undefined {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : fromMillis(ms);
}

/** The three object spellings that carry a real instant. */
function fromTimestampLike(value: object): string | undefined {
  // A client `Timestamp` — duck-typed, because `instanceof` against the
  // firebase/firestore class would not match an admin-SDK-shaped object and
  // pulls a bundle dependency into a pure function for no gain.
  const withToDate = value as { toDate?: unknown };
  if (typeof withToDate.toDate === 'function') {
    const d = (withToDate.toDate as () => Date)();
    return d instanceof Date && !Number.isNaN(d.getTime())
      ? d.toISOString()
      : undefined;
  }

  // The two plain-map spellings, checked in SEPARATE branches because they have
  // distinct producers and either can be independently forgotten: `_seconds` is
  // the Admin SDK's serialization — reachable here through the suite invitation
  // Cloud Functions, which write this collection outside the app; `seconds` is
  // what a client-SDK recursive sanitizer rebuilds a Timestamp into via
  // Object.entries. Both carry a real instant and must NOT take the fallback.
  const m = value as {
    _seconds?: unknown; _nanoseconds?: unknown;
    seconds?: unknown; nanoseconds?: unknown;
  };
  if (typeof m._seconds === 'number') return fromSeconds(m._seconds, m._nanoseconds);
  if (typeof m.seconds === 'number') return fromSeconds(m.seconds, m.nanoseconds);
  return undefined;
}

/** The `{ _methodName: 'serverTimestamp' }` map an unresolved sentinel leaves behind. */
function isServerTimestampSentinel(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)['_methodName'] === 'serverTimestamp'
  );
}

/** Guarded — `new Date(NaN).toISOString()` throws, which would defeat the point. */
function fromMillis(ms: number): string | undefined {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function fromSeconds(seconds: number, nanoseconds: unknown): string | undefined {
  const nanos = typeof nanoseconds === 'number' && Number.isFinite(nanoseconds)
    ? nanoseconds
    : 0;
  return fromMillis(seconds * 1000 + Math.floor(nanos / 1e6));
}
