// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * One-time migration from un-namespaced keys (rp_product_*, rp_products_index,
 * rp_app_preferences) to the v0.33.0 namespaced shape (rp:local:*).
 *
 * Designed to run before React mounts, behind a top-level await in main.tsx.
 * Two locking modes:
 *   - navigator.locks (modern browsers): exclusive lock across tabs
 *   - timestamp fallback (Safari < 16, etc.): self-expiring 30s lock
 *
 * On corrupt input the legacy key is preserved (not deleted) and a console
 * warning is emitted; the migration moves on to the next key. This is
 * defensive — academic-integrity data should not silently disappear.
 *
 * rp_workspace_id is never touched (per-browser identity token).
 */

const MIGRATION_DONE_KEY = '_rp:migration-v1-done';
const MIGRATION_LOCK_KEY = '_rp:migration-in-progress';
const LOCK_NAME = '_rp:migration-v1-lock';
const LOCK_TIMEOUT_MS = 30_000;

type IndexEntry = { id: string; name?: string; updatedAt?: string } | string;

function runMigration(): void {
  // Index — tolerate corruption by falling back to scanning rp_product_*
  // keys directly. Corruption can happen if a previous version crashed
  // mid-write or if a user pasted JSON into devtools.
  type ParsedIndex = { entries: IndexEntry[]; corrupt: boolean };
  const parseOldIndex = (): ParsedIndex => {
    try {
      const raw = localStorage.getItem('rp_products_index');
      const parsed = JSON.parse(raw ?? '[]');
      if (!Array.isArray(parsed)) return { entries: [], corrupt: true };
      return { entries: parsed, corrupt: false };
    } catch {
      return { entries: [], corrupt: true };
    }
  };
  const { entries: indexEntries, corrupt: corruptOldIndex } = parseOldIndex();

  let ids: string[];
  let newIndexEntries: { id: string; name?: string; updatedAt?: string }[];
  if (corruptOldIndex) {
    const orphanKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('rp_product_') && !k.startsWith('rp:')) orphanKeys.push(k);
    }
    ids = orphanKeys.map(k => k.replace('rp_product_', ''));
    newIndexEntries = ids.map(id => {
      try {
        const raw = localStorage.getItem(`rp_product_${id}`);
        const p = raw ? JSON.parse(raw) : null;
        return { id, name: p?.name ?? 'Unknown', updatedAt: p?.updatedAt };
      } catch {
        return { id, name: 'Unknown' };
      }
    });
  } else {
    ids = indexEntries.map(e => (typeof e === 'string' ? e : e.id));
    newIndexEntries = indexEntries.map(e =>
      typeof e === 'string' ? { id: e, name: 'Unknown' } : e,
    );
  }

  for (const id of ids) {
    const oldKey = `rp_product_${id}`;
    const newKey = `rp:local:product_${id}`;
    const raw = localStorage.getItem(oldKey);
    if (!raw) {
      // Already migrated (idempotent run) — skip silently if newKey is present.
      if (localStorage.getItem(newKey)) continue;
      console.warn(`Migration: product ${id} not found — skipping`);
      continue;
    }
    // Pre-parse validation. On failure, the old key is preserved (academic
    // integrity data must not be silently dropped) and we move on.
    try {
      JSON.parse(raw);
    } catch {
      console.warn(`Migration: product ${id} corrupt JSON — skipping; old key preserved`);
      continue;
    }
    localStorage.setItem(newKey, raw); // byte-preserving copy
    localStorage.removeItem(oldKey);
  }

  // Preferences — separate from products. CB1 fix: parsedOk gates BOTH the
  // write and the remove, so corrupt prefs are preserved rather than purged.
  const oldPrefs = localStorage.getItem('rp_app_preferences');
  if (oldPrefs) {
    let parsedOk = false;
    try {
      JSON.parse(oldPrefs);
      parsedOk = true;
    } catch {
      console.warn('Migration: rp_app_preferences corrupt — skipping; old key preserved');
    }
    if (parsedOk) {
      if (!localStorage.getItem('rp:local:preferences')) {
        localStorage.setItem('rp:local:preferences', oldPrefs);
      }
      localStorage.removeItem('rp_app_preferences');
    }
  }

  // Index migrated LAST so a crash mid-product-loop leaves a recoverable
  // (uncorrupted old) index for the next run.
  localStorage.setItem('rp:local:products_index', JSON.stringify(newIndexEntries));
  localStorage.removeItem('rp_products_index');

  localStorage.setItem(MIGRATION_DONE_KEY, '1');
}

interface LocksLike {
  request: (
    name: string,
    cb: (lock: unknown) => Promise<void> | void,
  ) => Promise<void>;
}

export async function runLegacyMigration(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return;

  // Web Locks API path — exclusive across tabs of the same origin.
  const nav = (typeof navigator !== 'undefined' ? navigator : null) as
    | (Navigator & { locks?: LocksLike })
    | null;
  if (nav && nav.locks && typeof nav.locks.request === 'function') {
    await nav.locks.request(LOCK_NAME, async () => {
      if (localStorage.getItem(MIGRATION_DONE_KEY)) return;
      runMigration();
    });
    return;
  }

  // Fallback: timestamp lock. If another tab is mid-migration (lock <30s old),
  // wait it out by polling for the done marker.
  let lockData: { ts: number } | null = null;
  try {
    lockData = JSON.parse(localStorage.getItem(MIGRATION_LOCK_KEY) ?? 'null');
  } catch {
    lockData = null;
  }
  if (lockData && Date.now() - lockData.ts < LOCK_TIMEOUT_MS) {
    await new Promise<void>(resolve => {
      const interval = setInterval(() => {
        const done = localStorage.getItem(MIGRATION_DONE_KEY);
        let cur: { ts: number } | null = null;
        try {
          cur = JSON.parse(localStorage.getItem(MIGRATION_LOCK_KEY) ?? 'null');
        } catch {
          cur = null;
        }
        if (done || !cur || Date.now() - cur.ts >= LOCK_TIMEOUT_MS) {
          clearInterval(interval);
          resolve();
        }
      }, 500);
    });
    if (localStorage.getItem(MIGRATION_DONE_KEY)) return;
  }

  localStorage.setItem(MIGRATION_LOCK_KEY, JSON.stringify({ ts: Date.now() }));
  try {
    runMigration();
  } finally {
    localStorage.removeItem(MIGRATION_LOCK_KEY);
  }
}
