// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Single-slot registry for the validator observer (Brief 10 §3a).
 *
 * `storage.ts` and `firestoreDriver.ts` call `runObserver` at their read seams.
 * Until something registers, it is a no-op — so the observer's cost, its module
 * graph and its killing power over `validateProduct.ts` are all zero unless a
 * bootstrap explicitly opts in (see `validatorObserver.initValidatorObserver`).
 *
 * ⚠️ THE SLOT IS SYNCHRONOUS ON PURPOSE. This copies the SHAPE of
 * `driverCleanupRegistry.ts` — single slot, register / clear / no-op-if-unset,
 * swallow — but NOT its types. That registry is `(fn: () => Promise<void>)` and
 * `runDriverCleanup` awaits it. `storage.loadProduct` is synchronous, so an async
 * slot there would either float a promise — whose rejection escapes both of the
 * observer's `try` levels and surfaces as an unhandled rejection — or change
 * `loadProduct`'s return type. Neither is acceptable at a load seam.
 *
 * ⚠️ Registration rule (§3a, scoped): no test listed in `vitest.stryker.config.ts`
 * ever registers. The observer's own test file may, and must `afterEach(clearObserver)`.
 * That file is kept out of `vitest.stryker.config.ts` (§7 mechanism 2), so Stryker
 * never runs it and never registers — zero new killing power by construction.
 */

import type { Product } from '../types';

export interface ObserverContext {
  /** `schemaVersion` as read from persistence, BEFORE any migration ran. */
  rawSchemaVersion: unknown;
}

export type ObserverFn = (product: Product | null, ctx: ObserverContext) => void;

let registered: ObserverFn | null = null;

export function registerObserver(fn: ObserverFn): void {
  registered = fn;
}

export function clearObserver(): void {
  registered = null;
}

/**
 * Call the registered observer for effect. Never returns a value, never throws.
 *
 * The `catch` here is a backstop against a malformed registration, NOT one of the
 * two levels §4 mandates — those live inside `observe` itself and are what keep a
 * `rejected` product distinguishable from an observer failure. If this one ever
 * fires, the observer is broken in a way its own isolation could not see, so it
 * reports rather than swallowing silently.
 */
export function runObserver(product: Product | null, ctx: ObserverContext): void {
  if (!registered) return;
  try {
    registered(product, ctx);
  } catch (e) {
    console.error('[observer] registry backstop:', e instanceof Error ? e.name : typeof e);
  }
}
